const ServiceRequest = require('../models/ServiceRequest');
const Quotation = require('../models/Quotation');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const requestService = require('./requestService');
const notifications = require('./notificationService');
const audit = require('./auditService');
const bookingService = require('./bookingService');
const Booking = require('../models/Booking');
const { runInTransaction } = require('../utils/transaction');

const idOf = (v) => String(v?._id ?? v);
const notFound = () => new AppError(404, 'Quotation not found', 'QUOTATION_NOT_FOUND');
const forbidden = () => new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
const PROVIDER_FIELDS = 'displayName avatarUrl ratingAvg ratingCount completedJobs verificationStatus';

/** A pending quotation past its expiry date is reported as "expired" (nothing is stored or swept). */
const effectiveStatus = (q) => (q.status === 'pending' && q.expiresAt <= new Date() ? 'expired' : q.status);

function toQuotationJSON(q) {
  const p = q.provider;
  return {
    id: String(q._id),
    request: idOf(q.request),
    provider: {
      id: idOf(p),
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      completedJobs: p.completedJobs,
      verified: p.verificationStatus === 'verified',
    },
    price: q.price,
    description: q.description,
    deliverables: [...q.deliverables],
    estimatedDuration: q.estimatedDuration,
    expiresAt: q.expiresAt,
    terms: q.terms,
    status: effectiveStatus(q),
    decidedAt: q.decidedAt,
    createdAt: q.createdAt,
  };
}

async function create(user, requestId, data) {
  const profile = await ProviderProfile.findOne({ user: user._id });
  if (!profile) throw new AppError(409, 'Create your provider profile first', 'PROFILE_REQUIRED');
  if (profile.verificationStatus !== 'verified') {
    throw new AppError(403, 'Your provider profile must be verified before you can send quotations', 'PROVIDER_NOT_VERIFIED');
  }

  const request = await ServiceRequest.findById(requestId);
  if (!request) throw new AppError(404, 'Service request not found', 'REQUEST_NOT_FOUND');
  if (idOf(request.customer) === String(user._id)) throw new AppError(403, 'You cannot quote on your own request', 'CANNOT_QUOTE_OWN_REQUEST');
  if (!requestService.canProviderSee(profile, request)) throw new AppError(404, 'Service request not found', 'REQUEST_NOT_FOUND');
  if (request.status !== 'open') throw new AppError(409, 'This request is no longer open', 'REQUEST_CLOSED');

  let quotation;
  try {
    quotation = await Quotation.create({ ...data, request: request._id, provider: profile._id });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'You have already sent a quotation for this request. Edit it instead.', 'QUOTATION_EXISTS');
    throw err;
  }

  await notifications.notify(request.customer, {
    type: 'quotation.received',
    title: `New quotation for ${request.title}`,
    body: `${profile.displayName} quoted ${quotation.price.toLocaleString('en-US')} RWF.`,
    link: `/dashboard/requests/${request._id}`,
  });
  return toQuotationJSON(await quotation.populate('provider', PROVIDER_FIELDS));
}

/** Owners and admins see every quotation (except withdrawn ones); a provider only ever sees their own. */
async function listForRequest(user, requestId) {
  const { request, role, profile } = await requestService.loadForViewer(user, requestId);
  const filter = { request: request._id };
  if (role === 'provider') filter.provider = profile._id;
  else filter.status = { $ne: 'withdrawn' };
  const docs = await Quotation.find(filter).sort({ createdAt: -1, _id: -1 }).populate('provider', PROVIDER_FIELDS);
  return docs.map(toQuotationJSON);
}

