const { z } = require('zod');
const { PARTNER_KINDS, PARTNER_STATUS } = require('../models/Partner');

// Create arrives as multipart (logo + text fields), so numbers are strings and are coerced.
const website = z.string().trim().max(300).url().refine((u) => /^https?:\/\//i.test(u), 'Use a link that starts with http:// or https://');
const fields = {
  name: z.string().trim().min(2).max(100),
  kind: z.enum(PARTNER_KINDS),
  websiteUrl: website,
  sortOrder: z.coerce.number().int().min(0).max(10000),
  status: z.enum(PARTNER_STATUS),
};

const createPartnerBody = z
  .object({ name: fields.name, kind: fields.kind.optional(), websiteUrl: fields.websiteUrl.optional(), sortOrder: fields.sortOrder.optional(), status: fields.status.optional() })
  .strict();

// An empty website clears it.
const updatePartnerBody = z
  .object({ name: fields.name, kind: fields.kind, websiteUrl: fields.websiteUrl.or(z.literal('')), sortOrder: fields.sortOrder, status: fields.status })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one field to change', path: ['name'] });

module.exports = { createPartnerBody, updatePartnerBody };
