const asyncHandler = require('../middleware/asyncHandler');
const reviewService = require('../services/reviewService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.create = asyncHandler(async (req, res) => {
  ok(res, { review: await reviewService.create(req.user, req.validated.params.id, req.validated.body) }, { status: 201 });
});

exports.listForProvider = asyncHandler(async (req, res) => {
  const { page, limit, rating } = req.validated.query;
  const { items, total, summary } = await reviewService.listForProvider(req.validated.params.id, { page, limit, rating });
  ok(res, items, { meta: { ...buildMeta({ page, limit, total }), summary } });
});

exports.report = asyncHandler(async (req, res) => {
  ok(res, { review: await reviewService.report(req.user, req.validated.params.id, req.validated.body) });
});

exports.adminList = asyncHandler(async (req, res) => {
  const { page, limit, status, reported } = req.validated.query;
  const { items, total } = await reviewService.listForAdmin({ page, limit, status, reported: reported === 'true' });
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.adminModerate = asyncHandler(async (req, res) => {
  ok(res, { review: await reviewService.moderate(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) });
});
