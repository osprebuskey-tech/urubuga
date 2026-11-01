const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceRequest = require('../models/ServiceRequest');
const ServiceCategory = require('../models/ServiceCategory');
const Quotation = require('../models/Quotation');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Dispute = require('../models/Dispute');
const AuditLog = require('../models/AuditLog');
const { STAFF_ROLES } = require('../utils/roles');
const followUps = require('./paymentFollowUpService');

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVIDER_ROWS = 100;
const dayKey = (d) => d.toISOString().slice(0, 10);
const n = (v) => v ?? 0;
const round1 = (v) => Math.round(v * 10) / 10;

function period({ from, to }) {
  const end = to ? new Date(`${to}T00:00:00.000Z`) : new Date(`${dayKey(new Date())}T00:00:00.000Z`);
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 29 * DAY_MS);
  const endExclusive = new Date(end.getTime() + DAY_MS);
  return { start, end, endExclusive, range: (field) => ({ [field]: { $gte: start, $lt: endExclusive } }) };
}

/** How many are waiting, and since when the oldest one has been. */
async function oldestAndCount(Model, filter, field) {
  const [count, oldest] = await Promise.all([Model.countDocuments(filter), Model.findOne(filter).sort({ [field]: 1 }).select(field)]);
  return { count, oldestAt: oldest?.[field] || undefined };
}

/** What is waiting right now, whatever the date range: this is a snapshot, not a period total. */
async function pendings() {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY_MS);

  const [verification, needsInfo, disputesOpen, disputesReview, reports, money, noQuotes, quotesWaiting, notStarted, inProgress, pastDate] = await Promise.all([
    oldestAndCount(ProviderProfile, { verificationStatus: 'pending' }, 'updatedAt'),
    oldestAndCount(ProviderProfile, { verificationStatus: 'needs_info' }, 'updatedAt'),
    oldestAndCount(Dispute, { status: 'open' }, 'createdAt'),
    oldestAndCount(Dispute, { status: 'under_review' }, 'createdAt'),
    oldestAndCount(Review, { status: 'published', reportCount: { $gt: 0 } }, 'createdAt'),
    followUps.summary(),
    // Open requests older than three days that no provider has quoted on
    ServiceRequest.aggregate([
      { $match: { status: 'open', createdAt: { $lt: threeDaysAgo } } },
      { $lookup: { from: 'quotations', localField: '_id', foreignField: 'request', as: 'q' } },
      { $match: { q: { $size: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
    ]),
    Quotation.aggregate([{ $match: { status: 'pending', expiresAt: { $gt: now } } }, { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: '$createdAt' } } }]),
    oldestAndCount(Booking, { status: 'accepted', createdAt: { $lt: threeDaysAgo } }, 'createdAt'),
    oldestAndCount(Booking, { status: 'in_progress' }, 'startedAt'),
    // Jobs in progress whose customer's preferred completion date has gone by
    Booking.aggregate([
      { $match: { status: 'in_progress' } },
      { $lookup: { from: 'servicerequests', localField: 'request', foreignField: '_id', as: 'r' } },
      { $unwind: '$r' },
      { $match: { 'r.preferredDate': { $lt: now } } },
      { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: '$r.preferredDate' } } },
    ]),
  ]);

  const agg = (rows) => ({ count: n(rows[0]?.count), oldestAt: rows[0]?.oldest });
  const item = (key, group, x, extra) => ({ key, group, count: x.count, oldestAt: x.oldestAt, ...extra });
  return [
    item('providers_awaiting_verification', 'Providers', verification),
    item('providers_asked_for_info', 'Providers', needsInfo),
    item('disputes_open', 'Disputes', disputesOpen),
    item('disputes_under_review', 'Disputes', disputesReview),
    item('reviews_reported', 'Reviews', reports),
    item('payments_awaiting_confirmation', 'Payments', { count: money.awaiting_confirmation.count, oldestAt: money.awaiting_confirmation.oldestAt }, { value: money.awaiting_confirmation.value, overdue: money.awaiting_confirmation.overdue }),
    item('jobs_unpaid', 'Payments', { count: money.unpaid_jobs.count, oldestAt: money.unpaid_jobs.oldestAt }, { value: money.unpaid_jobs.value, overdue: money.unpaid_jobs.overdue }),
    item('payouts_due', 'Payments', { count: money.payouts_due.count, oldestAt: money.payouts_due.oldestAt }, { value: money.payouts_due.value, overdue: money.payouts_due.overdue }),
    item('requests_without_quotations', 'Marketplace', agg(noQuotes)),
    item('quotations_awaiting_customer', 'Marketplace', agg(quotesWaiting)),
    item('jobs_not_started', 'Service delivery', notStarted),
    item('jobs_in_progress', 'Service delivery', inProgress),
    item('jobs_past_preferred_date', 'Service delivery', agg(pastDate)),
  ];
}

