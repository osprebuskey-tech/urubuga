const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const KINDS = ['payment', 'payout']; // chasing money owed by a customer, or a payout owed to a provider
const OUTCOMES = ['contacted', 'promised', 'no_answer', 'resolved', 'other'];

/** One entry in the log kept by whoever is following up a payment. Append-only: entries are never edited or deleted. */
const followUpSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    kind: { type: String, enum: KINDS, required: true },
    outcome: { type: String, enum: OUTCOMES, default: 'contacted' },
    note: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    nextFollowUpAt: { type: Date }, // when to look at this again
    reminderSent: { type: Boolean, default: false }, // a payment reminder was also sent to the customer
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions() },
);

followUpSchema.index({ booking: 1, kind: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentFollowUp', followUpSchema);
module.exports.KINDS = KINDS;
module.exports.OUTCOMES = OUTCOMES;
