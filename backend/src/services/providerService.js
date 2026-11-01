const { Types } = require('mongoose');
const ProviderProfile = require('../models/ProviderProfile');
const { rankExpression } = require('../utils/ranking');
const ServiceCategory = require('../models/ServiceCategory');
const ServiceListing = require('../models/ServiceListing');
const AppError = require('../utils/AppError');
const { toDotNotation } = require('../utils/query');
const storage = require('./storage');
const audit = require('./auditService');
const notifications = require('./notificationService');
const verificationService = require('./verificationService');
const VerificationApplication = require('../models/VerificationApplication');
const { isSuperAdmin } = require('../utils/roles');

const MAX_PORTFOLIO_ITEMS = 20;

async function assertActiveCategories(ids) {
  if (!ids || ids.length === 0) return;
  const count = await ServiceCategory.countDocuments({ _id: { $in: ids }, status: 'active' });
  if (count !== ids.length) {
    throw new AppError(400, 'One or more categories do not exist or are disabled', 'INVALID_CATEGORY');
  }
}

const profileNotFound = () =>
  new AppError(404, 'Provider profile not found. Create your profile first.', 'PROFILE_NOT_FOUND');

async function getOwnProfile(userId) {
  const profile = await ProviderProfile.findOne({ user: userId }).populate('categories', 'name slug');
  if (!profile) throw profileNotFound();
  return profile;
}

/** Creates or updates the caller's own profile. Only the fields sent are changed. */
async function upsertOwnProfile(user, data) {
  await assertActiveCategories(data.categories);
  let profile = await ProviderProfile.findOne({ user: user._id });
  if (profile) {
    profile.set(toDotNotation(data)); // dotted paths merge nested objects instead of replacing them
  } else {
    profile = new ProviderProfile({ ...data, user: user._id }); // the unique index on `user` guards against double-create races
  }
  await profile.save();
  return profile.populate('categories', 'name slug');
}

/**
 * Applying for verification now starts a PAID application (see verificationService): documents, then the published fee, then review.
 * This keeps the old endpoint working: it applies, or answers an administrator's question when more information was asked for.
 */
async function requestVerification(user, { message } = {}, ctx) {
  const profile = await getOwnProfile(user._id);
  if (profile.verificationStatus === 'needs_info') await verificationService.respond(user, { message: message || 'I have updated my details.' });
  else await verificationService.apply(user, ctx);
  return getOwnProfile(user._id);
}

async function setAvatar(user, image) {
  const profile = await getOwnProfile(user._id);
  const saved = await storage.save({ ...image, folder: 'avatars' });
  try {
    const oldKey = profile.avatarKey;
    profile.avatarKey = saved.key;
    profile.avatarUrl = saved.url;
    await profile.save();
    await storage.remove(oldKey);
    return profile;
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
}

async function addPortfolioItem(user, image, { title, description }) {
  const profile = await getOwnProfile(user._id);
  const saved = await storage.save({ ...image, folder: 'portfolio' });
  try {
    // The $exists guard makes the item limit atomic even with concurrent uploads.
    const updated = await ProviderProfile.findOneAndUpdate(
      { _id: profile._id, [`portfolio.${MAX_PORTFOLIO_ITEMS - 1}`]: { $exists: false } },
      { $push: { portfolio: { imageKey: saved.key, imageUrl: saved.url, title, description } } },
      { new: true },
    ).populate('categories', 'name slug');
    if (!updated) {
      throw new AppError(400, `A portfolio can hold at most ${MAX_PORTFOLIO_ITEMS} items`, 'PORTFOLIO_LIMIT');
    }
    return updated;
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
}

async function removePortfolioItem(user, itemId) {
  const before = await ProviderProfile.findOneAndUpdate(
    { user: user._id, 'portfolio._id': itemId },
    { $pull: { portfolio: { _id: itemId } } },
    { new: false },
  );
  if (!before) throw new AppError(404, 'Portfolio item not found', 'PORTFOLIO_ITEM_NOT_FOUND');
  const item = before.portfolio.id(itemId);
  if (item) await storage.remove(item.imageKey);
}

// ---- Public views (no private fields, ever) ----

function toPublicProvider(p) {
  return {
    id: String(p._id),
    displayName: p.displayName,
    bio: p.bio,
    avatarUrl: p.avatarUrl,
    categories: p.categories.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug })),
    skills: [...p.skills],
    experienceYears: p.experienceYears,
    location: { district: p.location?.district, sector: p.location?.sector },
    coverage: [...p.coverage],
    verified: p.verificationStatus === 'verified',
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    completedJobs: p.completedJobs,
    preferredChannel: p.contactPreferences?.preferredChannel,
    portfolio: p.portfolio.map((i) => ({ id: String(i._id), imageUrl: i.imageUrl, title: i.title, description: i.description })),
    memberSince: p.createdAt,
  };
}

