const { Types } = require('mongoose');
const ServiceListing = require('../models/ServiceListing');
const ServiceCategory = require('../models/ServiceCategory');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const storage = require('./storage');
const { rankExpression } = require('../utils/ranking');

const MAX_IMAGES = 8;
const listingNotFound = () => new AppError(404, 'Service listing not found', 'LISTING_NOT_FOUND');

async function resolveCategory(categoryId, subcategory) {
  const category = await ServiceCategory.findOne({ _id: categoryId, status: 'active' });
  if (!category) throw new AppError(400, 'Category does not exist or is disabled', 'INVALID_CATEGORY');
  if (subcategory && !category.subcategories.some((s) => s.slug === subcategory)) {
    throw new AppError(400, 'Subcategory does not belong to this category', 'INVALID_SUBCATEGORY');
  }
  return category;
}

async function requireOwnProfile(user) {
  const profile = await ProviderProfile.findOne({ user: user._id });
  if (!profile) {
    throw new AppError(409, 'Create your provider profile before adding listings', 'PROFILE_REQUIRED');
  }
  return profile;
}

function assertCanGoLive(profile) {
  if (profile.verificationStatus !== 'verified') {
    throw new AppError(403, 'Your provider profile must be verified before a listing can go live', 'PROVIDER_NOT_VERIFIED');
  }
}

/** Loads a listing only if it belongs to the caller. Others' listings look like they do not exist (404). */
async function findOwned(user, id) {
  const profile = await requireOwnProfile(user);
  const listing = await ServiceListing.findOne({ _id: id, provider: profile._id, status: { $ne: 'archived' } });
  if (!listing) throw listingNotFound();
  return { profile, listing };
}

async function create(user, data) {
  const profile = await requireOwnProfile(user);
  await resolveCategory(data.category, data.subcategory);
  const status = data.status || 'draft';
  if (status === 'active') assertCanGoLive(profile);
  return ServiceListing.create({ ...data, status, provider: profile._id });
}

async function update(user, id, data) {
  const { profile, listing } = await findOwned(user, id);

  const categoryChanged = data.category !== undefined && String(data.category) !== String(listing.category);
  if (categoryChanged || data.subcategory !== undefined) {
    const subcategory = data.subcategory !== undefined ? data.subcategory : categoryChanged ? undefined : listing.subcategory;
    await resolveCategory(data.category ?? listing.category, subcategory);
    if (categoryChanged && data.subcategory === undefined) listing.subcategory = undefined;
  }
  if (data.status === 'active' && listing.status !== 'active') assertCanGoLive(profile);

  listing.set(data);
  if (listing.pricingType !== 'quotation' && listing.priceFrom == null) {
    throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', [
      { field: 'priceFrom', message: 'priceFrom is required for fixed and hourly pricing' },
    ]);
  }
  await listing.save();
  return listing;
}

async function archive(user, id) {
  const { listing } = await findOwned(user, id);
  listing.status = 'archived';
  await listing.save();
}

