const asyncHandler = require('../middleware/asyncHandler');
const partnerService = require('../services/partnerService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.listPublic = asyncHandler(async (req, res) => ok(res, await partnerService.listPublic()));
exports.listAll = asyncHandler(async (req, res) => ok(res, await partnerService.listAll()));
exports.create = asyncHandler(async (req, res) => ok(res, { partner: await partnerService.create(req.validated.body, req.image, req.user, ctxOf(req)) }, { status: 201 }));
exports.update = asyncHandler(async (req, res) => ok(res, { partner: await partnerService.update(req.validated.params.id, req.validated.body, req.user, ctxOf(req)) }));
exports.replaceLogo = asyncHandler(async (req, res) => ok(res, { partner: await partnerService.replaceLogo(req.validated.params.id, req.image, req.user, ctxOf(req)) }));
exports.remove = asyncHandler(async (req, res) => {
  await partnerService.remove(req.validated.params.id, req.user, ctxOf(req));
  ok(res, { message: 'Partner removed' });
});
