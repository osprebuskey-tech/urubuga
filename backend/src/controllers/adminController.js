const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const providerService = require('../services/providerService');
const userAdminService = require('../services/userAdminService');
const { ok } = require('../utils/response');
const { buildMeta, escapeRegex } = require('../utils/query');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, role, status, search, verified } = req.validated.query;

  const filter = {};
  if (role) filter.roles = role;
  if (status) filter.status = status;
  if (verified === 'yes') filter.accountVerified = true;
  if (verified === 'no') filter.accountVerified = { $ne: true };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  ok(res, users, { meta: buildMeta({ page, limit, total }) });
});

exports.listProviders = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await providerService.listForAdmin(req.validated.query);
  ok(res, items, { meta: buildMeta({ page, limit, total }) });
});

exports.setProviderVerification = asyncHandler(async (req, res) => {
  const profile = await providerService.setVerification(req.validated.params.id, req.validated.body, req.user, ctxOf(req));
  ok(res, { profile });
});

exports.createUser = asyncHandler(async (req, res) => {
  const { user, inviteSent } = await userAdminService.createUser(req.user, req.validated.body, ctxOf(req));
  ok(res, { user, inviteSent }, { status: 201 });
});

exports.setUserVerification = asyncHandler(async (req, res) => {
  const user = await userAdminService.setAccountVerification(req.user, req.validated.params.id, req.validated.body, ctxOf(req));
  ok(res, { user });
});

exports.confirmUserEmail = asyncHandler(async (req, res) => {
  const user = await userAdminService.confirmEmail(req.user, req.validated.params.id, ctxOf(req));
  ok(res, { user });
});

exports.resendInvite = asyncHandler(async (req, res) => {
  const { user, inviteSent } = await userAdminService.resendInvite(req.user, req.validated.params.id, ctxOf(req));
  ok(res, { user, inviteSent });
});
