const asyncHandler = require('../middleware/asyncHandler');
const paymentService = require('../services/paymentService');
const settingsService = require('../services/settingsService');
const followUps = require('../services/paymentFollowUpService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.options = asyncHandler(async (req, res) => {
  ok(res, { gateways: paymentService.options(), defaultGateway: paymentService.defaultGateway() });
});

exports.checkout = asyncHandler(async (req, res) => {
  const { payment, created } = await paymentService.checkout(req.user, req.validated.body);
  const view = await paymentService.getOne(req.user, payment._id);
  ok(res, { payment: view }, { status: created ? 201 : 200 });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await paymentService.list(req.user, req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.getOne = asyncHandler(async (req, res) => {
  ok(res, { payment: await paymentService.getOne(req.user, req.validated.params.id) });
});

exports.cancel = asyncHandler(async (req, res) => {
  ok(res, { payment: await paymentService.cancel(req.user, req.validated.params.id) });
});

exports.simulate = asyncHandler(async (req, res) => {
  const { id, outcome } = req.validated.params;
  ok(res, { payment: await paymentService.simulateSandbox(req.user, id, outcome) });
});

// Not authenticated with a user token: the signature on the request is the authentication.
exports.webhook = asyncHandler(async (req, res) => {
  const gateway = req.validated?.params?.gateway || paymentService.defaultGateway();
  const result = await paymentService.handleWebhook(gateway, { rawBody: req.rawBody, headers: req.headers });
  ok(res, result); // always 200 once the signature checked out, so the gateway stops retrying (even for ignored events)
});

// ---- Admin ----
exports.adminList = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await paymentService.listForAdmin(req.user, req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.adminSummary = asyncHandler(async (req, res) => {
  ok(res, { summary: await paymentService.summary() });
});

exports.recordManual = asyncHandler(async (req, res) => {
  ok(res, { payment: await paymentService.recordManual(req.user, req.validated.body, ctxOf(req)) }, { status: 201 });
});

exports.refund = asyncHandler(async (req, res) => {
  ok(res, { payment: await paymentService.refund(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) });
});

exports.payout = asyncHandler(async (req, res) => {
  ok(res, { payment: await paymentService.payout(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) });
});

exports.getSettings = asyncHandler(async (req, res) => {
  ok(res, { settings: await settingsService.getSettings() });
});

exports.setCommission = asyncHandler(async (req, res) => {
  ok(res, { settings: await settingsService.setCommissionBps(req.user, req.validated.body.rateBps, ctxOf(req)) });
});

// ---- Payment follow-up (administrators and the payment follow-up role) ----
exports.followUpSummary = asyncHandler(async (req, res) => {
  ok(res, { summary: await followUps.summary() });
});

exports.followUpList = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await followUps.listBucket(req.validated.params.bucket, req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.createFollowUp = asyncHandler(async (req, res) => {
  ok(res, { followUp: await followUps.createFollowUp(req.user, req.validated.body, ctxOf(req)) }, { status: 201 });
});

exports.listFollowUps = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await followUps.listFollowUps(req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});
