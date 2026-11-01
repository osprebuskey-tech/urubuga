const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

/**
 * Notifications are a side effect of something that already succeeded (a request was created, a quotation
 * accepted...), so a failure here is logged and swallowed. It must never undo or fail the main action.
 */
async function notify(userId, { type, title, body, link }) {
  try {
    await Notification.create({ user: userId, type, title, body, link });
  } catch (err) {
    logger.error({ err, type }, 'Failed to create notification');
  }
}

async function notifyMany(userIds, payload) {
  const unique = [...new Set(userIds.map(String))];
  if (unique.length === 0) return;
  try {
    await Notification.insertMany(unique.map((user) => ({ ...payload, user })), { ordered: false });
  } catch (err) {
    logger.error({ err, type: payload.type }, 'Failed to create notifications');
  }
}

async function list(user, { page, limit, unread }) {
  const filter = { user: user._id };
  if (unread) filter.readAt = { $exists: false };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: user._id, readAt: { $exists: false } }),
  ]);
  return { items, total, unreadCount };
}

const unreadCount = (user) => Notification.countDocuments({ user: user._id, readAt: { $exists: false } });

/** Only the owner can mark a notification read; anyone else gets 404, as if it did not exist. */
async function markRead(user, id) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, user: user._id },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw new AppError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  return notification;
}

async function markAllRead(user) {
  const result = await Notification.updateMany({ user: user._id, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}

module.exports = { notify, notifyMany, list, unreadCount, markRead, markAllRead };
