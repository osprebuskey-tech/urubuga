const { z } = require('zod');
const { REVIEW_STATUS, REPORT_REASONS } = require('../models/Review');
const { paginationQuery, optionalParam } = require('./commonValidators');

// The provider, customer and booking come from the URL and the server's records, never from the body.
const createReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(10).max(1000),
  })
  .strict();

const reportReviewBody = z.object({ reason: z.enum(REPORT_REASONS), note: z.string().trim().max(300).optional() }).strict();

const listProviderReviewsQuery = paginationQuery.extend({ rating: optionalParam(z.coerce.number().int().min(1).max(5)) });

const listReviewsAdminQuery = paginationQuery.extend({
  status: optionalParam(z.enum(REVIEW_STATUS)),
  reported: optionalParam(z.enum(['true'])),
});

const moderateReviewBody = z
  .object({ status: z.enum(REVIEW_STATUS), reason: z.string().trim().max(500).optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'hidden' && (!v.reason || v.reason.length < 5)) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason (at least 5 characters) is required to hide a review. The author sees it.' });
    }
  });

module.exports = { createReviewBody, reportReviewBody, listProviderReviewsQuery, listReviewsAdminQuery, moderateReviewBody };
