const { z } = require('zod');
const { DISPUTE_STATUS } = require('../models/Dispute');
const { paginationQuery, optionalParam } = require('./commonValidators');

const listDisputesQuery = paginationQuery.extend({ status: optionalParam(z.enum(DISPUTE_STATUS)) });

const messageBody = z.object({ text: z.string().trim().min(1, 'Write a message').max(1000) }).strict();

// An administrator either takes a dispute for review, or resolves it with an outcome and a note. Never both at once.
const adminUpdateBody = z
  .object({ status: z.literal('under_review'), outcome: z.enum(['completed', 'cancelled']), note: z.string().trim().max(500) })
  .partial()
  .strict()
  .superRefine((v, ctx) => {
    if (v.status && (v.outcome || v.note)) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Take a dispute for review and resolve it in separate steps' });
    if (!v.status && !v.outcome) ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'Choose an outcome (completed or cancelled), or set status to under_review' });
    if (v.outcome && (!v.note || v.note.length < 10)) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Explain the decision in at least 10 characters. Both sides see it.' });
  });

module.exports = { listDisputesQuery, messageBody, adminUpdateBody };
