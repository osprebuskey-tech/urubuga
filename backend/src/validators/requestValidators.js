const { z } = require('zod');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { REQUEST_STATUS } = require('../models/ServiceRequest');
const { objectId, paginationQuery, optionalParam, futureOrTodayDay } = require('./commonValidators');

const rwf = z.number().int().min(0).max(1_000_000_000); // whole RWF

const fields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(3000),
  category: objectId,
  subcategory: z.string().trim().toLowerCase().max(80).optional(),
  location: z.object({ district: z.enum([...RWANDA_DISTRICTS]), sector: z.string().trim().max(60).optional() }).strict(),
  preferredDate: futureOrTodayDay.transform((s) => new Date(`${s}T00:00:00.000Z`)).optional(),
  budgetMin: rwf.optional(),
  budgetMax: rwf.optional(),
};

const budgetOrder = (v, ctx) => {
  if (v.budgetMin !== undefined && v.budgetMax !== undefined && v.budgetMin > v.budgetMax) {
    ctx.addIssue({ code: 'custom', path: ['budgetMin'], message: 'budgetMin cannot be greater than budgetMax' });
  }
};

// Ids that decide who owns or can see a request (customer, company, status) are never accepted from the client.
const createRequestBody = z
  .object({ ...fields, provider: objectId.optional(), onBehalfOfCompany: z.boolean().optional() })
  .strict()
  .superRefine(budgetOrder);

const updateRequestBody = z
  .object({ ...fields, status: z.literal('cancelled') })
  .partial()
  .strict()
  .superRefine((v, ctx) => {
    const keys = Object.keys(v);
    if (keys.length === 0) ctx.addIssue({ code: 'custom', path: ['title'], message: 'Send at least one field to change' });
    if (v.status && keys.length > 1) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Cancel a request on its own, without other changes' });
    budgetOrder(v, ctx);
  });

const listRequestsQuery = paginationQuery.extend({
  scope: optionalParam(z.enum(['mine', 'incoming', 'all'])),
  status: optionalParam(z.enum(REQUEST_STATUS)),
  category: optionalParam(objectId),
});

const attachmentParams = z.object({ id: objectId, attachmentId: objectId });

module.exports = { createRequestBody, updateRequestBody, listRequestsQuery, attachmentParams };
