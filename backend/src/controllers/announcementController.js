const asyncHandler = require('../middleware/asyncHandler');
const service = require('../services/announcementService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.listPublic = asyncHandler(async (req, res) => ok(res, await service.listPublic()));
exports.listAll = asyncHandler(async (req, res) => ok(res, await service.listAll()));
exports.create = asyncHandler(async (req, res) => ok(res, { announcement: await service.create(req.validated.body, req.user, ctxOf(req)) }, { status: 201 }));
exports.update = asyncHandler(async (req, res) => ok(res, { announcement: await service.update(req.validated.params.id, req.validated.body, req.user, ctxOf(req)) }));
exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.validated.params.id, req.user, ctxOf(req));
  ok(res, { message: 'Announcement removed' });
});
