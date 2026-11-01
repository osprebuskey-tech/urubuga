const asyncHandler = require('../middleware/asyncHandler');
const providerService = require('../services/providerService');
const listingService = require('../services/listingService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.getMe = asyncHandler(async (req, res) => {
  ok(res, { profile: await providerService.getOwnProfile(req.user._id) });
});

exports.upsertMe = asyncHandler(async (req, res) => {
  ok(res, { profile: await providerService.upsertOwnProfile(req.user, req.validated.body) });
});

exports.requestVerification = asyncHandler(async (req, res) => {
  ok(res, { profile: await providerService.requestVerification(req.user, req.validated.body, ctxOf(req)) });
});

exports.uploadAvatar = asyncHandler(async (req, res) => {
  ok(res, { profile: await providerService.setAvatar(req.user, req.image) });
});

exports.addPortfolio = asyncHandler(async (req, res) => {
  const profile = await providerService.addPortfolioItem(req.user, req.image, req.validated.body);
  ok(res, { profile }, { status: 201 });
});

exports.removePortfolio = asyncHandler(async (req, res) => {
  await providerService.removePortfolioItem(req.user, req.validated.params.id);
  ok(res, { message: 'Portfolio item removed' });
});

exports.listMyServices = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await listingService.listMine(req.user, req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await providerService.listPublic(req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.getPublic = asyncHandler(async (req, res) => {
  ok(res, { provider: await providerService.getPublic(req.validated.params.id) });
});
