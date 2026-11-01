const ProviderProfile = require('../models/ProviderProfile');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const VerificationApplication = require('../models/VerificationApplication');
const VerificationRecommendation = require('../models/VerificationRecommendation');
const AppError = require('../utils/AppError');
const notifications = require('./notificationService');
const audit = require('./auditService');
const { rankScore } = require('../utils/ranking');
const { superAdminIds } = require('./verificationService');

const idOf = (v) => String(v?._id ?? v);

/**
 * Admin ratings report: providers whose published ratings and completed jobs make them worth a look. The thresholds are filters the
 * administrator chooses; nothing here changes anyone's verification.
 */
async function providerReport({ page, limit, minRating, minReviews, minJobs, verification }) {
  const filter = { ratingAvg: { $gte: minRating }, ratingCount: { $gte: minReviews }, completedJobs: { $gte: minJobs } };
  if (verification === 'verified') filter.verificationStatus = 'verified';
  if (verification === 'not_verified') filter.verificationStatus = { $ne: 'verified' };
  const [docs, total] = await Promise.all([
    ProviderProfile.find(filter).sort({ ratingAvg: -1, ratingCount: -1, completedJobs: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('categories', 'name'),
    ProviderProfile.countDocuments(filter),
  ]);
  const ids = docs.map((d) => d._id);
  const [openRecs, apps] = await Promise.all([
    VerificationRecommendation.find({ provider: { $in: ids }, status: 'open' }).select('provider'),
    VerificationApplication.find({ provider: { $in: ids }, active: true }).select('provider status paymentStatus'),
  ]);
  const recommended = new Set(openRecs.map((r) => idOf(r.provider)));
  const appBy = new Map(apps.map((a) => [idOf(a.provider), a]));
  return {
    items: docs.map((p) => ({
      id: String(p._id), displayName: p.displayName, providerType: p.providerType, categories: p.categories.map((c) => c.name),
      ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, completedJobs: p.completedJobs, score: Math.round(rankScore(p.ratingAvg, p.ratingCount) * 100) / 100,
      verificationStatus: p.verificationStatus, recommended: recommended.has(String(p._id)),
      application: appBy.get(String(p._id)) ? { status: appBy.get(String(p._id)).status, paymentStatus: appBy.get(String(p._id)).paymentStatus } : null,
    })),
    total,
  };
}

/** The evidence behind a recommendation: rating spread, the latest written reviews and the completed jobs. */
async function providerEvidence(id) {
  const profile = await ProviderProfile.findById(id).populate('categories', 'name');
  if (!profile) throw new AppError(404, 'Provider not found', 'PROVIDER_NOT_FOUND');
  const [grouped, reviews, jobs] = await Promise.all([
    Review.aggregate([{ $match: { provider: profile._id, status: 'published' } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
    Review.find({ provider: profile._id, status: 'published' }).sort({ createdAt: -1 }).limit(10).populate('customer', 'fullName').populate('booking', 'title'),
    Booking.find({ provider: profile._id, status: 'completed' }).sort({ completedAt: -1 }).limit(10).select('title completedAt'),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  grouped.forEach((g) => { distribution[g._id] = g.n; });
  return {
    id: String(profile._id), displayName: profile.displayName, verificationStatus: profile.verificationStatus, providerType: profile.providerType,
    ratingAvg: profile.ratingAvg, ratingCount: profile.ratingCount, completedJobs: profile.completedJobs, distribution,
    reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.createdAt, reviewer: (r.customer?.fullName || '').split(' ')[0], job: r.booking?.title })),
    completedJobList: jobs.map((j) => ({ title: j.title, completedAt: j.completedAt })),
  };
}

/** An administrator asks the super administrator to consider a provider. Advice only: it verifies nobody. */
async function recommend(admin, providerId, { note }, ctx) {
  const profile = await ProviderProfile.findById(providerId);
  if (!profile) throw new AppError(404, 'Provider not found', 'PROVIDER_NOT_FOUND');
  if (profile.verificationStatus === 'verified') throw new AppError(409, 'This provider is already verified', 'ALREADY_VERIFIED');
  if (!profile.ratingCount) throw new AppError(409, 'A provider needs customer ratings before they can be recommended', 'NO_RATINGS');
  const ratings = { average: profile.ratingAvg, count: profile.ratingCount, completedJobs: profile.completedJobs };
  let rec;
  try {
    rec = await VerificationRecommendation.create({ provider: profile._id, by: admin._id, note, ratings });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'This provider already has an open recommendation', 'ALREADY_RECOMMENDED');
    throw err;
  }
  await audit.record({ actor: admin._id, action: 'verification.recommendation_created', entityType: 'ProviderProfile', entityId: profile._id, metadata: { ratings, note }, ctx, strict: true });
  await notifications.notifyMany(await superAdminIds(), { type: 'verification.recommendation', title: `Recommended for verification: ${profile.displayName}`, body: `${ratings.average.toFixed(1)} stars from ${ratings.count} reviews, ${ratings.completedJobs} jobs. ${note}`.slice(0, 390), link: '/dashboard/super/recommendations' });
  const applying = await VerificationApplication.exists({ provider: profile._id, active: true });
  if (!applying) await notifications.notify(profile.user, { type: 'verification.updated', title: 'You were recommended for verification', body: 'Your ratings stand out. Apply for verification to be reviewed.', link: '/dashboard/provider/verification' });
  return rec;
}

async function listRecommendations({ page, limit, status }) {
  const filter = status ? { status } : {};
  const [docs, total] = await Promise.all([
    VerificationRecommendation.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('provider', 'displayName verificationStatus ratingAvg ratingCount completedJobs').populate('by', 'fullName'),
    VerificationRecommendation.countDocuments(filter),
  ]);
  const apps = await VerificationApplication.find({ provider: { $in: docs.map((d) => d.provider?._id) }, active: true }).select('provider status paymentStatus');
  const appBy = new Map(apps.map((a) => [idOf(a.provider), a]));
  return { items: docs.map((r) => ({
    id: String(r._id), status: r.status, note: r.note, ratings: r.ratings, createdAt: r.createdAt, recommendedBy: r.by?.fullName,
    provider: { id: idOf(r.provider), displayName: r.provider?.displayName, verificationStatus: r.provider?.verificationStatus, ratingAvg: r.provider?.ratingAvg, ratingCount: r.provider?.ratingCount, completedJobs: r.provider?.completedJobs },
    application: appBy.get(idOf(r.provider)) ? { id: String(appBy.get(idOf(r.provider))._id), status: appBy.get(idOf(r.provider)).status, paymentStatus: appBy.get(idOf(r.provider)).paymentStatus } : null,
  })), total };
}

async function resolveRecommendation(superAdmin, id, { status, note }, ctx) {
  const rec = await VerificationRecommendation.findOneAndUpdate({ _id: id, status: 'open' }, { $set: { status, resolvedBy: superAdmin._id, resolvedAt: new Date(), resolutionNote: note || undefined } }, { new: true });
  if (!rec) throw new AppError(404, 'Open recommendation not found', 'RECOMMENDATION_NOT_FOUND');
  await audit.record({ actor: superAdmin._id, action: `verification.recommendation_${status}`, entityType: 'VerificationRecommendation', entityId: rec._id, metadata: { note }, ctx, strict: true });
  return rec;
}

module.exports = { providerReport, providerEvidence, recommend, listRecommendations, resolveRecommendation };
