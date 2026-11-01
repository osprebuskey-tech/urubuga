const mongoose = require('mongoose');

// One row per webhook event the gateway has sent us. The unique (gateway, eventId) key is what makes webhook
// processing idempotent: a re-delivered event finds its row and is not applied twice.
const paymentEventSchema = new mongoose.Schema(
  {
    gateway: { type: String, required: true },
    eventId: { type: String, required: true, maxlength: 100 },
    type: { type: String, maxlength: 60 },
    reference: { type: String, maxlength: 100 },
    status: { type: String, enum: ['received', 'processed', 'ignored'], default: 'received' },
    outcome: { type: String, maxlength: 60 }, // e.g. succeeded, duplicate, unknown_reference, amount_mismatch, needs_attention
    processedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentEventSchema.index({ gateway: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('PaymentEvent', paymentEventSchema);
