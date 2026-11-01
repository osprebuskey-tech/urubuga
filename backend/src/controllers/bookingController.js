const asyncHandler = require('../middleware/asyncHandler');
const bookingService = require('../services/bookingService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total, scope } = await bookingService.list(req.user, req.validated.query);
  ok(res, items, { meta: { ...buildMeta({ page, limit, total }), scope } });
});

exports.getOne = asyncHandler(async (req, res) => {
  ok(res, { booking: await bookingService.getOne(req.user, req.validated.params.id) });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const ctx = { ip: req.ip, userAgent: req.get('user-agent') };
  ok(res, { booking: await bookingService.transition(req.user, req.validated.params.id, req.validated.body, ctx) });
});