async function addImage(user, id, image) {
  const { profile } = await findOwned(user, id);
  const saved = await storage.save({ ...image, folder: 'listings' });
  try {
    const updated = await ServiceListing.findOneAndUpdate(
      { _id: id, provider: profile._id, status: { $ne: 'archived' }, [`images.${MAX_IMAGES - 1}`]: { $exists: false } },
      { $push: { images: { key: saved.key, url: saved.url } } },
      { new: true },
    );
    if (!updated) throw new AppError(400, `A listing can have at most ${MAX_IMAGES} images`, 'IMAGE_LIMIT');
    return updated;
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
}

async function removeImage(user, id, imageId) {
  const { profile } = await findOwned(user, id);
  const before = await ServiceListing.findOneAndUpdate(
    { _id: id, provider: profile._id, 'images._id': imageId },
    { $pull: { images: { _id: imageId } } },
    { new: false },
  );
  if (!before) throw new AppError(404, 'Image not found', 'IMAGE_NOT_FOUND');
  const image = before.images.id(imageId);
  if (image) await storage.remove(image.key);
}

// ---- Reads ----

const populateForDisplay = (query) =>
  query
    .populate('category', 'name slug')
    .populate('provider', 'displayName avatarUrl ratingAvg ratingCount verificationStatus user');

function toPublicListing(l, { includeStatus = false } = {}) {
  return {
    id: String(l._id),
    title: l.title,
    description: l.description,
    category: { id: String(l.category._id), name: l.category.name, slug: l.category.slug },
    subcategory: l.subcategory,
    images: l.images.map((i) => ({ id: String(i._id), url: i.url })),
    priceFrom: l.priceFrom,
    pricingType: l.pricingType,
    estimatedDuration: l.estimatedDuration,
    location: { district: l.location?.district, sector: l.location?.sector },
    availability: { days: [...(l.availability?.days || [])], notes: l.availability?.notes },
    provider: {
      id: String(l.provider._id),
      displayName: l.provider.displayName,
      avatarUrl: l.provider.avatarUrl,
      ratingAvg: l.provider.ratingAvg,
      ratingCount: l.provider.ratingCount,
      verified: l.provider.verificationStatus === 'verified',
    },
    createdAt: l.createdAt,
    ...(includeStatus ? { status: l.status } : {}),
  };
}

/**
 * Public search over active listings.
 *
 * Provider data (rating, verification) lives on ProviderProfile, so this is an aggregation with a join
 * rather than a copy of the rating on every listing, which would go stale as reviews arrive.
 * Only listings of currently verified providers are returned, even if a listing was left "active".
 *
 * Sorting: relevance (keyword match, needs q), top (verified providers by weighted customer rating), newest, rating (provider rating), price_asc / price_desc
 * (quotation-based listings have no price and always sort last). Default: relevance with q, else newest.
 * Price filters only match listings that have a price.
 */
async function listPublic({ page, limit, q, category, district, pricingType, minPrice, maxPrice, minRating, sort }) {
  const match = { status: 'active' };
  if (q) match.$text = { $search: q };
  if (category) match.category = new Types.ObjectId(category); // aggregate() does not cast ids for us
  if (district) match['location.district'] = district;
  if (pricingType) match.pricingType = pricingType;
  if (minPrice !== undefined || maxPrice !== undefined) {
    match.priceFrom = {};
    if (minPrice !== undefined) match.priceFrom.$gte = minPrice;
    if (maxPrice !== undefined) match.priceFrom.$lte = maxPrice;
  }

  const providerMatch = { 'provider.verificationStatus': 'verified' };
  if (minRating) providerMatch['provider.ratingAvg'] = { $gte: minRating };

  let effectiveSort = sort || (q ? 'relevance' : 'newest');
  if (effectiveSort === 'relevance' && !q) effectiveSort = 'newest';
  const sortSpecs = {
    relevance: { _score: -1, 'provider.ratingAvg': -1, _id: -1 },
    top: { _rank: -1, 'provider.ratingCount': -1, _id: -1 },
    newest: { createdAt: -1, _id: -1 },
    rating: { 'provider.ratingAvg': -1, 'provider.ratingCount': -1, ...(q ? { _score: -1 } : {}), _id: -1 },
    price_asc: { _noPrice: 1, priceFrom: 1, _id: -1 },
    price_desc: { _noPrice: 1, priceFrom: -1, _id: -1 },
  };

  const pipeline = [
    { $match: match },
    ...(q ? [{ $addFields: { _score: { $meta: 'textScore' } } }] : []),
    { $lookup: { from: ProviderProfile.collection.name, localField: 'provider', foreignField: '_id', as: 'provider' } },
    { $unwind: '$provider' },
    { $match: providerMatch },
    // Keep only the public provider fields; nothing else leaves the database.
    {
      $addFields: {
        provider: {
          _id: '$provider._id',
          displayName: '$provider.displayName',
          avatarUrl: '$provider.avatarUrl',
          ratingAvg: '$provider.ratingAvg',
          ratingCount: '$provider.ratingCount',
          verificationStatus: '$provider.verificationStatus',
        },
      },
    },
    { $lookup: { from: ServiceCategory.collection.name, localField: 'category', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' },
    { $addFields: { _rank: rankExpression('$provider.ratingAvg', '$provider.ratingCount') } },
    { $addFields: { _noPrice: { $cond: [{ $eq: [{ $type: '$priceFrom' }, 'missing'] }, 1, 0] } } },
    { $sort: sortSpecs[effectiveSort] },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ];

  const [result] = await ServiceListing.aggregate(pipeline);
  const total = result.total[0] ? result.total[0].n : 0;
  return { items: result.items.map((l) => toPublicListing(l)), total };
}

/** Active listings are public. Any other status is visible only to the owning provider. */
async function getVisible(id, viewer) {
  const listing = await populateForDisplay(ServiceListing.findById(id));
  if (!listing) throw listingNotFound();

  const isOwner = viewer && String(listing.provider.user) === String(viewer._id);
  if (listing.status !== 'active' && !(isOwner && listing.status !== 'archived')) throw listingNotFound();
  return toPublicListing(listing, { includeStatus: Boolean(isOwner) });
}

async function listMine(user, { page, limit, status }) {
  const profile = await requireOwnProfile(user);
  const filter = { provider: profile._id, status: status || { $ne: 'archived' } };
  const [items, total] = await Promise.all([
    ServiceListing.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ServiceListing.countDocuments(filter),
  ]);
  return { items, total };
}

module.exports = { create, update, archive, addImage, removeImage, listPublic, getVisible, listMine, resolveCategory };
