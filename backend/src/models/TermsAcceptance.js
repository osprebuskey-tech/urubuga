const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const acceptanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    termsVersion: { type: Number, required: true },
    acceptedAt: { type: Date, required: true },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: false, toJSON: toJSONOptions(['ip', 'userAgent']) },
);

acceptanceSchema.index({ user: 1, termsVersion: 1 }, { unique: true }); // accepting twice records nothing new

module.exports = mongoose.model('TermsAcceptance', acceptanceSchema);
