const crypto = require('crypto');
const Contract = require('../models/Contract');
const Booking = require('../models/Booking');
const AppError = require('../utils/AppError');
const notifications = require('./notificationService');
const termsService = require('./termsService');
const audit = require('./auditService');
const { buildContent } = require('./contractTemplate');
const { isAdmin } = require('../utils/roles');

const idOf = (v) => String(v?._id ?? v);
const notFound = () => new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');

const plain = (content) => JSON.parse(JSON.stringify(content));
/** Stable fingerprint of a version's content (keys sorted), so any later change to a stored version is detectable. */
function hashOf(content) {
  const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  return crypto.createHash('sha256').update(JSON.stringify(sorted(plain(content)))).digest('hex');
}

const roleOf = (c, user) => (idOf(c.customer) === String(user._id) ? 'customer' : idOf(c.providerUser) === String(user._id) ? 'provider' : isAdmin(user) ? 'admin' : null);
const currentOf = (c) => c.versions.find((v) => v.number === c.currentVersion);

function toJSON(c, role) {
  const cur = currentOf(c);
  const accepted = new Set(cur.acceptances.map((a) => a.role));
  return {
    id: String(c._id), booking: idOf(c.booking), status: c.status, version: c.currentVersion, acceptedAt: c.acceptedAt, legacy: c.legacy, myRole: role,
    content: cur.content, contentHash: cur.contentHash, intact: hashOf(cur.content) === cur.contentHash,
    acceptances: cur.acceptances.map((a) => ({ role: a.role, acceptedAt: a.acceptedAt })),
    iHaveAccepted: role === 'customer' || role === 'provider' ? accepted.has(role) : undefined,
    waitingFor: ['customer', 'provider'].filter((r) => !accepted.has(r)),
    versions: c.versions.map((v) => ({ number: v.number, createdAt: v.createdAt, note: v.note, contentHash: v.contentHash, acceptedBy: v.acceptances.map((a) => a.role) })),
    createdAt: c.createdAt,
  };
}

/** Created in the same step as the booking, with the price and scope copied from the accepted quotation on the server. */
async function createForBooking({ booking, request, quotation }, options = {}) {
  const termsVersion = (await termsService.current()).version;
  const content = buildContent({ request, quotation, termsVersion });
  const [contract] = await Contract.create(
    [{ booking: booking._id, customer: booking.customer, providerUser: booking.providerUser, provider: booking.provider, currentVersion: 1, versions: [{ number: 1, content, contentHash: hashOf(content), createdBy: booking.customer, createdAt: new Date(), note: 'Created from the accepted quotation' }] }],
    options,
  );
  return contract;
}

async function load(user, query) {
  const c = await Contract.findOne(query);
  const role = c && roleOf(c, user);
  if (!role) throw notFound(); // outsiders cannot tell a contract exists
  return { c, role };
}

async function getForBooking(user, bookingId) {
  const { c, role } = await load(user, { booking: bookingId });
  return toJSON(c, role);
}
async function getOne(user, id) {
  const { c, role } = await load(user, { _id: id });
  return toJSON(c, role);
}

