const asyncHandler = require('../middleware/asyncHandler');
const disputeService = require('../services/disputeService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await disputeService.list(req.user, req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.getOne = asyncHandler(async (req, res) => {
  ok(res, { dispute: await disputeService.getOne(req.user, req.validated.params.id) });
});

exports.addMessage = asyncHandler(async (req, res) => {
  ok(res, { dispute: await disputeService.addMessage(req.user, req.validated.params.id, req.validated.body) }, { status: 201 });
});

exports.addEvidence = asyncHandler(async (req, res) => {
  ok(res, { dispute: await disputeService.addEvidence(req.user, req.validated.params.id, req.image) }, { status: 201 });
});

exports.adminList = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await disputeService.listForAdmin(req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.adminUpdate = asyncHandler(async (req, res) => {
  ok(res, { dispute: await disputeService.adminUpdate(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) });
});
