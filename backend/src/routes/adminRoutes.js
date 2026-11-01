const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/adminValidators');
const reviewCtrl = require('../controllers/reviewController');
const rv = require('../validators/reviewValidators');
const payCtrl = require('../controllers/paymentController');
const pv = require('../validators/paymentValidators');
const dashCtrl = require('../controllers/adminDashboardController');
const disputeCtrl = require('../controllers/disputeController');
const dv = require('../validators/disputeValidators');
const vc = require('../controllers/verificationController');
const vv = require('../validators/verificationValidators');

// Access under /api/admin, enforced here on the server, never by the React app:
//   1. Payment routes: administrators (and super admins) and the payment follow-up role.
//   2. Everything declared after `router.use(adminOnly)`: administrators and super admins only.
//   3. Super-admin routes: super admins only (creating users, the activity report).
// Order matters and is deliberate: a route added without its own guard falls under the next `router.use` below it, so it
// defaults to the stricter group. Do not move a route above a `router.use` to widen who can reach it.
const adminOnly = requireRoles(ROLES.ADMIN);
const paymentStaff = requireRoles(ROLES.ADMIN, ROLES.FINANCE);
const superOnly = requireRoles(ROLES.SUPER_ADMIN);

router.use(requireAuth);

// ---- Money: administrators and the payment follow-up role. Every action here is audited. ----
router.get('/payments', paymentStaff, validate({ query: pv.listPaymentsAdminQuery }), payCtrl.adminList);
router.get('/payments/summary', paymentStaff, payCtrl.adminSummary);
router.get('/payments/follow-up', paymentStaff, payCtrl.followUpSummary);
router.get('/payments/follow-up/:bucket', paymentStaff, validate({ params: pv.followUpBucketParams, query: pv.followUpListQuery }), payCtrl.followUpList);
router.get('/payments/follow-ups', paymentStaff, validate({ query: pv.listFollowUpsQuery }), payCtrl.listFollowUps);
router.post('/payments/follow-ups', paymentStaff, validate({ body: pv.createFollowUpBody }), payCtrl.createFollowUp);
router.post('/payments', paymentStaff, validate({ body: pv.recordManualBody }), payCtrl.recordManual);
router.post('/payments/:id/refund', paymentStaff, validate({ params: idParams, body: pv.refundBody }), payCtrl.refund);
router.post('/payments/:id/payout', paymentStaff, validate({ params: idParams, body: pv.payoutBody }), payCtrl.payout);
// Verification fees (money in, no payouts): staff confirm a payment they saw arrive; the verification review only opens after that.
router.get('/verification-payments', paymentStaff, validate({ query: vv.listPaymentsQuery }), vc.payments);
router.post('/verification-payments/:id/confirm', paymentStaff, validate({ params: idParams, body: vv.confirmPaymentBody }), vc.confirmPayment);

// ---- Everything below: administrators and super admins only ----
router.use(adminOnly);

router.get('/users', validate({ query: v.listUsersQuery }), ctrl.listUsers);
router.get('/dashboard', dashCtrl.dashboard);
router.get('/reports', validate({ query: v.reportsQuery }), dashCtrl.reports);
router.patch('/users/:id/status', validate({ params: idParams, body: v.userStatusBody }), dashCtrl.setUserStatus);
router.get('/disputes', validate({ query: dv.listDisputesQuery }), disputeCtrl.adminList);
router.patch('/disputes/:id', validate({ params: idParams, body: dv.adminUpdateBody }), disputeCtrl.adminUpdate);
router.get('/providers', validate({ query: v.listProvidersQuery }), ctrl.listProviders);
router.patch('/providers/:id/verification', validate({ params: idParams, body: v.verificationBody }), ctrl.setProviderVerification);
router.get('/reviews', validate({ query: rv.listReviewsAdminQuery }), reviewCtrl.adminList);
router.patch('/reviews/:id', validate({ params: idParams, body: rv.moderateReviewBody }), reviewCtrl.adminModerate);
router.get('/settings', payCtrl.getSettings);
router.put('/settings/commission', validate({ body: pv.commissionBody }), payCtrl.setCommission);

// ---- Paid verification review. Administrators review documents and recommend; the super administrator decides (below). ----
router.get('/verification', validate({ query: vv.listApplicationsQuery }), vc.list);
router.get('/verification/:id', validate({ params: idParams }), vc.get);
router.post('/verification/:id/start-review', validate({ params: idParams }), vc.startReview);
router.post('/verification/:id/request-info', validate({ params: idParams, body: vv.infoBody }), vc.requestInfo);
router.post('/verification/:id/recommend', validate({ params: idParams, body: vv.recommendBody }), vc.recommend);
router.post('/verification/:id/reject', validate({ params: idParams, body: vv.rejectBody }), vc.reject);

// ---- Ratings report and recommendations to the super administrator ----
router.get('/ratings/providers', validate({ query: vv.ratingsReportQuery }), vc.ratingsReport);
router.get('/ratings/providers/:id', validate({ params: idParams }), vc.ratingsEvidence);
router.post('/ratings/providers/:id/recommend', validate({ params: idParams, body: vv.recommendProviderBody }), vc.recommendProvider);

// ---- Signed service contracts (read-only for administrators) ----
router.get('/contracts', validate({ query: vv.listContractsQuery }), vc.adminContracts);

// ---- Super admin only ----
router.post('/users', superOnly, validate({ body: v.createUserBody }), ctrl.createUser);
router.post('/users/:id/resend-invite', superOnly, validate({ params: idParams }), ctrl.resendInvite);
router.patch('/users/:id/verification', superOnly, validate({ params: idParams, body: v.userVerificationBody }), ctrl.setUserVerification);
router.post('/users/:id/confirm-email', superOnly, validate({ params: idParams }), ctrl.confirmUserEmail);
router.get('/reports/activity', superOnly, validate({ query: v.reportsQuery }), dashCtrl.activityReport);
router.put('/settings/verification-fee', superOnly, validate({ body: vv.feeBody }), vc.setFee);
router.post('/verification/:id/decision', superOnly, validate({ params: idParams, body: vv.decisionBody }), vc.decide);
router.post('/verification/:id/reopen', superOnly, validate({ params: idParams, body: vv.reopenBody }), vc.reopen);
router.get('/verification-recommendations', superOnly, validate({ query: vv.listRecommendationsQuery }), vc.recommendations);
router.patch('/verification-recommendations/:id', superOnly, validate({ params: idParams, body: vv.resolveRecommendationBody }), vc.resolveRecommendation);
router.get('/terms', superOnly, vc.termsVersions);
router.post('/terms', superOnly, validate({ body: vv.publishTermsBody }), vc.publishTerms);

module.exports = router;
