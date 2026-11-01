const asyncHandler = require('../middleware/asyncHandler');
const companyService = require('../services/companyService');
const { ok } = require('../utils/response');

exports.getMe = asyncHandler(async (req, res) => {
  ok(res, { company: await companyService.getOwn(req.user._id) });
});

exports.upsertMe = asyncHandler(async (req, res) => {
  ok(res, { company: await companyService.upsertOwn(req.user, req.validated.body) });
});
