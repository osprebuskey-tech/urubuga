const { z } = require('zod');
const { METHODS } = require('../models/VerificationPayment');
const { APPLICATION_STATUS, PAYMENT_STATUS, APPLICATION_KINDS } = require('../models/VerificationApplication');
const { DOCUMENT_KINDS } = require('../models/UserDocument');
const { paginationQuery, optionalParam, isoDay } = require('./commonValidators');

const text = (min, max) => z.string().trim().min(min).max(max);

// ---- Verification fee (super administrator) ----
const feeBody = z.object({ amount: z.number().int().min(0).max(10_000_000), currency: z.enum(['RWF', 'USD']), instructions: text(10, 800) }).strict();

// ---- Applicant ----
const paymentBody = z.object({ method: z.enum(METHODS), gateway: z.enum(['manual', 'sandbox']).optional(), payerPhone: z.string().trim().regex(/^\+?[0-9 ]{9,15}$/, 'Enter a valid phone number').optional() }).strict();
const respondBody = z.object({ message: text(5, 600) }).strict();
const sandboxParams = z.object({ outcome: z.enum(['success', 'fail']) });

// ---- Staff review ----
const infoBody = z.object({ message: text(10, 600) }).strict();
const recommendBody = z.object({ note: text(10, 600) }).strict();
const rejectBody = z.object({ reason: text(5, 600) }).strict();
const reopenBody = rejectBody;
const decisionBody = z
  .object({ outcome: z.enum(['approved', 'rejected']), reason: text(5, 600).optional() })
  .strict()
  .superRefine((v, ctx) => { if (v.outcome === 'rejected' && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason for rejecting' }); });
const listApplicationsQuery = paginationQuery.extend({ status: optionalParam(z.enum(APPLICATION_STATUS)), paymentStatus: optionalParam(z.enum(PAYMENT_STATUS)), kind: optionalParam(z.enum(APPLICATION_KINDS)) });
const listPaymentsQuery = paginationQuery.extend({ status: optionalParam(z.enum(['pending', 'succeeded', 'failed', 'cancelled'])) });
const confirmPaymentBody = z.object({ reference: text(4, 100), note: text(1, 300).optional() }).strict();

// ---- Documents ----
const documentKindParams = z.object({ kind: z.enum(DOCUMENT_KINDS) });

// ---- Terms ----
const acceptTermsBody = z.object({ version: z.number().int().min(1) }).strict();
const publishTermsBody = z.object({ title: text(5, 150), body: text(200, 60000) }).strict();

// ---- Contracts ----
const list = z.array(text(1, 200)).max(10);
const acceptContractBody = z.object({ version: z.number().int().min(1) }).strict();
const proposeContractBody = z
  .object({ deliverables: list.optional(), customerResponsibilities: list.optional(), providerResponsibilities: list.optional(), deadline: isoDay.nullable().optional(), note: text(3, 300).optional() })
  .strict()
  .refine((v) => ['deliverables', 'customerResponsibilities', 'providerResponsibilities', 'deadline'].some((k) => v[k] !== undefined), { message: 'Change at least one thing', path: ['deliverables'] });
const listContractsQuery = paginationQuery.extend({ status: optionalParam(z.enum(['pending', 'accepted'])) });

// ---- Ratings report and recommendations ----
const ratingsReportQuery = paginationQuery.extend({
  minRating: z.coerce.number().min(0).max(5).default(4),
  minReviews: z.coerce.number().int().min(0).default(3),
  minJobs: z.coerce.number().int().min(0).default(3),
  verification: optionalParam(z.enum(['verified', 'not_verified'])),
});
const recommendProviderBody = z.object({ note: text(10, 600) }).strict();
const listRecommendationsQuery = paginationQuery.extend({ status: optionalParam(z.enum(['open', 'dismissed', 'actioned'])) });
const resolveRecommendationBody = z.object({ status: z.enum(['dismissed', 'actioned']), note: text(3, 400).optional() }).strict();
const historyQuery = paginationQuery.extend({ as: optionalParam(z.enum(['customer', 'provider'])) });

module.exports = {
  feeBody, paymentBody, respondBody, sandboxParams, infoBody, recommendBody, rejectBody, reopenBody, decisionBody, listApplicationsQuery, listPaymentsQuery, confirmPaymentBody,
  documentKindParams, acceptTermsBody, publishTermsBody, acceptContractBody, proposeContractBody, listContractsQuery,
  ratingsReportQuery, recommendProviderBody, listRecommendationsQuery, resolveRecommendationBody, historyQuery,
};
