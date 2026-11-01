const asyncHandler = require('../middleware/asyncHandler');
const requestService = require('../services/requestService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

exports.create = asyncHandler(async (req, res) => {
  ok(res, { request: await requestService.create(req.user, req.validated.body) }, { status: 201 });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total, scope } = await requestService.list(req.user, req.validated.query);
  ok(res, items, { meta: { ...buildMeta({ page, limit, total }), scope } });
});

exports.getOne = asyncHandler(async (req, res) => {
  ok(res, { request: await requestService.getOne(req.user, req.validated.params.id) });
});

exports.update = asyncHandler(async (req, res) => {
  ok(res, { request: await requestService.update(req.user, req.validated.params.id, req.validated.body) });
});

exports.addAttachment = asyncHandler(async (req, res) => {
  ok(res, { attachments: await requestService.addAttachment(req.user, req.validated.params.id, req.image) }, { status: 201 });
});

exports.removeAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = req.validated.params;
  await requestService.removeAttachment(req.user, id, attachmentId);
  ok(res, { message: 'Photo removed' });
});
