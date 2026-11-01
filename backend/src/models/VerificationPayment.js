const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const METHODS = ['mobile_money', 'card', 'bank_transfer'];
const STATUS = ['pending', 'succeeded', 'failed', 'cancelled'];

// The verification fee. Separate from booking payments (no commission, no payouts). "succeeded" is only ever set on the
// server: by a signature-checked gateway webhook whose amount matches, or by staff who saw the money and entered the reference.
const verificationPaymentSchema = new mongoose.Schema(
  {
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'VerificationApplication', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, enum: METHODS, required: true },
    gateway: { type: String, enum: ['manual', 'sandbox'], required: true },
    amount: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'Must be a whole number of RWF' } },
    currency: { type: String, enum: ['RWF', 'USD'], default: 'RWF' },
    status: { type: String, enum: STATUS, default: 'pending' },
    active: { type: Boolean, default: true },
    gatewayReference: { type: String, trim: true, maxlength: 100 },
    payerPhone: { type: String, trim: true, maxlength: 20 },
    instructions: { type: String, maxlength: 800 },
    confirmedAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: 300 },
    failureReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

verificationPaymentSchema.index({ application: 1 }, { unique: true, partialFilterExpression: { active: true } });
verificationPaymentSchema.index({ gateway: 1, gatewayReference: 1 }, { unique: true, partialFilterExpression: { gatewayReference: { $type: 'string' } } });
verificationPaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('VerificationPayment', verificationPaymentSchema);
Object.assign(module.exports, { METHODS, STATUS });