/** One row per provider who did something in the period. Providers who did nothing are only counted. */
async function providers(p) {
  const [quotes, won, done, reviews, disputes] = await Promise.all([
    Quotation.aggregate([{ $match: p.range('createdAt') }, { $group: { _id: '$provider', sent: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } } } }]),
    Booking.aggregate([{ $match: p.range('createdAt') }, { $group: { _id: '$provider', won: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }]),
    Booking.aggregate([{ $match: { status: 'completed', ...p.range('completedAt') } }, { $group: { _id: '$provider', completed: { $sum: 1 }, value: { $sum: '$agreedPrice' } } }]),
    Review.aggregate([{ $match: { status: 'published', ...p.range('createdAt') } }, { $group: { _id: '$provider', reviews: { $sum: 1 }, avg: { $avg: '$rating' } } }]),
    Dispute.aggregate([{ $match: p.range('createdAt') }, { $group: { _id: '$providerUser', disputes: { $sum: 1 } } }]),
  ]);

  // Disputes are recorded against the provider's user account; everything else against the profile.
  const disputeUsers = disputes.map((d) => d._id);
  const profilesByUser = disputeUsers.length ? await ProviderProfile.find({ user: { $in: disputeUsers } }).select('_id user') : [];
  const userToProfile = new Map(profilesByUser.map((x) => [String(x.user), String(x._id)]));

  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { providerId: id, quotationsSent: 0, quotationsAccepted: 0, jobsWon: 0, jobsCancelled: 0, jobsCompleted: 0, completedValue: 0, reviews: 0, avgRating: null, disputes: 0 });
    return rows.get(id);
  };
  quotes.forEach((q) => Object.assign(row(String(q._id)), { quotationsSent: q.sent, quotationsAccepted: q.accepted }));
  won.forEach((w) => Object.assign(row(String(w._id)), { jobsWon: w.won, jobsCancelled: w.cancelled }));
  done.forEach((d) => Object.assign(row(String(d._id)), { jobsCompleted: d.completed, completedValue: d.value }));
  reviews.forEach((r) => Object.assign(row(String(r._id)), { reviews: r.reviews, avgRating: round1(r.avg) }));
  disputes.forEach((d) => { const id = userToProfile.get(String(d._id)); if (id) row(id).disputes += d.disputes; });

  const all = [...rows.values()].sort((a, b) => b.completedValue - a.completedValue || b.jobsCompleted - a.jobsCompleted || b.quotationsSent - a.quotationsSent);
  const shown = all.slice(0, PROVIDER_ROWS);
  const profiles = await ProviderProfile.find({ _id: { $in: shown.map((r) => r.providerId) } }).select('displayName verificationStatus ratingAvg ratingCount');
  const byId = new Map(profiles.map((x) => [String(x._id), x]));
  const verified = await ProviderProfile.countDocuments({ verificationStatus: 'verified' });

  return {
    rows: shown.map((r) => {
      const prof = byId.get(r.providerId);
      return { ...r, name: prof?.displayName ?? 'Removed provider', verificationStatus: prof?.verificationStatus, overallRating: prof?.ratingCount ? round1(prof.ratingAvg) : null };
    }),
    activeProviders: all.length,
    verifiedProviders: verified,
    inactiveVerifiedProviders: Math.max(verified - all.length, 0),
    truncated: all.length > PROVIDER_ROWS,
  };
}

