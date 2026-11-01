const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const PaymentFollowUp = require('../models/PaymentFollowUp');
const AppError = require('../utils/AppError');
const notifications = require('./notificationService');
const audit = require('./auditService');

const DAY_MS = 24 * 60 * 60 * 1000;
const CAP = 500; // most rows looked at per list, oldest first (a backlog that large needs a different tool)
const REMINDER_GAP_MS = DAY_MS; // a customer is reminded at most once a day
const PAYABLE_BOOKING = ['accepted', 'in_progress', 'completed'];
const fmt = (n) => `${n.toLocaleString('en-US')} RWF`;
const idOf = (v) => String(v?._id ?? v);

/**
 * The three kinds of money that need chasing, and how long each can sit before it counts as overdue:
 *  - awaiting_confirmation: a customer started a manual payment and nobody has confirmed it yet
 *  - unpaid_jobs: work is under way or finished and no payment was started at all
 *  - payouts_due: the customer paid, the job is complete, and the provider has not been paid yet
 */
const BUCKETS = {
  awaiting_confirmation: { kind: 'payment', overdueAfterDays: 1 },
  unpaid_jobs: { kind: 'payment', overdueAfterDays: 3 },
  payouts_due: { kind: 'payout', overdueAfterDays: 3 },
};
const BUCKET_NAMES = Object.keys(BUCKETS);

const names = (customer, provider) => ({ customerName: customer?.fullName, providerName: provider?.displayName });

async function awaitingConfirmation() {
  const rows = await Payment.find({ status: 'pending', active: true }).sort({ createdAt: 1 }).limit(CAP)
    .populate('booking', 'title status').populate('customer', 'fullName').populate('provider', 'displayName');
  return rows.map((p) => ({ bookingId: idOf(p.booking), paymentId: String(p._id), title: p.booking?.title, bookingStatus: p.booking?.status, amount: p.amount, since: p.createdAt, ...names(p.customer, p.provider) }));
}

