const ServiceRequest = require('../models/ServiceRequest');
const Quotation = require('../models/Quotation');
const ProviderProfile = require('../models/ProviderProfile');
const CompanyProfile = require('../models/CompanyProfile');
const Booking = require('../models/Booking');
const AppError = require('../utils/AppError');
const { ROLES, isAdmin: isAdminUser } = require('../utils/roles');
const storage = require('./storage');
const notifications = require('./notificationService');
const { resolveCategory } = require('./listingService');

const MAX_ATTACHMENTS = 5;
const idOf = (v) => String(v?._id ?? v);
const notFound = () => new AppError(404, 'Service request not found', 'REQUEST_NOT_FOUND');
const closed = () => new AppError(409, 'This request is no longer open', 'REQUEST_CLOSED');

const withRefs = (query) =>
  query.populate('category', 'name slug').populate('customer', 'fullName').populate('company', 'companyName');

/** A provider can work on a request if it was sent to them, or (for open requests) it is in one of their categories. */
function canProviderSee(profile, request) {
  if (request.provider) return idOf(request.provider) === idOf(profile._id);
  return profile.categories.some((c) => idOf(c) === idOf(request.category));
}

/**
 * Shapes a request for one viewer. Owners and admins see the customer's full name and company;
 * providers only see the first name. Contact details are never part of a request.
 */
