const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

// Platform Terms and Conditions. Versions are immutable: changing the terms means publishing a new version, which everyone
// must accept again before requesting or offering services.
const termsSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, unique: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, maxlength: 60000 },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // empty for the built-in first version
    publishedAt: { type: Date, required: true },
  },
  { timestamps: false, toJSON: toJSONOptions(['publishedBy']) },
);

module.exports = mongoose.model('TermsDocument', termsSchema);
