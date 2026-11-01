const asyncHandler = require('../middleware/asyncHandler');
const categoryService = require('../services/categoryService');
const { ok } = require('../utils/response');
const { isAdmin: isAdminUser } = require('../utils/roles');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.list = asyncHandler(async (req, res) => {
  // Disabled categories are only visible to admins; the flag is ignored for everyone else.
  const isAdmin = isAdminUser(req.user);
  const includeDisabled = isAdmin && req.validated.query.includeDisabled === 'true';
  ok(res, await categoryService.list({ includeDisabled }));
});

exports.create = asyncHandler(async (req, res) => {
  const category = await categoryService.create(req.validated.body, req.user, ctxOf(req));
  ok(res, { category }, { status: 201 });
});

exports.update = asyncHandler(async (req, res) => {
  const category = await categoryService.update(req.validated.params.id, req.validated.body, req.user, ctxOf(req));
  ok(res, { category });
});

exports.remove = asyncHandler(async (req, res) => {
  await categoryService.remove(req.validated.params.id, req.user, ctxOf(req));
  ok(res, { message: 'Category deleted' });
});
