const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

// An administrator flags a highly rated provider for the super administrator, with the ratings and job history as evidence.
// It is advice only: verification still needs the provider's own application, confirmed payment and the super administrator's decision.
const recommendationSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, required: true, minlength: 10, maxlength: 600 },
    ratings: { average: Number, count: Number, completedJobs: Number },
    status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true, maxlength: 400 },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

recommendationSchema.index({ provider: 1 }, { unique: true, partialFilterExpression: { status: 'open' } }); // one open recommendation per provider
recommendationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('VerificationRecommendation', recommendationSchema);
