const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

// "expired" is not stored: a pending quotation whose expiresAt has passed is reported as expired (see quotationService).
const QUOTATION_STATUS = ['pending', 'accepted', 'rejected', 'withdrawn'];

const quotationSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },

    // Whole Rwandan francs (integer). Never a float.
    price: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'Price must be a whole number of RWF' } },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
    deliverables: { type: [{ type: String, trim: true, maxlength: 200 }], default: [], validate: { validator: (v) => v.length <= 10, message: 'At most 10 deliverables' } },
    estimatedDuration: { type: String, required: true, trim: true, maxlength: 60 },
    expiresAt: { type: Date, required: true },
    terms: { type: String, trim: true, maxlength: 2000 },

    status: { type: String, enum: QUOTATION_STATUS, default: 'pending' },
    decidedAt: { type: Date },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

// One quotation per provider per request (they can edit or withdraw it, not stack several).
quotationSchema.index({ request: 1, provider: 1 }, { unique: true });
quotationSchema.index({ request: 1, status: 1, createdAt: -1 });
quotationSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('Quotation', quotationSchema);
module.exports.QUOTATION_STATUS = QUOTATION_STATUS;
