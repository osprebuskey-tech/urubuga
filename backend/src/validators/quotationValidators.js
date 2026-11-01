const { z } = require('zod');
const { futureOrTodayDay } = require('./commonValidators');

const MAX_DAYS_AHEAD = 90;

// A quotation is valid until the END of the chosen day (UTC), for at most 90 days.
const expiresAt = futureOrTodayDay
  .refine((s) => s <= new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10), `Choose a date within ${MAX_DAYS_AHEAD} days`)
  .transform((s) => new Date(`${s}T23:59:59.999Z`));

const fields = {
  price: z.number().int().min(1).max(1_000_000_000), // whole RWF
  description: z.string().trim().min(10).max(3000),
  deliverables: z.array(z.string().trim().min(1).max(200)).max(10),
  estimatedDuration: z.string().trim().min(1).max(60),
  expiresAt,
  terms: z.string().trim().max(2000),
};

// price, request and provider are decided by the server and the URL, never by extra body fields (.strict()).
const createQuotationBody = z
  .object({ ...fields, deliverables: fields.deliverables.optional(), terms: fields.terms.optional() })
  .strict();

const updateQuotationBody = z
  .object({ ...fields, status: z.enum(['accepted', 'rejected', 'withdrawn']) })
  .partial()
  .strict()
  .superRefine((v, ctx) => {
    const keys = Object.keys(v);
    if (keys.length === 0) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Send a status or the fields to change' });
    if (v.status && keys.length > 1) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Change the status on its own, without other fields' });
  });

module.exports = { createQuotationBody, updateQuotationBody };