async function accept(user, quotation, request, ctx) {
  if (effectiveStatus(quotation) === 'expired') {
    throw new AppError(409, 'This quotation has expired. Ask the provider to send an updated one.', 'QUOTATION_EXPIRED');
  }
  if (quotation.status !== 'pending') throw new AppError(409, 'Only a pending quotation can be accepted', 'INVALID_STATUS_TRANSITION');

  const now = new Date();

  // Accepting changes four things that must stay consistent: the request closes, the quotation is accepted,
  // the competing quotations are declined, and the booking exists. On MongoDB with transactions (Atlas, a replica
  // set) they commit together. On a standalone server the guarded updates below make a double accept impossible
  // and the compensation step puts things back if a later step fails.
  const { accepted, booking, others } = await runInTransaction(async (session) => {
    const opts = session ? { session } : {};

    // Claim the request. Only one concurrent accept can win this guarded update.
    const claimed = await ServiceRequest.findOneAndUpdate(
      { _id: request._id, status: 'open' },
      { $set: { status: 'accepted', acceptedQuotation: quotation._id } },
      { new: true, ...opts },
    );
    if (!claimed) throw new AppError(409, 'This request is no longer open', 'REQUEST_CLOSED');

    const undo = async () => {
      if (session) return; // the transaction rolls itself back
      await Booking.deleteOne({ quotation: quotation._id });
      await Quotation.updateMany({ request: request._id, _id: { $ne: quotation._id }, status: 'rejected', decidedAt: now }, { $set: { status: 'pending' }, $unset: { decidedAt: '' } });
      await Quotation.updateOne({ _id: quotation._id, status: 'accepted', decidedAt: now }, { $set: { status: 'pending' }, $unset: { decidedAt: '' } });
      await ServiceRequest.updateOne({ _id: request._id, acceptedQuotation: quotation._id }, { $set: { status: 'open' }, $unset: { acceptedQuotation: '' } });
    };

    try {
      const won = await Quotation.findOneAndUpdate({ _id: quotation._id, status: 'pending' }, { $set: { status: 'accepted', decidedAt: now } }, { new: true, ...opts });
      if (!won) throw new AppError(409, 'This quotation is no longer available', 'INVALID_STATUS_TRANSITION');

      const created = await bookingService.createFromAcceptance({ request: claimed, quotation, actor: user, now }, opts);

      const losing = await Quotation.find({ request: request._id, _id: { $ne: quotation._id }, status: 'pending' }).populate('provider', 'user').session(session || null);
      await Quotation.updateMany({ request: request._id, _id: { $ne: quotation._id }, status: 'pending' }, { $set: { status: 'rejected', decidedAt: now } }, opts);
      return { accepted: won, booking: created, others: losing };
    } catch (err) {
      await undo();
      throw err;
    }
  });

  await audit.record({ actor: user._id, action: 'quotation.accepted', entityType: 'Quotation', entityId: quotation._id, metadata: { request: String(request._id), booking: String(booking._id), price: quotation.price }, ctx });
  await notifications.notify(quotation.provider.user, { type: 'quotation.accepted', title: `Your quotation was accepted: ${request.title}`, body: 'The customer chose your quotation. The job is ready to start.', link: `/dashboard/bookings/${booking._id}` });
  await notifications.notifyMany(others.map((o) => o.provider.user), { type: 'quotation.rejected', title: `Quotation not selected: ${request.title}`, body: 'The customer chose another provider.', link: `/dashboard/requests/${request._id}` });
  return accepted;
}

async function reject(quotation, request) {
  if (quotation.status !== 'pending') throw new AppError(409, 'Only a pending quotation can be rejected', 'INVALID_STATUS_TRANSITION');
  const rejected = await Quotation.findOneAndUpdate({ _id: quotation._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } }, { new: true });
  if (!rejected) throw new AppError(409, 'This quotation is no longer pending', 'INVALID_STATUS_TRANSITION');
  await notifications.notify(quotation.provider.user, { type: 'quotation.rejected', title: `Quotation declined: ${request.title}`, body: 'The customer declined your quotation.', link: `/dashboard/requests/${request._id}` });
  return rejected;
}

async function withdraw(quotation, request) {
  const withdrawn = await Quotation.findOneAndUpdate({ _id: quotation._id, status: 'pending' }, { $set: { status: 'withdrawn', decidedAt: new Date() } }, { new: true });
  if (!withdrawn) throw new AppError(409, 'Only a pending quotation can be withdrawn', 'INVALID_STATUS_TRANSITION');
  await notifications.notify(request.customer, { type: 'quotation.withdrawn', title: `Quotation withdrawn: ${request.title}`, body: `${quotation.provider.displayName} withdrew their quotation.`, link: `/dashboard/requests/${request._id}` });
  return withdrawn;
}

async function edit(quotation, request, data) {
  if (quotation.status !== 'pending') throw new AppError(409, 'Only a pending quotation can be edited', 'INVALID_STATUS_TRANSITION');
  if (request.status !== 'open') throw new AppError(409, 'This request is no longer open', 'REQUEST_CLOSED');
  quotation.set(data);
  await quotation.save();
  await notifications.notify(request.customer, { type: 'quotation.updated', title: `Quotation updated: ${request.title}`, body: `${quotation.provider.displayName} changed their quotation.`, link: `/dashboard/requests/${request._id}` });
  return quotation;
}

/**
 * One endpoint, three kinds of change. The transitions allowed are:
 *   pending -> accepted | rejected   (only the customer who owns the request)
 *   pending -> withdrawn             (only the provider who sent it)
 *   field edits while pending        (only the provider who sent it)
 * Anyone not involved gets 404.
 */
async function update(user, id, data, ctx) {
  const quotation = await Quotation.findById(id).populate('provider', `user ${PROVIDER_FIELDS}`);
  if (!quotation) throw notFound();
  const request = await ServiceRequest.findById(quotation.request);
  if (!request) throw notFound();

  const isRequestOwner = idOf(request.customer) === String(user._id);
  const isQuoteOwner = idOf(quotation.provider.user) === String(user._id);
  if (!isRequestOwner && !isQuoteOwner) throw notFound();

  let result;
  if (data.status === 'accepted' || data.status === 'rejected') {
    if (!isRequestOwner) throw forbidden();
    result = data.status === 'accepted' ? await accept(user, quotation, request, ctx) : await reject(quotation, request);
  } else {
    if (!isQuoteOwner) throw forbidden();
    result = data.status === 'withdrawn' ? await withdraw(quotation, request) : await edit(quotation, request, data);
  }
  return toQuotationJSON(await Quotation.findById(result._id).populate('provider', PROVIDER_FIELDS));
}

module.exports = { effectiveStatus, create, listForRequest, update };