function toRequestJSON(r, { viewerId, isAdmin = false, quotationCount, myQuotation, bookingId } = {}) {
  const isOwner = Boolean(viewerId) && idOf(r.customer) === String(viewerId);
  const fullName = r.customer?.fullName || '';
  return {
    id: String(r._id),
    title: r.title,
    description: r.description,
    category: { id: idOf(r.category), name: r.category?.name, slug: r.category?.slug },
    subcategory: r.subcategory,
    attachments: r.attachments.map((a) => ({ id: String(a._id), url: a.url })),
    location: { district: r.location?.district, sector: r.location?.sector },
    preferredDate: r.preferredDate,
    budgetMin: r.budgetMin,
    budgetMax: r.budgetMax,
    status: r.status,
    directed: Boolean(r.provider),
    acceptedQuotation: r.acceptedQuotation ? String(r.acceptedQuotation) : undefined,
    customer: { name: isOwner || isAdmin ? fullName : fullName.split(' ')[0] },
    ...(isOwner || isAdmin ? { company: r.company ? { id: idOf(r.company), name: r.company.companyName } : undefined } : {}),
    isOwner,
    ...(quotationCount !== undefined ? { quotationCount } : {}),
    ...(myQuotation !== undefined ? { myQuotation } : {}),
    ...(bookingId ? { bookingId } : {}),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Loads a request for someone allowed to see it. Everyone else gets 404, so request ids reveal nothing. */
async function loadForViewer(user, id) {
  const request = await withRefs(ServiceRequest.findById(id));
  if (!request) throw notFound();

  if (idOf(request.customer) === String(user._id)) return { request, role: 'owner' };
  if (isAdminUser(user)) return { request, role: 'admin' };

  const profile = await ProviderProfile.findOne({ user: user._id });
  if (profile) {
    if (await Quotation.exists({ request: request._id, provider: profile._id })) return { request, role: 'provider', profile };
    if (request.status === 'open' && profile.verificationStatus === 'verified' && canProviderSee(profile, request)) {
      return { request, role: 'provider', profile };
    }
  }
  throw notFound();
}

async function create(user, data) {
  const category = await resolveCategory(data.category, data.subcategory);
  const doc = {
    customer: user._id,
    title: data.title,
    description: data.description,
    category: category._id,
    subcategory: data.subcategory,
    location: data.location,
    preferredDate: data.preferredDate,
    budgetMin: data.budgetMin,
    budgetMax: data.budgetMax,
  };

  if (data.provider) {
    const target = await ProviderProfile.findOne({ _id: data.provider, verificationStatus: 'verified' });
    if (!target) throw new AppError(400, 'That provider is not available', 'PROVIDER_NOT_FOUND');
    if (idOf(target.user) === String(user._id)) throw new AppError(400, 'You cannot send a request to yourself', 'CANNOT_REQUEST_SELF');
    doc.provider = target._id;
  }

  if (data.onBehalfOfCompany) {
    // The company is looked up from the logged-in user, never taken from the client.
    const company = user.roles.includes(ROLES.BUSINESS) ? await CompanyProfile.findOne({ owner: user._id }) : null;
    if (!company) throw new AppError(409, 'Create your company profile before requesting on its behalf', 'COMPANY_REQUIRED');
    doc.company = company._id;
  }

  const request = await ServiceRequest.create(doc);

  // Tell the providers who can answer it (verified, in the category, never the requester themselves).
  const recipients = doc.provider
    ? await ProviderProfile.find({ _id: doc.provider }).select('user')
    : await ProviderProfile.find({ verificationStatus: 'verified', categories: category._id, user: { $ne: user._id } }).select('user').limit(200);
  await notifications.notifyMany(
    recipients.map((p) => p.user),
    {
      type: 'request.new',
      title: `New request: ${request.title}`,
      body: `${category.name} in ${request.location.district}`,
      link: `/dashboard/requests/${request._id}`,
    },
  );

  return toRequestJSON(await withRefs(ServiceRequest.findById(request._id)), { viewerId: user._id, quotationCount: 0 });
}

async function list(user, { scope, page, limit, status, category }) {
  const isAdmin = isAdminUser(user);
  const hasHiringRole = user.roles.some((r) => r === ROLES.CUSTOMER || r === ROLES.BUSINESS);
  const effective = scope || (hasHiringRole ? 'mine' : user.roles.includes(ROLES.PROVIDER) ? 'incoming' : 'all');
  const forbidden = () => new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN');

  let filter;
  let profile = null;
  if (effective === 'all') {
    if (!isAdmin) throw forbidden();
    filter = {};
  } else if (effective === 'mine') {
    filter = { customer: user._id };
  } else {
    if (!user.roles.includes(ROLES.PROVIDER)) throw forbidden();
    profile = await ProviderProfile.findOne({ user: user._id });
    if (!profile) throw new AppError(409, 'Create your provider profile first', 'PROFILE_REQUIRED');
    if (profile.verificationStatus !== 'verified') {
      throw new AppError(403, 'Your provider profile must be verified to see requests', 'PROVIDER_NOT_VERIFIED');
    }
    filter = {
      status: 'open',
      customer: { $ne: user._id },
      $or: [{ provider: profile._id }, { provider: null, category: { $in: profile.categories } }],
    };
  }
  if (status && effective !== 'incoming') filter.status = status;
  if (category) filter.category = category;

  const [docs, total] = await Promise.all([
    withRefs(ServiceRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)),
    ServiceRequest.countDocuments(filter),
  ]);
  const ids = docs.map((d) => d._id);

  let items;
  if (effective === 'incoming') {
    const mine = await Quotation.find({ request: { $in: ids }, provider: profile._id }).select('request status');
    const byRequest = new Map(mine.map((q) => [String(q.request), q.status]));
    items = docs.map((d) => toRequestJSON(d, { viewerId: user._id, myQuotation: byRequest.get(String(d._id)) || null }));
  } else {
    const counts = await Quotation.aggregate([
      { $match: { request: { $in: ids }, status: { $ne: 'withdrawn' } } },
      { $group: { _id: '$request', n: { $sum: 1 } } },
    ]);
    const byRequest = new Map(counts.map((c) => [String(c._id), c.n]));
    items = docs.map((d) => toRequestJSON(d, { viewerId: user._id, isAdmin: effective === 'all' && isAdmin, quotationCount: byRequest.get(String(d._id)) || 0 }));
  }
  return { items, total, scope: effective };
}

async function getOne(user, id) {
  const { request, role, profile } = await loadForViewer(user, id);
  const extra = {};
  if (role === 'owner' || role === 'admin') {
    extra.quotationCount = await Quotation.countDocuments({ request: request._id, status: { $ne: 'withdrawn' } });
  } else {
    const mine = await Quotation.findOne({ request: request._id, provider: profile._id }).select('status');
    extra.myQuotation = mine ? mine.status : null;
  }
  if (request.status === 'accepted') {
    // The job that came out of this request, shown only to its two parties and admins.
    const booking = await Booking.findOne({ request: request._id }).select('providerUser');
    if (booking && (role !== 'provider' || idOf(booking.providerUser) === String(user._id))) extra.bookingId = String(booking._id);
  }
  return toRequestJSON(request, { viewerId: user._id, isAdmin: role === 'admin', ...extra });
}

async function findOwned(user, id) {
  const request = await ServiceRequest.findOne({ _id: id, customer: user._id });
  if (!request) throw notFound();
  return request;
}

async function cancel(request) {
  if (request.status === 'cancelled') return;
  if (request.status === 'accepted') {
    throw new AppError(409, 'An accepted request can no longer be cancelled here', 'INVALID_STATUS_TRANSITION');
  }
  // Guarded update: if a quotation was accepted a moment ago, this matches nothing instead of overwriting it.
  const updated = await ServiceRequest.findOneAndUpdate({ _id: request._id, status: 'open' }, { $set: { status: 'cancelled' } }, { new: true });
  if (!updated) throw new AppError(409, 'An accepted request can no longer be cancelled here', 'INVALID_STATUS_TRANSITION');

  const pending = await Quotation.find({ request: request._id, status: 'pending' }).populate('provider', 'user');
  await Quotation.updateMany({ request: request._id, status: 'pending' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  await notifications.notifyMany(
    pending.map((q) => q.provider.user),
    { type: 'request.cancelled', title: `Request cancelled: ${request.title}`, body: 'The customer cancelled this request, so your quotation was closed.', link: `/dashboard/requests/${request._id}` },
  );
}

/**
 * Owners can cancel an open request, or edit it while nobody has quoted yet. Once quotations exist the
 * request is locked, so providers never price a job that was changed after they quoted.
 */
async function update(user, id, data) {
  const request = await findOwned(user, id);
  if (data.status === 'cancelled') {
    await cancel(request);
    return getOne(user, id);
  }

  if (request.status !== 'open') throw closed();
  const active = await Quotation.countDocuments({ request: request._id, status: { $in: ['pending', 'accepted'] } });
  if (active > 0) {
    throw new AppError(409, 'This request already has quotations. Cancel it and create a new one to change the details.', 'REQUEST_LOCKED');
  }

  const categoryChanged = data.category !== undefined && String(data.category) !== String(request.category);
  if (categoryChanged || data.subcategory !== undefined) {
    const subcategory = data.subcategory !== undefined ? data.subcategory : categoryChanged ? undefined : request.subcategory;
    await resolveCategory(data.category ?? request.category, subcategory);
    if (categoryChanged && data.subcategory === undefined) request.subcategory = undefined;
  }

  const { location, ...rest } = data;
  request.set(rest);
  if (location) request.set(Object.fromEntries(Object.entries(location).map(([k, v]) => [`location.${k}`, v])));
  if (request.budgetMin != null && request.budgetMax != null && request.budgetMin > request.budgetMax) {
    throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', [{ field: 'budgetMin', message: 'budgetMin cannot be greater than budgetMax' }]);
  }
  await request.save();
  return getOne(user, id);
}

async function addAttachment(user, id, image) {
  const request = await findOwned(user, id);
  if (request.status !== 'open') throw closed();
  const saved = await storage.save({ ...image, folder: 'requests' });
  try {
    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: id, customer: user._id, status: 'open', [`attachments.${MAX_ATTACHMENTS - 1}`]: { $exists: false } },
      { $push: { attachments: { key: saved.key, url: saved.url } } },
      { new: true },
    );
    if (!updated) throw new AppError(400, `A request can have at most ${MAX_ATTACHMENTS} photos`, 'ATTACHMENT_LIMIT');
    return updated.attachments.map((a) => ({ id: String(a._id), url: a.url }));
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
}

async function removeAttachment(user, id, attachmentId) {
  await findOwned(user, id);
  const before = await ServiceRequest.findOneAndUpdate(
    { _id: id, customer: user._id, 'attachments._id': attachmentId },
    { $pull: { attachments: { _id: attachmentId } } },
    { new: false },
  );
  if (!before) throw new AppError(404, 'Photo not found', 'ATTACHMENT_NOT_FOUND');
  const item = before.attachments.id(attachmentId);
  if (item) await storage.remove(item.key);
}

module.exports = { canProviderSee, loadForViewer, toRequestJSON, create, list, getOne, update, addAttachment, removeAttachment, MAX_ATTACHMENTS };
