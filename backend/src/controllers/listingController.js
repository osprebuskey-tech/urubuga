const asyncHandler = require('../middleware/asyncHandler');
const listingService = require('../services/listingService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await listingService.listPublic(req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.getOne = asyncHandler(async (req, res) => {
  ok(res, { service: await listingService.getVisible(req.validated.params.id, req.user) });
});

exports.create = asyncHandler(async (req, res) => {
  ok(res, { service: await listingService.create(req.user, req.validated.body) }, { status: 201 });
});

exports.update = asyncHandler(async (req, res) => {
  ok(res, { service: await listingService.update(req.user, req.validated.params.id, req.validated.body) });
});

exports.remove = asyncHandler(async (req, res) => {
  await listingService.archive(req.user, req.validated.params.id);
  ok(res, { message: 'Listing archived' });
});

exports.addImage = asyncHandler(async (req, res) => {
  ok(res, { service: await listingService.addImage(req.user, req.validated.params.id, req.image) }, { status: 201 });
});

exports.removeImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.validated.params;
  await listingService.removeImage(req.user, id, imageId);
  ok(res, { message: 'Image removed' });
});
