const Partner = require('../models/Partner');
const AppError = require('../utils/AppError');
const storage = require('./storage');
const audit = require('./auditService');

const MAX_PARTNERS = 60;
const notFound = () => new AppError(404, 'Partner not found', 'PARTNER_NOT_FOUND');

/** The welcome page's line: sponsors first, then partners, each in the order the super administrator set. */
const listPublic = () => Partner.find({ status: 'active' }).sort({ kind: -1, sortOrder: 1, name: 1 }).limit(MAX_PARTNERS);
const listAll = () => Partner.find({}).sort({ kind: -1, sortOrder: 1, name: 1 }).limit(MAX_PARTNERS);

async function create(data, image, admin, ctx) {
  if ((await Partner.countDocuments()) >= MAX_PARTNERS) throw new AppError(409, `You can list at most ${MAX_PARTNERS} partners and sponsors`, 'PARTNER_LIMIT');
  const saved = await storage.save({ ...image, folder: 'partners' });
  try {
    const partner = await Partner.create({ ...data, logoUrl: saved.url, logoKey: saved.key, createdBy: admin._id });
    await audit.record({ actor: admin._id, action: 'partner.create', entityType: 'Partner', entityId: partner._id, metadata: { name: partner.name, kind: partner.kind }, ctx, strict: true });
    return partner;
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
}

async function update(id, data, admin, ctx) {
  const partner = await Partner.findById(id);
  if (!partner) throw notFound();
  const { websiteUrl, ...rest } = data;
  Object.assign(partner, rest);
  if (websiteUrl !== undefined) partner.websiteUrl = websiteUrl || undefined;
  await partner.save();
  await audit.record({ actor: admin._id, action: 'partner.update', entityType: 'Partner', entityId: partner._id, metadata: { fields: Object.keys(data) }, ctx, strict: true });
  return partner;
}

async function replaceLogo(id, image, admin, ctx) {
  const partner = await Partner.findById(id);
  if (!partner) throw notFound();
  const saved = await storage.save({ ...image, folder: 'partners' });
  const oldKey = partner.logoKey;
  try {
    partner.logoKey = saved.key;
    partner.logoUrl = saved.url;
    await partner.save();
    await audit.record({ actor: admin._id, action: 'partner.logo_replace', entityType: 'Partner', entityId: partner._id, ctx, strict: true });
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
  await storage.remove(oldKey);
  return partner;
}

async function remove(id, admin, ctx) {
  const partner = await Partner.findByIdAndDelete(id);
  if (!partner) throw notFound();
  await storage.remove(partner.logoKey);
  await audit.record({ actor: admin._id, action: 'partner.delete', entityType: 'Partner', entityId: partner._id, metadata: { name: partner.name }, ctx, strict: true });
}

module.exports = { listPublic, listAll, create, update, replaceLogo, remove };
