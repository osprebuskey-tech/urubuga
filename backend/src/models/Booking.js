const mongoose = require('mongoose');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { toJSONOptions } = require('./helpers');

// A booking is created when a customer accepts a quotation, so its lifecycle starts at "accepted".
// (REQUESTED and QUOTED are the states of the ServiceRequest and Quotation that came before it.)
const BOOKING_STATUS = ['accepted', 'in_progress', 'completed', 'cancelled', 'disputed'];

const historySchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...BOOKING_STATUS] },
    to: { type: String, enum: BOOKING_STATUS, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    note: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
    quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyProfile' },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    providerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the provider profile's owner, for access checks

    // Snapshots taken when the quotation was accepted. Later edits to the request or profile never change a booking.
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', required: true },
    location: { district: { type: String, enum: [...RWANDA_DISTRICTS] }, sector: { type: String, trim: true, maxlength: 60 } },
    // The price both sides agreed to, in whole RWF, copied from the accepted quotation. Payments (Milestone 6) read this.
    agreedPrice: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'Price must be a whole number of RWF' } },

    // Set when the provider explicitly accepts the job (by accepting its contract). Contact details stay hidden until then.
    providerAcceptedAt: { type: Date },
    status: { type: String, enum: BOOKING_STATUS, default: 'accepted' },
    history: { type: [historySchema], default: [] },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    disputedAt: { type: Date },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

bookingSchema.index({ request: 1 }, { unique: true }); // one booking per request
bookingSchema.index({ quotation: 1 }, { unique: true });
bookingSchema.index({ customer: 1, status: 1, createdAt: -1 });
bookingSchema.index({ providerUser: 1, status: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
module.exports.BOOKING_STATUS = BOOKING_STATUS;
