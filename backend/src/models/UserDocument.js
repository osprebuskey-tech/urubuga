const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

// National ID and CV (individuals), RDB certificate and the representative's National ID (businesses), National ID (customers).
const DOCUMENT_KINDS = ['national_id', 'cv', 'rdb_certificate', 'representative_id'];

const userDocumentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    storageKey: { type: String, required: true }, // PRIVATE storage key. Never returned by the API.
    originalName: { type: String, trim: true, maxlength: 120 },
    mime: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true }, // fingerprint, so a later swap of the stored file would be noticed
    status: { type: String, enum: ['active', 'replaced'], default: 'active' },
    replacedAt: { type: Date },
  },
  { timestamps: { createdAt: 'uploadedAt', updatedAt: true }, toJSON: toJSONOptions(['storageKey', 'sha256']) },
);

// One live document of each kind per person; replacing one retires the old row (the history stays).
userDocumentSchema.index({ owner: 1, kind: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });

module.exports = mongoose.model('UserDocument', userDocumentSchema);
module.exports.DOCUMENT_KINDS = DOCUMENT_KINDS;
