const { z } = require('zod');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { objectId, paginationQuery, unique, optionalParam, searchText } = require('./commonValidators');

const district = z.enum([...RWANDA_DISTRICTS]);

// Only these fields can be set by a provider. Rating, verification and job counters are system-owned,
// and .strict() turns any attempt to send them into a 400.
const upsertProfileBody = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    bio: z.string().trim().max(1000).optional(),
    categories: z.array(objectId).max(10).transform(unique).optional(),
    providerType: z.enum(['individual', 'business']).optional(),
    skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    experienceYears: z.number().int().min(0).max(60).optional(),
    location: z.object({ district, sector: z.string().trim().max(60).optional() }).strict().optional(),
    coverage: z.array(district).max(30).transform(unique).optional(),
    contactPreferences: z
      .object({
        showPhone: z.boolean().optional(),
        showEmail: z.boolean().optional(),
        preferredChannel: z.enum(['in_app', 'phone', 'email']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// Sent as multipart text fields next to the image.
const portfolioItemBody = z
  .object({
    title: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

const portfolioItemParams = z.object({ id: objectId });

// Optional reply sent with a verification request (used when answering an administrator's question).
const verificationRequestBody = z.object({ message: z.string().trim().max(500).optional() }).strict().default({});

const PROVIDER_SORTS = ['relevance', 'top', 'rating', 'experience', 'newest'];

const listProvidersQuery = paginationQuery.extend({
  q: optionalParam(searchText),
  category: optionalParam(objectId),
  district: optionalParam(district),
  minRating: optionalParam(z.coerce.number().min(0).max(5)),
  sort: optionalParam(z.enum(PROVIDER_SORTS)),
});

module.exports = { upsertProfileBody, portfolioItemBody, portfolioItemParams, listProvidersQuery, verificationRequestBody };
