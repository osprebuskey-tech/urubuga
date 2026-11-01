const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const REVIEW_STATUS = ['published', 'hidden'];
const REPORT_REASONS = ['abusive', 'fake', 'unrelated', 'other'];

const reportSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    // One review per completed job, written by the customer who hired the provider.
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    rating: { type: Number, required: true, min: 1, max: 5, validate: { validator: Number.isInteger, message: 'Rating must be a whole number from 1 to 5' } },
    comment: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },

    // Only published reviews count towards a provider's rating and appear publicly.
    status: { type: String, enum: REVIEW_STATUS, default: 'published' },
    hiddenReason: { type: String, trim: true, maxlength: 500 },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },

    reports: { type: [reportSchema], default: [] },
    reportCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

reviewSchema.index({ booking: 1 }, { unique: true }); // no duplicate reviews for the same job
reviewSchema.index({ provider: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, reportCount: -1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
module.exports.REVIEW_STATUS = REVIEW_STATUS;
module.exports.REPORT_REASONS = REPORT_REASONS;
