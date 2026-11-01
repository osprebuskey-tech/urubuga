const { z } = require('zod');
const { PAYMENT_STATUS, GATEWAYS } = require('../models/Payment');
const { KINDS, OUTCOMES } = require('../models/PaymentFollowUp');
const { BUCKET_NAMES } = require('../services/paymentFollowUpService');
const { objectId, paginationQuery, optionalParam, futureOrTodayDay } = require('./commonValidators');

const rwf = z.number().int().min(1).max(1_000_000_000);

// The amount, commission and parties are computed on the server. A client can only say which job and which method.
const checkoutBody = z.object({ bookingId: objectId, gateway: z.enum(GATEWAYS).optional() }).strict();

const listPaymentsQuery = paginationQuery.extend({
  status: optionalParam(z.enum(PAYMENT_STATUS)),
  bookingId: optionalParam(objectId),
});

const listPaymentsAdminQuery = listPaymentsQuery.extend({ gateway: optionalParam(z.enum(GATEWAYS)) });

const sandboxParams = z.object({ id: objectId, outcome: z.enum(['succeed', 'fail']) });
const webhookParams = z.object({ gateway: z.enum(GATEWAYS) });

const recordManualBody = z
  .object({
    bookingId: objectId,
    reference: z.string().trim().min(4, 'Enter the bank or mobile money transaction reference').max(100),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

const refundBody = z.object({ amount: rwf, reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300) }).strict();

const payoutBody = z.object({ amount: rwf.optional(), reference: z.string().trim().min(3, 'Enter the payout reference').max(100) }).strict();

// 0 to 50% in basis points (1200 = 12.00%).
const commissionBody = z.object({ rateBps: z.number().int().min(0).max(5000) }).strict();

const followUpBucketParams = z.object({ bucket: z.enum(BUCKET_NAMES) });
const followUpListQuery = paginationQuery;
const listFollowUpsQuery = paginationQuery.extend({ bookingId: objectId });

// "nextFollowUpAt" is a day; it is treated as due by the end of that day (UTC).
const createFollowUpBody = z
  .object({
    bookingId: objectId,
    kind: z.enum(KINDS),
    outcome: z.enum(OUTCOMES).default('contacted'),
    note: z.string().trim().min(3, 'Write what happened (at least 3 characters)').max(500),
    nextFollowUpAt: futureOrTodayDay.optional().transform((d) => (d ? new Date(`${d}T23:59:59.000Z`) : undefined)),
    remindCustomer: z.boolean().default(false),
  })
  .strict();

module.exports = { followUpBucketParams, followUpListQuery, listFollowUpsQuery, createFollowUpBody, checkoutBody, listPaymentsQuery, listPaymentsAdminQuery, sandboxParams, webhookParams, recordManualBody, refundBody, payoutBody, commissionBody };
