const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceRequest = require('../models/ServiceRequest');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const Dispute = require('../models/Dispute');
const AuditLog = require('../models/AuditLog');
const paymentService = require('./paymentService');

const DAY_MS = 86_400_000;
const countBy = (rows, key) => Object.fromEntries(rows.map((r) => [r._id ?? key, r.n]));
const grouped = (Model, field = 'status') => Model.aggregate([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }]);

/** Everything the administrator's home screen needs, in one call. */
async function dashboard() {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const [
    totalUsers, suspendedUsers, joinedLast7, roleRows, providerRows, requestRows, bookingRows,
    reviewsPublished, reviewsHidden, reviewsReported, disputeRows, manualWaiting, finance, activity,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'suspended' }),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    User.aggregate([{ $unwind: '$roles' }, { $group: { _id: '$roles', n: { $sum: 1 } } }]),
    grouped(ProviderProfile, 'verificationStatus'),
    grouped(ServiceRequest),
    grouped(Booking),
    Review.countDocuments({ status: 'published' }),
    Review.countDocuments({ status: 'hidden' }),
    Review.countDocuments({ status: 'published', reportCount: { $gt: 0 } }),
    grouped(Dispute),
    Payment.countDocuments({ status: 'pending', gateway: 'manual' }),
    paymentService.summary(),
    AuditLog.find({ action: { $not: /^auth\./ } }).sort({ createdAt: -1 }).limit(15).populate('actor', 'fullName'),
  ]);

  const roles = countBy(roleRows);
  const providers = countBy(providerRows);
  const requests = countBy(requestRows);
  const jobs = countBy(bookingRows);
  const disputes = countBy(disputeRows);
  const n = (obj, k) => obj[k] ?? 0;
  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

  return {
    users: { total: totalUsers, suspended: suspendedUsers, joinedLast7Days: joinedLast7, byRole: { customer: n(roles, 'customer'), provider: n(roles, 'provider'), business: n(roles, 'business'), admin: n(roles, 'admin'), super_admin: n(roles, 'super_admin'), finance: n(roles, 'finance') } },
    providers: { total: sum(providers), verified: n(providers, 'verified'), unverified: n(providers, 'unverified'), pending: n(providers, 'pending'), needsInfo: n(providers, 'needs_info'), rejected: n(providers, 'rejected') },
    requests: { total: sum(requests), open: n(requests, 'open'), accepted: n(requests, 'accepted'), cancelled: n(requests, 'cancelled') },
    jobs: { total: sum(jobs), active: n(jobs, 'accepted') + n(jobs, 'in_progress'), completed: n(jobs, 'completed'), cancelled: n(jobs, 'cancelled'), disputed: n(jobs, 'disputed') },
    reviews: { published: reviewsPublished, hidden: reviewsHidden, reported: reviewsReported },
    disputes: { open: n(disputes, 'open'), underReview: n(disputes, 'under_review'), resolved: n(disputes, 'resolved') },
    // Gross value and platform revenue are different numbers, and neither is profit (see paymentService.summary).
    finance,
    needsAttention: {
      providersToVerify: n(providers, 'pending'),
      reportedReviews: reviewsReported,
      openDisputes: n(disputes, 'open') + n(disputes, 'under_review'),
      manualPaymentsWaiting: manualWaiting,
    },
    recentActivity: activity.map((a) => ({ id: String(a._id), action: a.action, entityType: a.entityType, entityId: a.entityId ? String(a.entityId) : undefined, actor: a.actor?.fullName ?? 'System', at: a.createdAt })),
  };
}

const dayKey = (d) => d.toISOString().slice(0, 10);

/** Day by day activity between two dates (inclusive, UTC), with every day present even when nothing happened. */
async function report({ from, to }) {
  const end = to ? new Date(`${to}T00:00:00.000Z`) : new Date(`${dayKey(new Date())}T00:00:00.000Z`);
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 29 * DAY_MS);
  const endExclusive = new Date(end.getTime() + DAY_MS);
  const byDay = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}` } });
  const inRange = (field) => ({ [field]: { $gte: start, $lt: endExclusive } });

  const [users, requests, completed, paid, refunds] = await Promise.all([
    User.aggregate([{ $match: inRange('createdAt') }, { $group: { _id: byDay('createdAt'), n: { $sum: 1 } } }]),
    ServiceRequest.aggregate([{ $match: inRange('createdAt') }, { $group: { _id: byDay('createdAt'), n: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { status: 'completed', ...inRange('completedAt') } }, { $group: { _id: byDay('completedAt'), n: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'succeeded', ...inRange('confirmedAt') } }, { $group: { _id: byDay('confirmedAt'), gross: { $sum: '$amount' }, commission: { $sum: '$commissionAmount' } } }]),
    Payment.aggregate([{ $unwind: '$refunds' }, { $match: { 'refunds.at': { $gte: start, $lt: endExclusive } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$refunds.at' } }, amount: { $sum: '$refunds.amount' } } }]),
  ]);

  const index = (rows) => new Map(rows.map((r) => [r._id, r]));
  const [u, r, c, p, f] = [users, requests, completed, paid, refunds].map(index);
  const series = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const date = dayKey(new Date(t));
    series.push({ date, newUsers: u.get(date)?.n ?? 0, requests: r.get(date)?.n ?? 0, completedJobs: c.get(date)?.n ?? 0, grossValue: p.get(date)?.gross ?? 0, commission: p.get(date)?.commission ?? 0, refunds: f.get(date)?.amount ?? 0 });
  }
  const totals = series.reduce((a, d) => ({ newUsers: a.newUsers + d.newUsers, requests: a.requests + d.requests, completedJobs: a.completedJobs + d.completedJobs, grossValue: a.grossValue + d.grossValue, commission: a.commission + d.commission, refunds: a.refunds + d.refunds }), { newUsers: 0, requests: 0, completedJobs: 0, grossValue: 0, commission: 0, refunds: 0 });
  return { from: dayKey(start), to: dayKey(end), series, totals };
}

module.exports = { dashboard, report };
