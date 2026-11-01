const crypto = require('crypto');
const UserDocument = require('../models/UserDocument');
const VerificationApplication = require('../models/VerificationApplication');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const storage = require('./storage');
const audit = require('./auditService');
const { ROLES, isAdmin, isSuperAdmin } = require('../utils/roles');

const idOf = (v) => String(v?._id ?? v);
const LABELS = { national_id: 'National ID', cv: 'CV', rdb_certificate: 'RDB registration certificate', representative_id: 'Authorised representative\'s National ID' };
const LOCKED = ['payment_confirmed', 'under_review', 'recommended']; // while reviewers are looking at them, documents cannot be swapped

/**
 * What a person must have uploaded, depending on what they want to do:
 *   hire     customers: National ID. Business accounts: RDB registration certificate + the authorised representative's National ID.
 *   provide  individual providers: National ID + CV. Business providers: RDB certificate + the authorised representative's National ID.
 */
async function requiredKinds(user, purpose) {
  if (purpose === 'provide') {
    const profile = await ProviderProfile.findOne({ user: user._id }).select('providerType');
    return profile?.providerType === 'business' ? ['rdb_certificate', 'representative_id'] : ['national_id', 'cv'];
  }
  return user.roles.includes(ROLES.BUSINESS) ? ['rdb_certificate', 'representative_id'] : ['national_id'];
}

/** Every kind this person may upload (a provider can change type, a person can both hire and provide). */
function allowedKinds(user) {
  const kinds = new Set();
  if (user.roles.includes(ROLES.CUSTOMER)) kinds.add('national_id');
  if (user.roles.includes(ROLES.PROVIDER)) ['national_id', 'cv', 'rdb_certificate', 'representative_id'].forEach((k) => kinds.add(k));
  if (user.roles.includes(ROLES.BUSINESS)) ['rdb_certificate', 'representative_id'].forEach((k) => kinds.add(k));
  return [...kinds];
}

const toJSON = (d) => ({ id: String(d._id), kind: d.kind, label: LABELS[d.kind], originalName: d.originalName, mime: d.mime, size: d.size, uploadedAt: d.uploadedAt });

async function status(user) {
  const docs = await UserDocument.find({ owner: user._id, status: 'active' }).sort({ kind: 1 });
  const have = new Set(docs.map((d) => d.kind));
  const purposes = [];
  if (user.roles.some((r) => [ROLES.CUSTOMER, ROLES.BUSINESS].includes(r))) purposes.push('hire');
  if (user.roles.includes(ROLES.PROVIDER)) purposes.push('provide');
  const requirements = {};
  for (const p of purposes) {
    const required = await requiredKinds(user, p);
    requirements[p] = { required: required.map((k) => ({ kind: k, label: LABELS[k], uploaded: have.has(k) })), missing: required.filter((k) => !have.has(k)), complete: required.every((k) => have.has(k)) };
  }
  return { documents: docs.map(toJSON), requirements, allowedKinds: allowedKinds(user).map((k) => ({ kind: k, label: LABELS[k] })) };
}

/** Throws DOCUMENTS_REQUIRED, naming what is missing, unless the person has uploaded everything this purpose needs. */
async function assertComplete(user, purpose) {
  const required = await requiredKinds(user, purpose);
  const have = new Set((await UserDocument.find({ owner: user._id, status: 'active', kind: { $in: required } }).select('kind')).map((d) => d.kind));
  const missing = required.filter((k) => !have.has(k));
  if (missing.length) throw new AppError(403, `Upload your ${missing.map((k) => LABELS[k]).join(' and ')} first`, 'DOCUMENTS_REQUIRED', { missing });
  return required;
}

async function upload(user, kind, file, ctx) {
  if (!allowedKinds(user).includes(kind)) throw new AppError(400, 'That document is not needed for your account', 'DOCUMENT_NOT_NEEDED');
  const locked = await VerificationApplication.exists({ user: user._id, active: true, status: { $in: LOCKED } });
  if (locked) throw new AppError(409, 'Your documents are being reviewed and cannot be changed right now', 'DOCUMENTS_LOCKED');

  const saved = await storage.savePrivate({ buffer: file.buffer, ext: file.ext, mime: file.mime, folder: `documents/${user._id}` });
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  let doc;
  try {
    const old = await UserDocument.findOneAndUpdate({ owner: user._id, kind, status: 'active' }, { $set: { status: 'replaced', replacedAt: new Date() } });
    try {
      doc = await UserDocument.create({ owner: user._id, kind, storageKey: saved.key, originalName: file.originalName, mime: file.mime, size: file.size, sha256 });
    } catch (err) {
      if (old) await UserDocument.updateOne({ _id: old._id }, { $set: { status: 'active' }, $unset: { replacedAt: '' } }); // put the old one back
      throw err;
    }
  } catch (err) {
    await storage.removePrivate(saved.key);
    throw err;
  }
  await audit.record({ actor: user._id, action: 'document.uploaded', entityType: 'UserDocument', entityId: doc._id, metadata: { kind, mime: file.mime, size: file.size }, ctx });
  return toJSON(doc);
}

/** Staff may open a document only when its owner has a verification application: least privilege, and every opening is audited. */
async function readForViewer(viewer, id, ctx) {
  const doc = await UserDocument.findById(id).select('+storageKey');
  if (!doc) throw new AppError(404, 'Document not found', 'DOCUMENT_NOT_FOUND');
  const owner = idOf(doc.owner) === String(viewer._id);
  if (!owner) {
    const staff = isAdmin(viewer) || isSuperAdmin(viewer);
    const reviewable = staff && (await VerificationApplication.exists({ user: doc.owner }));
    if (!reviewable) throw new AppError(404, 'Document not found', 'DOCUMENT_NOT_FOUND');
    await audit.record({ actor: viewer._id, action: 'document.viewed', entityType: 'UserDocument', entityId: doc._id, metadata: { kind: doc.kind, owner: idOf(doc.owner) }, ctx, strict: true });
  }
  const buffer = await storage.readPrivate(doc.storageKey);
  if (crypto.createHash('sha256').update(buffer).digest('hex') !== doc.sha256) throw new AppError(500, 'This document failed its integrity check', 'DOCUMENT_CORRUPT');
  return { buffer, mime: doc.mime, name: doc.originalName || `${doc.kind}` };
}

module.exports = { requiredKinds, allowedKinds, status, assertComplete, upload, readForViewer, toJSON, LABELS };
