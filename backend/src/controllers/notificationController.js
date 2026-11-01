const asyncHandler = require('../middleware/asyncHandler');
const notificationService = require('../services/notificationService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, unread } = req.validated.query;
  const { items, total, unreadCount } = await notificationService.list(req.user, { page, limit, unread: unread === 'true' });
  ok(res, items, { meta: { ...buildMeta({ page, limit, total }), unreadCount } });
});

exports.unreadCount = asyncHandler(async (req, res) => {
  ok(res, { unreadCount: await notificationService.unreadCount(req.user) });
});

exports.markRead = asyncHandler(async (req, res) => {
  ok(res, { notification: await notificationService.markRead(req.user, req.validated.params.id) });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  ok(res, { updated: await notificationService.markAllRead(req.user) });
});