const populatePublic = (query) => query.populate('categories', 'name slug');

/**
 * Public provider search (verified providers only).
 * Sorting: relevance (keyword match, needs q), top (weighted customer rating), rating, experience, newest.
 * Default: relevance with q, otherwise rating.
 */
async function listPublic({ page, limit, q, category, district, minRating, sort }) {
  const filter = { verificationStatus: 'verified' };
  if (q) filter.$text = { $search: q };
  if (category) filter.categories = category;
  if (district) filter.$or = [{ 'location.district': district }, { coverage: district }];
  if (minRating) filter.ratingAvg = { $gte: minRating };

  let effectiveSort = sort || (q ? 'relevance' : 'rating');
  if (effectiveSort === 'relevance' && !q) effectiveSort = 'rating';
  const useScore = effectiveSort === 'relevance';
  const sortSpecs = {
    relevance: { score: { $meta: 'textScore' }, ratingAvg: -1, _id: -1 },
    rating: { ratingAvg: -1, ratingCount: -1, completedJobs: -1, _id: -1 },
    experience: { experienceYears: -1, ratingAvg: -1, _id: -1 },
    newest: { createdAt: -1, _id: -1 },
  };

  if (effectiveSort === 'top') {
    // Weighted rating needs a computed field, so rank in an aggregation, then load the page's profiles in that order.
    const match = { ...filter, ...(category ? { categories: new Types.ObjectId(category) } : {}) };
    const [ranked, total] = await Promise.all([
      ProviderProfile.aggregate([
        { $match: match },
        { $addFields: { _rank: rankExpression('$ratingAvg', '$ratingCount') } },
        { $sort: { _rank: -1, ratingCount: -1, completedJobs: -1, _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { _id: 1 } },
      ]),
      ProviderProfile.countDocuments(filter),
    ]);
    const ids = ranked.map((r) => String(r._id));
    const docs = await populatePublic(ProviderProfile.find({ _id: { $in: ids } }));
    docs.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));
    return { items: docs.map(toPublicProvider), total };
  }

  const [items, total] = await Promise.all([
    populatePublic(
      ProviderProfile.find(filter, useScore ? { score: { $meta: 'textScore' } } : undefined)
        .sort(sortSpecs[effectiveSort])
        .skip((page - 1) * limit)
        .limit(limit),
    ),
    ProviderProfile.countDocuments(filter),
  ]);
  return { items: items.map(toPublicProvider), total };
}

async function getPublic(id) {
  const profile = await populatePublic(ProviderProfile.findOne({ _id: id, verificationStatus: 'verified' }));
  if (!profile) throw new AppError(404, 'Provider not found', 'PROVIDER_NOT_FOUND');
  return toPublicProvider(profile);
}

// ---- Admin ----

async function listForAdmin({ page, limit, verificationStatus }) {
  const filter = verificationStatus ? { verificationStatus } : {};
  const [items, total] = await Promise.all([
    ProviderProfile.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('categories', 'name slug')
      .populate('user', 'fullName email phone'),
    ProviderProfile.countDocuments(filter),
  ]);
  return { items, total };
}

/**
 * The older admin endpoint. Approval is no longer possible here: only the super administrator approves, through the verification
 * review, and only after payment was confirmed and an administrator recommended it. What remains: asking for more information and
 * rejecting (administrators, with a reason), and withdrawing verification (super administrator).
 */
async function setVerification(profileId, { status, note }, admin, ctx) {
  const profile = await ProviderProfile.findById(profileId);
  if (!profile) throw new AppError(404, 'Provider not found', 'PROVIDER_NOT_FOUND');
  if (status === 'verified') {
    throw new AppError(409, 'Verification is approved by the super administrator after review. Use the verification review.', 'USE_VERIFICATION_REVIEW');
  }
  if (status === 'unverified') {
    if (!isSuperAdmin(admin)) throw new AppError(403, 'Only the super administrator can withdraw verification', 'FORBIDDEN');
    await verificationService.revoke(admin, profile._id, { reason: note }, ctx);
    return ProviderProfile.findById(profile._id);
  }
  const app = await VerificationApplication.findOne({ provider: profile._id, active: true });
  if (!app) throw new AppError(409, 'This provider has no verification application to review', 'INVALID_TRANSITION');
  if (status === 'needs_info') await verificationService.requestInfo(admin, app._id, { message: note }, ctx);
  else await verificationService.reject(admin, app._id, { reason: note }, ctx);
  return ProviderProfile.findById(profile._id);
}

module.exports = {
  getOwnProfile,
  upsertOwnProfile,
  requestVerification,
  setAvatar,
  addPortfolioItem,
  removePortfolioItem,
  listPublic,
  getPublic,
  listForAdmin,
  setVerification,
};
