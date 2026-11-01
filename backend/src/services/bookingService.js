const Booking = require('../models/Booking');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const { STAFF_ROLES, isAdmin: isAdminUser } = require('../utils/roles');
const notifications = require('./notificationService');
const audit = require('./auditService');
const Review = require('../models/Review');
const reviewService = require('./reviewService');
const Dispute = require('../models/Dispute');
const disputeRecords = require('./disputeRecords');
const contractService = require('./contractService');

const idOf = (v) => String(v?._id ?? v);
const DAY_MS = 86_400_000;
const ACTIVE = ['accepted', 'in_progress'];
const LABEL = { accepted: 'booked', in_progress: 'in progress', completed: 'completed', cancelled: 'cancelled', disputed: 'disputed' };

/**
 * The whole lifecycle in one table: current status -> next status -> who may make that move.
 *   accepted -> in_progress   provider starts the work
 *   accepted -> cancelled     either side, before work starts
 *   in_progress -> completed  provider marks it done
 *   in_progress / completed -> disputed   either side reports a problem (completed: within DISPUTE_WINDOW_DAYS)
 *   disputed -> completed | cancelled     an administrator resolves it
 * Work in progress cannot simply be cancelled: a side that wants out must report a problem so an admin reviews it.
 */
const TRANSITIONS = {
  accepted: { in_progress: ['provider'], cancelled: ['customer', 'provider'] },
  in_progress: { completed: ['provider'], disputed: ['customer', 'provider'] },
  completed: { disputed: ['customer', 'provider'] },
  disputed: { completed: ['admin'], cancelled: ['admin'] },
  cancelled: {},
};

const notFound = () => new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
const withRefs = (q) =>
  q.populate('customer', 'fullName phone email').populate('providerUser', 'phone email').populate('provider', 'displayName avatarUrl').populate('category', 'name slug');

const roleOf = (b, user) => {
  if (idOf(b.customer) === String(user._id)) return 'customer';
  if (idOf(b.providerUser) === String(user._id)) return 'provider';
  return isAdminUser(user) ? 'admin' : null;
};

const disputeDeadline = (b) => (b.completedAt ? new Date(b.completedAt.getTime() + env.DISPUTE_WINDOW_DAYS * DAY_MS) : null);
const withinDisputeWindow = (b) => Boolean(b.completedAt) && Date.now() <= disputeDeadline(b).getTime();

/** The moves this viewer can make right now. The UI shows exactly these buttons; the server re-checks every move. */
function allowedActions(b, role, contractStatus) {
  return Object.entries(TRANSITIONS[b.status] || {})
    .filter(([to, roles]) => roles.includes(role) && !(b.status === 'completed' && to === 'disputed' && !withinDisputeWindow(b)))
    .filter(([to]) => !(to === 'in_progress' && contractStatus !== 'accepted')) // work cannot start until both sides accepted the contract
    .map(([to]) => to);
}

function toBookingJSON(b, user, contractStatus) {
  const role = roleOf(b, user);
  // Contact details stay hidden until the provider has explicitly accepted the job (recorded in providerAcceptedAt), and only while the job is live.
  const revealed = ACTIVE.includes(b.status) && Boolean(b.providerAcceptedAt);
  return {
    id: String(b._id),
    request: idOf(b.request),
    title: b.title,
    category: { id: idOf(b.category), name: b.category?.name, slug: b.category?.slug },
    location: { district: b.location?.district, sector: b.location?.sector },
    agreedPrice: b.agreedPrice,
    status: b.status,
    myRole: role,
    contactRevealed: revealed,
    providerAcceptedAt: b.providerAcceptedAt,
    contract: { status: contractStatus ?? 'none' },
    customer: { name: b.customer?.fullName, ...(revealed && role === 'provider' ? { ...(b.customer?.phone ? { phone: b.customer.phone } : {}), ...(b.customer?.email ? { email: b.customer.email } : {}) } : {}) },
    provider: { id: idOf(b.provider), displayName: b.provider?.displayName, avatarUrl: b.provider?.avatarUrl, ...(revealed && role === 'customer' ? { ...(b.providerUser?.phone ? { phone: b.providerUser.phone } : {}), ...(b.providerUser?.email ? { email: b.providerUser.email } : {}) } : {}) },
    allowedActions: allowedActions(b, role, contractStatus),
    disputeWindowEndsAt: b.status === 'completed' ? disputeDeadline(b) : undefined,
    history: b.history.map((h) => ({ from: h.from, to: h.to, role: h.role, note: h.note, at: h.at })),
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    cancelledAt: b.cancelledAt,
    disputedAt: b.disputedAt,
    createdAt: b.createdAt,
  };
}

/** Called when a quotation is accepted. The price is copied from the quotation on the server, never from the client. */
async function createFromAcceptance({ request, quotation, actor, now }, options = {}) {
  const [booking] = await Booking.create(
    [{
      request: request._id,
      quotation: quotation._id,
      customer: request.customer,
      company: request.company,
      provider: quotation.provider._id ?? quotation.provider,
      providerUser: quotation.provider.user,
      title: request.title,
      category: request.category,
      location: { district: request.location?.district, sector: request.location?.sector },
      agreedPrice: quotation.price,
      status: 'accepted',
      history: [{ to: 'accepted', by: actor._id, role: 'customer', at: now }],
    }],
    options,
  );
  // Every accepted job gets its own service contract, built from the accepted quotation.
  await contractService.createForBooking({ booking, request, quotation }, options);
  return booking;
}

