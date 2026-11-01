const { z } = require('zod');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { PRICING_TYPES, DAYS, LISTING_STATUS } = require('../models/ServiceListing');
const { objectId, paginationQuery, optionalParam, searchText } = require('./commonValidators');

const district = z.enum([...RWANDA_DISTRICTS]);

const fields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(3000),
  category: objectId,
  subcategory: z.string().trim().toLowerCase().max(80).optional(),
  priceFrom: z.number().int().min(0).max(1_000_000_000).optional(), // whole RWF
  pricingType: z.enum(PRICING_TYPES),
  estimatedDuration: z.string().trim().max(60).optional(),
  location: z.object({ district, sector: z.string().trim().max(60).optional() }).strict(),
  availability: z
    .object({
      days: z.array(z.enum(DAYS)).max(7).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .strict()
    .optional(),
  // "archived" is only reachable through DELETE.
  status: z.enum(['draft', 'active', 'paused']).optional(),
};

const createListingBody = z
  .object(fields)
  .strict()
  .superRefine((v, ctx) => {
    if (v.pricingType !== 'quotation' && v.priceFrom === undefined) {
      ctx.addIssue({ code: 'custom', path: ['priceFrom'], message: 'priceFrom is required for fixed and hourly pricing' });
    }
  });

const updateListingBody = z.object(fields).partial().strict();

const LISTING_SORTS = ['relevance', 'top', 'newest', 'rating', 'price_asc', 'price_desc'];

const listListingsQuery = paginationQuery
  .extend({
    q: optionalParam(searchText),
    category: optionalParam(objectId),
    district: optionalParam(district),
    pricingType: optionalParam(z.enum(PRICING_TYPES)),
    minPrice: optionalParam(z.coerce.number().int().min(0)),
    maxPrice: optionalParam(z.coerce.number().int().min(0)),
    minRating: optionalParam(z.coerce.number().min(0).max(5)),
    sort: optionalParam(z.enum(LISTING_SORTS)),
  })
  .superRefine((v, ctx) => {
    if (v.minPrice !== undefined && v.maxPrice !== undefined && v.minPrice > v.maxPrice) {
      ctx.addIssue({ code: 'custom', path: ['minPrice'], message: 'minPrice cannot be greater than maxPrice' });
    }
  });

const myListingsQuery = paginationQuery.extend({
  status: z.enum(LISTING_STATUS).optional(),
});

const imageParams = z.object({ id: objectId, imageId: objectId });

module.exports = { createListingBody, updateListingBody, listListingsQuery, myListingsQuery, imageParams };