async function unpaidJobs() {
  const rows = await Booking.aggregate([
    { $match: { status: { $in: ['in_progress', 'completed'] } } },
    { $lookup: { from: 'payments', let: { b: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$booking', '$$b'] }, active: true } }, { $limit: 1 }], as: 'pay' } },
    { $match: { pay: { $size: 0 } } },
    { $addFields: { since: { $ifNull: [{ $cond: [{ $eq: ['$status', 'completed'] }, '$completedAt', '$startedAt'] }, '$updatedAt'] } } },
    { $sort: { since: 1 } },
    { $limit: CAP },
    { $project: { title: 1, status: 1, agreedPrice: 1, since: 1, customer: 1, provider: 1 } },
  ]);
  await Booking.populate(rows, [{ path: 'customer', select: 'fullName' }, { path: 'provider', select: 'displayName' }]);
  return rows.map((b) => ({ bookingId: String(b._id), title: b.title, bookingStatus: b.status, amount: b.agreedPrice, since: b.since, ...names(b.customer, b.provider) }));
}

async function payoutsDue() {
  const rows = await Payment.aggregate([
    { $match: { status: 'succeeded' } },
    { $addFields: { due: { $max: [0, { $subtract: [{ $subtract: ['$providerAmount', '$providerRefunded'] }, '$paidOut'] }] } } },
    { $match: { due: { $gt: 0 } } },
    { $lookup: { from: 'bookings', localField: 'booking', foreignField: '_id', as: 'b' } },
    { $unwind: '$b' },
    { $match: { 'b.status': 'completed' } },
    { $addFields: { since: { $max: ['$confirmedAt', '$b.completedAt'] } } }, // due once it is both paid for and finished
    { $sort: { since: 1 } },
    { $limit: CAP },
    { $project: { due: 1, since: 1, customer: 1, provider: 1, booking: 1, title: '$b.title' } },
  ]);
  await Payment.populate(rows, [{ path: 'customer', select: 'fullName' }, { path: 'provider', select: 'displayName' }]);
  return rows.map((p) => ({ bookingId: idOf(p.booking), paymentId: String(p._id), title: p.title, bookingStatus: 'completed', amount: p.due, since: p.since, ...names(p.customer, p.provider) }));
}

const FETCH = { awaiting_confirmation: awaitingConfirmation, unpaid_jobs: unpaidJobs, payouts_due: payoutsDue };

/** The most recent log entry for each booking in a list, for one kind of follow-up. */
async function latestFollowUps(bookingIds, kind) {
  if (bookingIds.length === 0) return new Map();
  const rows = await PaymentFollowUp.aggregate([
    { $match: { booking: { $in: bookingIds }, kind } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$booking', note: { $first: '$note' }, outcome: { $first: '$outcome' }, at: { $first: '$createdAt' }, nextFollowUpAt: { $first: '$nextFollowUpAt' }, by: { $first: '$by' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function loadBucket(bucket, now = new Date()) {
  const { kind, overdueAfterDays } = BUCKETS[bucket];
  const rows = await FETCH[bucket]();
  const last = await latestFollowUps(rows.map((r) => new mongoose.Types.ObjectId(r.bookingId)), kind);
  return rows.map((r) => {
    const f = last.get(r.bookingId);
    // Next look: the date the officer set, else a set number of days after the last contact, else after it first became due.
    const dueAt = f?.nextFollowUpAt ?? new Date(((f?.at ?? r.since)).getTime() + overdueAfterDays * DAY_MS);
    return {
      ...r,
      kind,
      ageDays: Math.max(0, Math.floor((now - r.since) / DAY_MS)),
      followUpCount: f?.count ?? 0,
      lastFollowUp: f ? { note: f.note, outcome: f.outcome, at: f.at } : undefined,
      followUpDueAt: dueAt,
      overdue: now > dueAt,
    };
  });
}

/** Counts and values for every bucket, so the person in charge sees the size of the backlog at a glance. */
async function summary() {
  const now = new Date();
  const out = {};
  for (const bucket of BUCKET_NAMES) {
    const rows = await loadBucket(bucket, now);
    out[bucket] = {
      count: rows.length,
      value: rows.reduce((s, r) => s + r.amount, 0),
      overdue: rows.filter((r) => r.overdue).length,
      oldestAt: rows[0]?.since,
      truncated: rows.length >= CAP,
    };
  }
  return out;
}

/** One bucket's items: overdue first, then the longest waiting. */
async function listBucket(bucket, { page, limit }) {
  const rows = await loadBucket(bucket);
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.since - b.since);
  return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length };
}

const toJSON = (f, byName) => ({ id: String(f._id), booking: idOf(f.booking), kind: f.kind, outcome: f.outcome, note: f.note, nextFollowUpAt: f.nextFollowUpAt, reminderSent: f.reminderSent, by: byName ?? f.by?.fullName, at: f.createdAt });

async function createFollowUp(user, { bookingId, kind, outcome, note, nextFollowUpAt, remindCustomer }, ctx) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError(404, 'Job not found', 'BOOKING_NOT_FOUND');

  const payment = await Payment.findOne({ booking: booking._id, active: true });
  if (kind === 'payment') {
    if (!PAYABLE_BOOKING.includes(booking.status)) throw new AppError(409, 'This job can no longer be paid for', 'BOOKING_NOT_PAYABLE');
    if (payment?.status === 'succeeded') throw new AppError(409, 'This job is already paid for', 'ALREADY_PAID');
  } else if (payment?.status !== 'succeeded') {
    throw new AppError(409, 'There is no received payment to pay out from', 'NOTHING_TO_PAY_OUT');
  }

  let reminderSent = false;
  if (remindCustomer) {
    if (kind !== 'payment') throw new AppError(400, 'Only a payment can be reminded about', 'VALIDATION_ERROR');
    const recent = await PaymentFollowUp.findOne({ booking: booking._id, kind: 'payment', reminderSent: true, createdAt: { $gt: new Date(Date.now() - REMINDER_GAP_MS) } });
    if (recent) throw new AppError(409, 'The customer was already reminded in the last 24 hours', 'REMINDER_TOO_SOON');
    await notifications.notify(booking.customer, {
      type: 'payment.updated',
      title: 'Payment reminder',
      body: `Please complete the payment of ${fmt(booking.agreedPrice)} for "${booking.title}".`,
      link: `/dashboard/bookings/${booking._id}`,
    });
    reminderSent = true;
  }

  const entry = await PaymentFollowUp.create({ booking: booking._id, kind, outcome, note, nextFollowUpAt, reminderSent, by: user._id });
  await audit.record({ actor: user._id, action: 'payment.follow_up_logged', entityType: 'Booking', entityId: booking._id, metadata: { kind, outcome, reminderSent }, ctx });
  return toJSON(entry, user.fullName);
}

async function listFollowUps({ bookingId, page, limit }) {
  const filter = { booking: bookingId };
  const [docs, total] = await Promise.all([
    PaymentFollowUp.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('by', 'fullName'),
    PaymentFollowUp.countDocuments(filter),
  ]);
  return { items: docs.map((d) => toJSON(d)), total };
}

module.exports = { BUCKET_NAMES, summary, listBucket, createFollowUp, listFollowUps };
