const ServiceCategory = require('../models/ServiceCategory');
const listingService = require('./listingService');
const providerService = require('./providerService');
const { escapeRegex } = require('../utils/query');

const PREVIEW_SIZE = 5;

async function matchingCategories(q) {
  const rx = new RegExp(escapeRegex(q), 'i'); // categories are few, so a plain case-insensitive match is enough
  const categories = await ServiceCategory.find({ status: 'active', $or: [{ name: rx }, { 'subcategories.name': rx }] })
    .sort({ sortOrder: 1, name: 1 })
    .limit(PREVIEW_SIZE);
  return categories.map((c) => ({
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    matchingSubcategories: c.subcategories.filter((s) => rx.test(s.name)).map((s) => ({ name: s.name, slug: s.slug })),
  }));
}

/** One search box, three result groups: the first few services, providers and categories. */
async function searchAll({ q }) {
  const [services, providers, categories] = await Promise.all([
    listingService.listPublic({ page: 1, limit: PREVIEW_SIZE, q, sort: 'relevance' }),
    providerService.listPublic({ page: 1, limit: PREVIEW_SIZE, q, sort: 'relevance' }),
    matchingCategories(q),
  ]);
  return {
    query: q,
    services: services.items,
    providers: providers.items,
    categories,
    totals: { services: services.total, providers: providers.total },
  };
}

module.exports = { searchAll };
