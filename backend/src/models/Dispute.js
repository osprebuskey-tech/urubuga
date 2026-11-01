const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const DISPUTE_STATUS = ['open', 'under_review', 'resolved'];

const messageSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const evidenceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    at: { type: Date, required: true },
  },
  { toJSON: toJSONOptions(['key']) },
);

const disputeSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // copied from the booking, for access checks
    providerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    opener: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    openerRole: { type: String, enum: ['customer', 'provider'], required: true },
    reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },

    status: { type: String, enum: DISPUTE_STATUS, default: 'open' },
    active: { type: Boolean, default: true }, // true until resolved; a booking has at most one active dispute
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    messages: { type: [messageSchema], default: [] },
    evidence: { type: [evidenceSchema], default: [] },

    resolution: {
      outcome: { type: String, enum: ['completed', 'cancelled'] }, // what the job became
      note: { type: String, trim: true, maxlength: 500 },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

disputeSchema.index({ booking: 1 }, { unique: true, partialFilterExpression: { active: true } });
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ customer: 1, createdAt: -1 });
disputeSchema.index({ providerUser: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', disputeSchema);
module.exports.DISPUTE_STATUS = DISPUTE_STATUS;