/** How jobs actually went: outcomes, speed, and where the request-to-job funnel loses people. */
async function delivery(p) {
  const [statuses, completion, start, categories, requests, withQuotes] = await Promise.all([
    Booking.aggregate([{ $match: p.range('createdAt') }, { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$agreedPrice' } } }]),
    Booking.aggregate([{ $match: { status: 'completed', startedAt: { $exists: true }, ...p.range('completedAt') } }, { $group: { _id: null, avgMs: { $avg: { $subtract: ['$completedAt', '$startedAt'] } }, count: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { startedAt: { $exists: true }, ...p.range('startedAt') } }, { $group: { _id: null, avgMs: { $avg: { $subtract: ['$startedAt', '$createdAt'] } } } }]),
    Booking.aggregate([{ $match: p.range('createdAt') }, { $group: { _id: '$category', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, value: { $sum: '$agreedPrice' } } }, { $sort: { total: -1 } }, { $limit: 20 }]),
    ServiceRequest.aggregate([{ $match: p.range('createdAt') }, { $group: { _id: null, total: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }]),
    ServiceRequest.aggregate([
      { $match: p.range('createdAt') },
      { $lookup: { from: 'quotations', localField: '_id', foreignField: 'request', as: 'q' } },
      { $match: { 'q.0': { $exists: true } } },
      { $count: 'count' },
    ]),
  ]);

  const count = (s) => statuses.find((x) => x._id === s)?.count ?? 0;
  const value = (s) => statuses.find((x) => x._id === s)?.value ?? 0;
  const jobs = { total: statuses.reduce((s, x) => s + x.count, 0), accepted: count('accepted'), in_progress: count('in_progress'), completed: count('completed'), cancelled: count('cancelled'), disputed: count('disputed') };
  const finished = jobs.completed + jobs.cancelled + jobs.disputed; // jobs that have reached an end

  const cats = await ServiceCategory.find({ _id: { $in: categories.map((c) => c._id) } }).select('name');
  const catName = new Map(cats.map((c) => [String(c._id), c.name]));
  const r = requests[0] || {};

  return {
    jobs,
    completedValue: value('completed'),
    completionRate: finished ? round1((jobs.completed / finished) * 100) : null, // of jobs that have ended, the share that were completed
    avgDaysToComplete: completion[0] ? round1(completion[0].avgMs / DAY_MS) : null,
    avgDaysToStart: start[0] ? round1(start[0].avgMs / DAY_MS) : null,
    funnel: { requests: n(r.total), withQuotations: n(withQuotes[0]?.count), accepted: n(r.accepted), cancelled: n(r.cancelled) },
    byCategory: categories.map((c) => ({ category: catName.get(String(c._id)) ?? 'Removed category', jobs: c.total, completed: c.completed, value: c.value })),
  };
}

// Sign-in and sign-out are not "work".
const NOT_WORK = /^auth\./;

/** What each staff member actually did, from the audit log. Staff with no activity are listed too: that is the point. */
async function adminWork(p) {
  const staff = await User.find({ roles: { $in: STAFF_ROLES } }).select('fullName email roles status lastLoginAt createdAt').sort({ fullName: 1 });
  const ids = staff.map((s) => s._id);
  const [byActor, lastSeen] = await Promise.all([
    AuditLog.aggregate([
      { $match: { actor: { $in: ids }, action: { $not: NOT_WORK }, ...p.range('createdAt') } },
      { $group: { _id: { actor: '$actor', action: '$action' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]),
    AuditLog.aggregate([{ $match: { actor: { $in: ids }, action: { $not: NOT_WORK } } }, { $group: { _id: '$actor', last: { $max: '$createdAt' } } }]),
  ]);
  const last = new Map(lastSeen.map((x) => [String(x._id), x.last]));

  const members = staff.map((s) => {
    const actions = byActor.filter((x) => String(x._id.actor) === String(s._id)).map((x) => ({ action: x._id.action, count: x.count })).sort((a, b) => b.count - a.count);
    return {
      id: String(s._id),
      name: s.fullName,
      email: s.email,
      roles: s.roles,
      status: s.status,
      lastSignInAt: s.lastLoginAt,
      lastActionAt: last.get(String(s._id)),
      total: actions.reduce((sum, a) => sum + a.count, 0),
      actions,
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const totals = new Map();
  byActor.forEach((x) => totals.set(x._id.action, (totals.get(x._id.action) ?? 0) + x.count));
  return { members, byAction: [...totals.entries()].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count) };
}

async function report(query) {
  const p = period(query);
  const [pend, prov, deliv, work] = await Promise.all([pendings(), providers(p), delivery(p), adminWork(p)]);
  return { from: dayKey(p.start), to: dayKey(p.end), generatedAt: new Date(), pendings: pend, providers: prov, delivery: deliv, adminWork: work };
}

module.exports = { report };
