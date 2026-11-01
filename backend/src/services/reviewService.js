const mongoose = require('mongoose');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const notifications = require('./notificationService');
const audit = require('./auditService');

const idOf = (v) => String(v?._id ?? v);
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const firstName = (name = '') => name.split(' ')[0];

/**
 * A provider's rating is always recomputed from their published reviews, never adjusted with +1 / -1,
 * so creating, hiding or restoring a review can never leave the average wrong, even if two happen at once.
 */
async function recomputeRating(providerId) {
  const [agg] = await Review.aggregate([
    { $match: { provider: oid(providerId), status: 'published' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await ProviderProfile.updateOne(
    { _id: providerId },
    { $set: { ratingAvg: agg ? Math.round(agg.avg * 100) / 100 : 0, ratingCount: agg ? agg.count : 0 } },
  );
}

/** What each viewer of a booking sees of its review. The provider never sees a hidden review. */
function toBookingReview(review, role, viewerId) {
  if (!review) return null;
  if (role === 'provider' && review.status !== 'published') return null;
  return {
    id: String(review._id),
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    createdAt: review.createdAt,
    ...(role !== 'provider' && review.status === 'hidden' ? { hiddenReason: review.hiddenReason } : {}),
    ...(role === 'provider' ? { reported: review.reports.some((r) => idOf(r.by) === String(viewerId)) } : {}),
    ...(role === 'admin' ? { reportCount: review.reportCount } : {}),
  };
}

async function create(user, bookingId, { rating, comment }) {
  const booking = await Booking.findById(bookingId);
  // Only the customer who hired the provider; everyone else cannot tell the booking exists.
  if (!booking || idOf(booking.customer) !== String(user._id)) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (idOf(booking.providerUser) === String(user._id)) throw new AppError(403, 'You cannot rate yourself', 'SELF_REVIEW');
  if (booking.status !== 'completed') {
    throw new AppError(409, 'You can review a provider once the job is completed', 'BOOKING_NOT_COMPLETED');
  }

  let review;
  try {
    review = await Review.create({ booking: booking._id, provider: booking.provider, customer: user._id, rating, comment });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'You have already reviewed this job', 'REVIEW_EXISTS');
    throw err;
  }
  await recomputeRating(booking.provider);
  await notifications.notify(booking.providerUser, {
    type: 'review.received',
    title: `New ${rating}-star review: ${booking.title}`,
    body: comment.length > 120 ? `${comment.slice(0, 117)}...` : comment,
    link: `/dashboard/bookings/${booking._id}`,
  });
  return toBookingReview(review, 'customer', user._id);
}

/** Public: published reviews of a verified provider, newest first, with a rating summary. */
async function listForProvider(providerId, { page, limit, rating }) {
  if (!(await ProviderProfile.exists({ _id: providerId, verificationStatus: 'verified' }))) {
    throw new AppError(404, 'Provider not found', 'PROVIDER_NOT_FOUND');
  }
  const filter = { provider: providerId, status: 'published', ...(rating ? { rating } : {}) };
  const [docs, total, grouped] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('customer', 'fullName'),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { provider: oid(providerId), status: 'published' } },
      { $group: { _id: '$rating', n: { $sum: 1 } } },
    ]),
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const g of grouped) { distribution[g._id] = g.n; count += g.n; sum += g._id * g.n; }

  return {
    items: docs.map((r) => ({ id: String(r._id), rating: r.rating, comment: r.comment, createdAt: r.createdAt, reviewer: { name: firstName(r.customer?.fullName) } })),
    total,
    summary: { average: count ? Math.round((sum / count) * 100) / 100 : 0, count, distribution },
  };
}

/** The reviewed provider flags a review for moderation. One report each; reporting never hides anything by itself. */
async function report(user, reviewId, { reason, note }) {
  const review = await Review.findById(reviewId).populate('provider', 'user');
  if (!review || review.status !== 'published' || idOf(review.provider.user) !== String(user._id)) {
    throw new AppError(404, 'Review not found', 'REVIEW_NOT_FOUND');
  }
  const updated = await Review.findOneAndUpdate(
    { _id: review._id, 'reports.by': { $ne: user._id } },
    { $push: { reports: { by: user._id, reason, note: note || undefined, at: new Date() } }, $inc: { reportCount: 1 } },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'You have already reported this review', 'ALREADY_REPORTED');
  return toBookingReview(updated, 'provider', user._id);
}

