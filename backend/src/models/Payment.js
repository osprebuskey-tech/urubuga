const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const PAYMENT_STATUS = ['pending', 'succeeded', 'failed', 'cancelled'];
const GATEWAYS = ['manual', 'sandbox']; // add a real gateway's name here when its provider module is written

const rwf = (extra = {}) => ({ type: Number, validate: { validator: Number.isInteger, message: 'Must be a whole number of RWF' }, ...extra });

const refundSchema = new mongoose.Schema(
  {
    amount: rwf({ required: true, min: 1 }),
    commissionPart: rwf({ required: true, min: 0 }), // the part taken back from the platform's commission
    providerPart: rwf({ required: true, min: 0 }), // the part taken back from the provider's share
    reason: { type: String, trim: true, maxlength: 300, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const payoutSchema = new mongoose.Schema(
  {
    amount: rwf({ required: true, min: 1 }),
    reference: { type: String, trim: true, maxlength: 100, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    providerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    gateway: { type: String, enum: GATEWAYS, required: true },
    currency: { type: String, enum: ['RWF'], default: 'RWF' },

    // Gross amount, copied from the booking's agreed price on the server. The commission split is a snapshot taken
    // when the payment is created, so later changes to the platform rate never alter an existing payment.
    amount: rwf({ required: true, min: 1 }),
    commissionRateBps: { type: Number, required: true, min: 0, max: 10000 },
    commissionAmount: rwf({ required: true, min: 0 }),
    providerAmount: rwf({ required: true, min: 0 }),

    status: { type: String, enum: PAYMENT_STATUS, default: 'pending' },
    active: { type: Boolean, default: true }, // true while pending or succeeded; at most one active payment per booking
    gatewayReference: { type: String, trim: true, maxlength: 100 }, // the gateway's transaction id, or the bank / mobile money reference
    instructions: { type: String, maxlength: 500 },
    confirmedAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set for manually confirmed payments
    manualNote: { type: String, trim: true, maxlength: 300 },
    failureReason: { type: String, trim: true, maxlength: 300 },

    // Refunds and payouts are tracked separately from the gross amount, never by editing it.
    refunds: { type: [refundSchema], default: [] },
    refundedAmount: rwf({ default: 0, min: 0 }),
    commissionRefunded: rwf({ default: 0, min: 0 }),
    providerRefunded: rwf({ default: 0, min: 0 }),
    payouts: { type: [payoutSchema], default: [] },
    paidOut: rwf({ default: 0, min: 0 }),
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

// Never more than one live (pending or succeeded) payment for a booking, even if two checkouts race.
paymentSchema.index({ booking: 1 }, { unique: true, partialFilterExpression: { active: true } });
// The same gateway transaction can never be attached to two payments.
paymentSchema.index({ gateway: 1, gatewayReference: 1 }, { unique: true, partialFilterExpression: { gatewayReference: { $type: 'string' } } });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ providerUser: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.GATEWAYS = GATEWAYS;
