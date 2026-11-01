const asyncHandler = require('../middleware/asyncHandler');
const authService = require('../services/authService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.register = asyncHandler(async (req, res) => {
  const session = await authService.register(req.validated.body, ctxOf(req));
  ok(res, session, { status: 201 });
});

exports.login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.validated.body, ctxOf(req));
  ok(res, session);
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user, ctxOf(req));
  ok(res, { message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  ok(res, { user: req.user });
});

exports.updateMe = asyncHandler(async (req, res) => {
  ok(res, { user: await authService.updateProfile(req.user, req.validated.body, ctxOf(req)) });
});

exports.changePassword = asyncHandler(async (req, res) => {
  ok(res, await authService.changePassword(req.user, req.validated.body, ctxOf(req), { remember: req.tokenRemember }));
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmail(req.validated.body.token, ctxOf(req));
  ok(res, { message: 'Email verified', user });
});

exports.resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.user, ctxOf(req));
  ok(res, { message: 'Verification email sent' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.validated.body, ctxOf(req));
  ok(res, { message: 'If an account exists for that email, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.validated.body, ctxOf(req));
  ok(res, { message: 'Password updated. Please log in with your new password.' });
});
