const Announcement = require('../models/Announcement');
const AppError = require('../utils/AppError');
const audit = require('./auditService');

const MAX_ANNOUNCEMENTS = 50;
const MAX_SHOWN = 10;
const notFound = () => new AppError(404, 'Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');

/** What the top bar scrolls: active and not yet expired, newest first. */
const listPublic = () =>
  Announcement.find({ status: 'active', $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
    .sort({ createdAt: -1 })
    .limit(MAX_SHOWN);

const listAll = () => Announcement.find({}).sort({ createdAt: -1 }).limit(MAX_ANNOUNCEMENTS);

// An empty link or end time means "none".
const clean = ({ linkUrl, expiresAt, ...rest }) => {
  const out = { ...rest };
  if (linkUrl !== undefined) out.linkUrl = linkUrl || undefined;
  if (expiresAt !== undefined) out.expiresAt = expiresAt === '' ? null : expiresAt;
  return out;
};

async function create(data, admin, ctx) {
  if ((await Announcement.countDocuments()) >= MAX_ANNOUNCEMENTS) throw new AppError(409, `You can keep at most ${MAX_ANNOUNCEMENTS} announcements. Remove old ones first.`, 'ANNOUNCEMENT_LIMIT');
  const item = await Announcement.create({ ...clean(data), createdBy: admin._id });
  await audit.record({ actor: admin._id, action: 'announcement.create', entityType: 'Announcement', entityId: item._id, metadata: { status: item.status }, ctx, strict: true });
  return item;
}

async function update(id, data, admin, ctx) {
  const item = await Announcement.findById(id);
  if (!item) throw notFound();
  const changes = clean(data);
  for (const [k, v] of Object.entries(changes)) item.set(k, v === null ? undefined : v);
  await item.save();
  await audit.record({ actor: admin._id, action: 'announcement.update', entityType: 'Announcement', entityId: item._id, metadata: { fields: Object.keys(data) }, ctx, strict: true });
  return item;
}

async function remove(id, admin, ctx) {
  const item = await Announcement.findByIdAndDelete(id);
  if (!item) throw notFound();
  await audit.record({ actor: admin._id, action: 'announcement.delete', entityType: 'Announcement', entityId: item._id, ctx, strict: true });
}

module.exports = { listPublic, listAll, create, update, remove };
