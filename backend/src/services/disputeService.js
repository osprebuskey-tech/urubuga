const Dispute = require('../models/Dispute');
const AppError = require('../utils/AppError');
const { isAdmin: isAdminUser } = require('../utils/roles');
const storage = require('./storage');
const notifications = require('./notificationService');
const audit = require('./auditService');
const bookingService = require('./bookingService');

const idOf = (v) => String(v?._id ?? v);
const MAX_MESSAGES = 100;
const MAX_EVIDENCE = 10;
const notFound = () => new AppError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
const closed = () => new AppError(409, 'This dispute has been resolved', 'DISPUTE_CLOSED');

const withRefs = (q) =>
  q.populate({ path: 'booking', select: 'title status agreedPrice provider', populate: { path: 'provider', select: 'displayName' } }).populate('customer', 'fullName');

const roleOf = (d, user) => {
  if (idOf(d.customer) === String(user._id)) return 'customer';
  if (idOf(d.providerUser) === String(user._id)) return 'provider';
  return isAdminUser(user) ? 'admin' : null;
};

/** Everyone involved sees the whole thread. Messages carry roles, never user ids. */
function toDisputeJSON(d, role) {
  return {
    id: String(d._id),
    booking: { id: idOf(d.booking), title: d.booking?.title, status: d.booking?.status, agreedPrice: d.booking?.agreedPrice },
    customer: { name: d.customer?.fullName },
    provider: { name: d.booking?.provider?.displayName },
    status: d.status,
    openerRole: d.openerRole,
    reason: d.reason,
    messages: d.messages.map((m) => ({ role: m.role, text: m.text, at: m.at })),
    evidence: d.evidence.map((e) => ({ id: String(e._id), url: e.url, role: e.role, at: e.at })),
    resolution: d.resolution?.outcome ? { outcome: d.resolution.outcome, note: d.resolution.note, at: d.resolution.at } : undefined,
    assigned: Boolean(d.assignedTo),
    canPost: d.status !== 'resolved',
    myRole: role,
    createdAt: d.createdAt,
  };
}

async function load(user, id) {
  const dispute = await withRefs(Dispute.findById(id));
  const role = dispute && roleOf(dispute, user);
  if (!role) throw notFound(); // outsiders cannot tell a dispute exists
  return { dispute, role };
}

async function getOne(user, id) {
  const { dispute, role } = await load(user, id);
  return toDisputeJSON(dispute, role);
}

async function list(user, { page, limit, status }) {
  const filter = { $or: [{ customer: user._id }, { providerUser: user._id }] };
  if (status) filter.status = status;
  const [docs, total] = await Promise.all([
    withRefs(Dispute.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)),
    Dispute.countDocuments(filter),
  ]);
  return { items: docs.map((d) => toDisputeJSON(d, roleOf(d, user))), total };
}

async function listForAdmin({ page, limit, status }) {
  const filter = status ? { status } : {};
  const [docs, total] = await Promise.all([
    withRefs(Dispute.find(filter).sort({ active: -1, createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)),
    Dispute.countDocuments(filter),
  ]);
  return { items: docs.map((d) => toDisputeJSON(d, 'admin')), total };
}

/** Who to tell about something one participant did: the other side, and the administrator looking after it. */
function others(dispute, role) {
  const ids = [];
  if (role !== 'customer') ids.push(dispute.customer);
  if (role !== 'provider') ids.push(dispute.providerUser);
  if (role !== 'admin' && dispute.assignedTo) ids.push(dispute.assignedTo);
  return ids;
}

async function addMessage(user, id, { text }) {
  const { dispute, role } = await load(user, id);
  if (dispute.status === 'resolved') throw closed();
  const updated = await Dispute.findOneAndUpdate(
    { _id: dispute._id, status: { $ne: 'resolved' }, [`messages.${MAX_MESSAGES - 1}`]: { $exists: false } },
    { $push: { messages: { by: user._id, role, text, at: new Date() } } },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'This dispute is closed or has reached its message limit', 'DISPUTE_CLOSED');
  await notifications.notifyMany(others(updated, role), {
    type: 'dispute.updated',
    title: `New message on a dispute: ${dispute.booking?.title}`,
    body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
    link: `/dashboard/disputes/${dispute._id}`,
  });
  return getOne(user, id);
}

/**
 * Photo evidence. Uploaded files get random, unguessable names, but the default local storage serves them from a public
 * folder, so anyone who has the exact link can open it. For sensitive material use a private bucket with signed links (S3 adapter).
 */
async function addEvidence(user, id, image) {
  const { dispute, role } = await load(user, id);
  if (dispute.status === 'resolved') throw closed();
  const saved = await storage.save({ ...image, folder: 'disputes' });
  try {
    const updated = await Dispute.findOneAndUpdate(
      { _id: dispute._id, status: { $ne: 'resolved' }, [`evidence.${MAX_EVIDENCE - 1}`]: { $exists: false } },
      { $push: { evidence: { key: saved.key, url: saved.url, by: user._id, role, at: new Date() } } },
      { new: true },
    );
    if (!updated) throw new AppError(400, `A dispute can have at most ${MAX_EVIDENCE} photos`, 'EVIDENCE_LIMIT');
    await notifications.notifyMany(others(updated, role), { type: 'dispute.updated', title: `New photo evidence: ${dispute.booking?.title}`, link: `/dashboard/disputes/${dispute._id}` });
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
  return getOne(user, id);
}

/**
 * Administrators either take a dispute for review, or resolve it. Resolving is a booking move (disputed -> completed or
 * cancelled) made by an admin through the booking state machine, so the same rules, audit entries, completed-job counts
 * and notifications apply however the move is made. Any refund is recorded separately on the job's payment.
 */
async function adminUpdate(admin, id, { status, outcome, note }, ctx) {
  const { dispute } = await load(admin, id);
  if (dispute.status === 'resolved') throw closed();

  if (status === 'under_review') {
    const updated = await Dispute.findOneAndUpdate({ _id: dispute._id, status: 'open' }, { $set: { status: 'under_review', assignedTo: admin._id } }, { new: true });
    if (!updated) throw new AppError(409, 'This dispute is already being reviewed', 'INVALID_STATUS_TRANSITION');
    await audit.record({ actor: admin._id, action: 'dispute.review_started', entityType: 'Dispute', entityId: dispute._id, ctx });
    await notifications.notifyMany([dispute.customer, dispute.providerUser], {
      type: 'dispute.updated', title: `An administrator is reviewing your dispute: ${dispute.booking?.title}`, link: `/dashboard/disputes/${dispute._id}`,
    });
    return getOne(admin, id);
  }

  await bookingService.transition(admin, idOf(dispute.booking), { status: outcome, note }, ctx);
  return getOne(admin, id);
}

module.exports = { getOne, list, listForAdmin, addMessage, addEvidence, adminUpdate, MAX_EVIDENCE };
