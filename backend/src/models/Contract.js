const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const acceptanceSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['customer', 'provider'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: { type: Date, required: true },
    ip: { type: String, maxlength: 64 },
  },
  { _id: false },
);

// One immutable snapshot per version. Editing the terms adds a new version and starts the acceptances again.
const versionSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, min: 1 },
    content: {
      serviceDescription: { type: String, required: true, maxlength: 3000 },
      agreedPrice: { type: Number, required: true, min: 1 },
      currency: { type: String, default: 'RWF' },
      deliverables: { type: [String], default: [] },
      deadline: { type: Date },
      estimatedDuration: { type: String, maxlength: 60 },
      customerResponsibilities: { type: [String], default: [] },
      providerResponsibilities: { type: [String], default: [] },
      paymentTerms: { type: String, required: true, maxlength: 2000 },
      cancellationTerms: { type: String, required: true, maxlength: 2000 },
      disputeResolution: { type: String, required: true, maxlength: 2000 },
      platformTermsVersion: { type: Number },
    },
    contentHash: { type: String, required: true }, // SHA-256 of the content, so any later change to a stored version is detectable
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, required: true },
    note: { type: String, maxlength: 300 },
    acceptances: { type: [acceptanceSchema], default: [] },
  },
  { _id: false },
);

const contractSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    providerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    versions: { type: [versionSchema], default: [] },
    currentVersion: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' }, // accepted = both parties accepted the CURRENT version
    acceptedAt: { type: Date },
    legacy: { type: Boolean, default: false }, // created by the migration for a job that began before contracts existed
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

contractSchema.index({ booking: 1 }, { unique: true });
contractSchema.index({ customer: 1, createdAt: -1 });
contractSchema.index({ providerUser: 1, createdAt: -1 });
contractSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Contract', contractSchema);