// ---- Admin moderation ----

async function listForAdmin({ page, limit, status, reported }) {
  const filter = {};
  if (status) filter.status = status;
  if (reported) filter.reportCount = { $gt: 0 };
  const [docs, total] = await Promise.all([
    Review.find(filter)
      .sort(reported ? { reportCount: -1, createdAt: -1 } : { createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'fullName')
      .populate('provider', 'displayName'),
    Review.countDocuments(filter),
  ]);
  return {
    items: docs.map((r) => ({
      id: String(r._id),
      booking: idOf(r.booking),
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      hiddenReason: r.hiddenReason,
      reportCount: r.reportCount,
      reports: r.reports.map((x) => ({ reason: x.reason, note: x.note, at: x.at })),
      reviewer: { name: r.customer?.fullName },
      provider: { id: idOf(r.provider), displayName: r.provider?.displayName },
      createdAt: r.createdAt,
      moderatedAt: r.moderatedAt,
    })),
    total,
  };
}

async function moderate(admin, reviewId, { status, reason }, ctx) {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError(404, 'Review not found', 'REVIEW_NOT_FOUND');
  if (review.status === status) return { id: String(review._id), status: review.status }; // already in that state

  review.status = status;
  review.moderatedBy = admin._id;
  review.moderatedAt = new Date();
  review.hiddenReason = status === 'hidden' ? reason : undefined;
  await review.save();

  await recomputeRating(review.provider);
  await audit.record({
    actor: admin._id,
    action: status === 'hidden' ? 'review.hidden' : 'review.restored',
    entityType: 'Review',
    entityId: review._id,
    metadata: { provider: String(review.provider), reason },
    ctx,
  });
  if (status === 'hidden') {
    await notifications.notify(review.customer, {
      type: 'review.moderated',
      title: 'Your review was removed',
      body: reason,
      link: `/dashboard/bookings/${review.booking}`,
    });
  }
  return { id: String(review._id), status: review.status };
}

/**
 * Rating history for the signed-in person. Customers see the reviews they wrote; providers see the reviews they received
 * (never hidden ones) with their average, how many people rated and a month-by-month history.
 */
async function history(user, { as, page, limit }) {
  if (as === 'provider') {
    const profile = await ProviderProfile.findOne({ user: user._id }).select('ratingAvg ratingCount completedJobs');
    if (!profile) throw new AppError(404, 'You have no provider profile', 'PROVIDER_NOT_FOUND');
    const filter = { provider: profile._id, status: 'published' };
    const [docs, total, byMonth] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('customer', 'fullName').populate('booking', 'title'),
      Review.countDocuments(filter),
      Review.aggregate([{ $match: { provider: profile._id, status: 'published' } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, average: { $avg: '$rating' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    return {
      items: docs.map((r) => ({ id: String(r._id), rating: r.rating, comment: r.comment, createdAt: r.createdAt, reviewer: firstName(r.customer?.fullName), job: r.booking?.title })),
      total,
      summary: { average: profile.ratingAvg, count: profile.ratingCount, completedJobs: profile.completedJobs },
      months: byMonth.map((m) => ({ month: m._id, average: Math.round(m.average * 100) / 100, count: m.count })),
    };
  }
  const filter = { customer: user._id };
  const [docs, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('provider', 'displayName').populate('booking', 'title'),
    Review.countDocuments(filter),
  ]);
  return { items: docs.map((r) => ({ id: String(r._id), rating: r.rating, comment: r.comment, status: r.status, createdAt: r.createdAt, provider: r.provider?.displayName, job: r.booking?.title })), total, summary: null, months: [] };
}

module.exports = {
  history, recomputeRating, toBookingReview, create, listForProvider, report, listForAdmin, moderate };
