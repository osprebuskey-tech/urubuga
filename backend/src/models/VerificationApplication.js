const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

// What the applicant and reviewers see. Payment is tracked in its own field: paying never changes the review outcome.
const APPLICATION_STATUS = ['pending_payment', 'payment_confirmed', 'under_review', 'more_info_required', 'recommended', 'approved', 'rejected'];
const PAYMENT_STATUS = ['unpaid', 'pending', 'confirmed', 'failed', 'waived'];
const FINAL_STATUS = ['approved', 'rejected'];
// 'provider': a service provider's profile (paid review). 'account': a customer or business account (no fee, same review steps).
const APPLICATION_KINDS = ['provider', 'account'];

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['applicant', 'admin', 'super_admin', 'finance', 'system'], required: true },
    action: { type: String, required: true, maxlength: 60 },
    from: { type: String },
    to: { type: String },
    note: { type: String, maxlength: 600 },
  },
  { _id: false },
);

const infoRequestSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, maxlength: 600 },
    at: { type: Date, required: true },
    response: { type: String, maxlength: 600 },
    respondedAt: { type: Date },
  },
  { _id: false },
);

const snapshotSchema = new mongoose.Schema({ average: Number, count: Number, completedJobs: Number }, { _id: false });

const applicationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: APPLICATION_KINDS, default: 'provider' },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile' }, // absent for an 'account' application
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: APPLICATION_STATUS, default: 'pending_payment' },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'unpaid' },
    // The fee published by the super administrator when the applicant applied. Later fee changes never alter it.
    fee: { amount: { type: Number, required: true, min: 0 }, currency: { type: String, default: 'RWF' }, version: Number },
    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UserDocument' }],
    active: { type: Boolean, default: true }, // false once approved or rejected, so the provider can apply again after a rejection

    infoRequests: { type: [infoRequestSchema], default: [] },
    // An administrator's recommendation, with the evidence it rests on. It never verifies anyone by itself.
    recommendation: { by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, note: String, at: Date, ratings: snapshotSchema },
    // The final word. Only the super administrator may approve; an administrator may reject (with a reason), and the super administrator can reopen that.
    decision: { outcome: { type: String, enum: ['approved', 'rejected'] }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, byRole: String, reason: { type: String, maxlength: 600 }, at: Date },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

// One open application per provider, and one open account application per person. (Run `npm run migrate:account-verification` once on an
// existing database: it replaces the older provider-only index, which would treat every account application as the same provider.)
applicationSchema.index({ provider: 1 }, { name: 'provider_active_unique', unique: true, partialFilterExpression: { active: true, provider: { $exists: true } } });
applicationSchema.index({ user: 1 }, { name: 'account_active_unique', unique: true, partialFilterExpression: { active: true, kind: 'account' } });
applicationSchema.index({ status: 1, updatedAt: -1 });
applicationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('VerificationApplication', applicationSchema);
Object.assign(module.exports, { APPLICATION_STATUS, PAYMENT_STATUS, FINAL_STATUS, APPLICATION_KINDS });