/** Either party accepts the CURRENT version. The provider's acceptance is their explicit acceptance of the job and unlocks contact details. */
async function accept(user, id, { version }, ctx) {
  const { c, role } = await load(user, { _id: id });
  if (role === 'admin') throw new AppError(403, 'Only the customer and the provider can accept a contract', 'FORBIDDEN');
  if (version !== c.currentVersion) throw new AppError(409, 'The contract was changed. Please read the latest version.', 'STALE_CONTRACT', { version: c.currentVersion });
  const booking = await Booking.findById(c.booking).select('status title');
  if (!booking || booking.status !== 'accepted') throw new AppError(409, 'This job is no longer waiting to start, so its contract cannot be accepted', 'BOOKING_NOT_WAITING');
  await termsService.assertAccepted(user);

  const now = new Date();
  const claimed = await Contract.findOneAndUpdate(
    { _id: c._id, currentVersion: version, versions: { $elemMatch: { number: version, 'acceptances.user': { $ne: user._id } } } },
    { $push: { 'versions.$[v].acceptances': { role, user: user._id, acceptedAt: now, ip: ctx?.ip } } },
    { new: true, arrayFilters: [{ 'v.number': version }] },
  );
  if (!claimed) return toJSON(c, role); // already accepted: nothing new to record

  const cur = currentOf(claimed);
  const both = ['customer', 'provider'].every((r) => cur.acceptances.some((a) => a.role === r));
  if (role === 'provider') await Booking.updateOne({ _id: c.booking, providerAcceptedAt: { $exists: false } }, { $set: { providerAcceptedAt: now } });
  if (both) await Contract.updateOne({ _id: c._id }, { $set: { status: 'accepted', acceptedAt: now } });
  await audit.record({ actor: user._id, action: 'contract.accepted', entityType: 'Contract', entityId: c._id, metadata: { version, role, booking: String(c.booking), bothAccepted: both }, ctx });

  const other = role === 'customer' ? c.providerUser : c.customer;
  await notifications.notify(other, {
    type: 'contract.updated',
    title: both ? `Contract signed: ${booking.title}` : `${role === 'provider' ? 'The provider accepted the job' : 'The customer accepted the contract'}: ${booking.title}`,
    body: both ? 'Both of you accepted the contract. Work can now begin.' : 'Open the contract to read it and accept.',
    link: `/dashboard/bookings/${c.booking}`,
  });
  if (both) await notifications.notify(user._id, { type: 'contract.updated', title: `Contract signed: ${booking.title}`, body: 'Both of you accepted the contract. Work can now begin.', link: `/dashboard/bookings/${c.booking}` });
  return getOne(user, id);
}

/** Either party may propose changes to the scope (not the price) before work starts. That makes a new version, and both must accept again. */
async function propose(user, id, changes, ctx) {
  const { c, role } = await load(user, { _id: id });
  if (role === 'admin') throw new AppError(403, 'Only the customer and the provider can change a contract', 'FORBIDDEN');
  const booking = await Booking.findById(c.booking).select('status title');
  if (!booking || booking.status !== 'accepted') throw new AppError(409, 'A contract can only be changed before work starts', 'BOOKING_NOT_WAITING');
  const cur = currentOf(c);
  const next = plain(cur.content);
  const { note, deadline, ...fields } = changes;
  Object.assign(next, fields);
  if (deadline !== undefined) next.deadline = deadline ? new Date(`${deadline}T00:00:00.000Z`) : undefined;
  const number = c.currentVersion + 1;
  const updated = await Contract.findOneAndUpdate(
    { _id: c._id, currentVersion: c.currentVersion },
    { $push: { versions: { number, content: next, contentHash: hashOf(next), createdBy: user._id, createdAt: new Date(), note } }, $set: { currentVersion: number, status: 'pending' }, $unset: { acceptedAt: '' } },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'The contract was just changed by the other side. Reload and try again.', 'CONTRACT_CHANGED');
  await audit.record({ actor: user._id, action: 'contract.version_proposed', entityType: 'Contract', entityId: c._id, metadata: { version: number, role }, ctx });
  await notifications.notify(role === 'customer' ? c.providerUser : c.customer, { type: 'contract.updated', title: `Contract changed: ${booking.title}`, body: 'Read version ' + number + ' and accept it, or reply with your own changes.', link: `/dashboard/bookings/${c.booking}` });
  return getOne(user, id);
}

async function listForAdmin({ page, limit, status }) {
  const filter = status ? { status } : {};
  const [docs, total] = await Promise.all([
    Contract.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('booking', 'title status').populate('customer', 'fullName').populate('provider', 'displayName'),
    Contract.countDocuments(filter),
  ]);
  return { items: docs.map((c) => ({ id: String(c._id), booking: idOf(c.booking), bookingTitle: c.booking?.title, bookingStatus: c.booking?.status, customer: c.customer?.fullName, provider: c.provider?.displayName, status: c.status, version: c.currentVersion, acceptedAt: c.acceptedAt, legacy: c.legacy, createdAt: c.createdAt })), total };
}

/** Used by the booking service: has this job's contract been accepted by both sides? */
async function isAccepted(bookingId) {
  return Boolean(await Contract.exists({ booking: bookingId, status: 'accepted' }));
}
async function statusMap(bookingIds) {
  const rows = await Contract.find({ booking: { $in: bookingIds } }).select('booking status');
  return new Map(rows.map((r) => [String(r.booking), r.status]));
}

module.exports = { createForBooking, getForBooking, getOne, accept, propose, listForAdmin, isAccepted, statusMap, hashOf };