async function list(user, { scope, as, status, page, limit }) {
  const isAdmin = isAdminUser(user);
  const hasPartyRole = user.roles.some((r) => !STAFF_ROLES.includes(r));
  const effective = scope || (hasPartyRole ? 'mine' : 'all');

  let filter;
  if (effective === 'all') {
    if (!isAdmin) throw new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
    filter = {};
  } else if (as === 'customer') filter = { customer: user._id };
  else if (as === 'provider') filter = { providerUser: user._id };
  else filter = { $or: [{ customer: user._id }, { providerUser: user._id }] };

  if (status === 'active') filter.status = { $in: ACTIVE };
  else if (status) filter.status = status;

  const [docs, total] = await Promise.all([
    withRefs(Booking.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)),
    Booking.countDocuments(filter),
  ]);
  const contracts = await contractService.statusMap(docs.map((d) => d._id));
  return { items: docs.map((d) => toBookingJSON(d, user, contracts.get(String(d._id)))), total, scope: effective };
}

async function getOne(user, id) {
  const booking = await withRefs(Booking.findById(id));
  const role = booking && roleOf(booking, user);
  if (!role) throw notFound(); // outsiders cannot tell a booking exists
  const [review, dispute, contractStatus] = await Promise.all([Review.findOne({ booking: booking._id }), Dispute.findOne({ booking: booking._id }).sort({ createdAt: -1 }).select('status'), contractService.statusMap([booking._id]).then((m) => m.get(String(booking._id)))]);
  return {
    ...toBookingJSON(booking, user, contractStatus),
    dispute: dispute ? { id: String(dispute._id), status: dispute.status } : null,
    review: reviewService.toBookingReview(review, role, user._id),
    canReview: role === 'customer' && booking.status === 'completed' && !review,
  };
}

const MESSAGES = {
  in_progress: (t) => ({ title: `Work has started: ${t}`, body: 'The provider marked the job as in progress.' }),
  completed: (t) => ({ title: `Marked as complete: ${t}`, body: `Check the work. If something is wrong you can report a problem for ${env.DISPUTE_WINDOW_DAYS} days.` }),
  cancelled: (t) => ({ title: `Job cancelled: ${t}`, body: '' }),
  disputed: (t) => ({ title: `Problem reported: ${t}`, body: 'An administrator will review it.' }),
};

async function transition(user, id, { status, note }, ctx) {
  const booking = await Booking.findById(id);
  if (!booking) throw notFound();
  const role = roleOf(booking, user);
  if (!role) throw notFound();

  const allowedRoles = TRANSITIONS[booking.status]?.[status];
  if (!allowedRoles) {
    throw new AppError(409, `A job that is ${LABEL[booking.status]} cannot be changed to ${LABEL[status]}`, 'INVALID_STATUS_TRANSITION');
  }
  if (!allowedRoles.includes(role)) throw new AppError(403, 'You do not have permission to make this change', 'FORBIDDEN');
  if (booking.status === 'completed' && status === 'disputed' && !withinDisputeWindow(booking)) {
    throw new AppError(409, `Problems can only be reported within ${env.DISPUTE_WINDOW_DAYS} days of completion`, 'DISPUTE_WINDOW_CLOSED');
  }

  // Work only begins once the customer and the provider have both accepted the service contract.
  if (status === 'in_progress' && !(await contractService.isAccepted(booking._id))) {
    throw new AppError(409, 'Both the customer and the provider must accept the service contract before work can start', 'CONTRACT_NOT_ACCEPTED');
  }

  const now = new Date();
  const wasCompletedBefore = Boolean(booking.completedAt);
  const set = { status };
  if (status === 'in_progress') set.startedAt = now;
  if (status === 'completed' && !wasCompletedBefore) set.completedAt = now;
  if (status === 'cancelled') set.cancelledAt = now;
  if (status === 'disputed') set.disputedAt = now;

  // Guarded by the status we just read: if anyone changed the job in the meantime this matches nothing.
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    { $set: set, $push: { history: { from: booking.status, to: status, by: user._id, role, note: note || undefined, at: now } } },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'This job was just updated by someone else. Reload and try again.', 'BOOKING_CHANGED');

  // A job entering "disputed" must have a dispute record. If it cannot be created, put the booking back as it was.
  if (status === 'disputed') {
    try {
      await disputeRecords.open({ booking, user, role, reason: note });
    } catch (err) {
      await Booking.updateOne({ _id: booking._id, status: 'disputed' }, { $set: { status: booking.status }, $unset: { disputedAt: '' }, $pop: { history: 1 } });
      throw err;
    }
  }
  if (role === 'admin' && booking.status === 'disputed') {
    await disputeRecords.markResolved({ bookingId: booking._id, admin: user, outcome: status, note });
  }

  // completedJobs counts a job once, and is taken back if an admin later cancels a job that had been completed.
  if (status === 'completed' && !wasCompletedBefore) await ProviderProfile.updateOne({ _id: booking.provider }, { $inc: { completedJobs: 1 } });
  if (status === 'cancelled' && wasCompletedBefore) await ProviderProfile.updateOne({ _id: booking.provider, completedJobs: { $gt: 0 } }, { $inc: { completedJobs: -1 } });

  if (role === 'admin' || status === 'disputed' || status === 'cancelled') {
    await audit.record({ actor: user._id, action: `booking.${status}`, entityType: 'Booking', entityId: booking._id, metadata: { from: booking.status, role, note }, ctx });
  }

  const msg = MESSAGES[status](booking.title);
  const recipients = [booking.customer, booking.providerUser].filter((u) => idOf(u) !== String(user._id));
  await notifications.notifyMany(recipients, {
    type: 'booking.updated',
    title: role === 'admin' && booking.status === 'disputed' ? `Dispute resolved: ${booking.title}` : msg.title,
    body: note || msg.body,
    link: `/dashboard/bookings/${booking._id}`,
  });

  return getOne(user, id);
}

module.exports = { TRANSITIONS, ACTIVE, createFromAcceptance, list, getOne, transition, allowedActions };
