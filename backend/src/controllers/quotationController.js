const asyncHandler = require('../middleware/asyncHandler');
const quotationService = require('../services/quotationService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.create = asyncHandler(async (req, res) => {
  const quotation = await quotationService.create(req.user, req.validated.params.id, req.validated.body);
  ok(res, { quotation }, { status: 201 });
});

exports.list = asyncHandler(async (req, res) => {
  ok(res, { quotations: await quotationService.listForRequest(req.user, req.validated.params.id) });
});

exports.update = asyncHandler(async (req, res) => {
  ok(res, { quotation: await quotationService.update(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) });
});
