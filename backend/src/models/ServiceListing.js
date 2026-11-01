const mongoose = require('mongoose');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { toJSONOptions } = require('./helpers');

const LISTING_STATUS = ['draft', 'active', 'paused', 'archived'];
const PRICING_TYPES = ['fixed', 'hourly', 'quotation'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const imageSchema = new mongoose.Schema(
  { key: { type: String, required: true }, url: { type: String, required: true } },
  { toJSON: toJSONOptions(['key']) },
);

const listingSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', required: true },
    subcategory: { type: String, trim: true, lowercase: true, maxlength: 80 }, // slug within the category
    images: { type: [imageSchema], default: [] },

    // Whole Rwandan francs (integer). Optional for quotation-based pricing.
    priceFrom: { type: Number, min: 0, validate: { validator: Number.isInteger, message: 'Price must be a whole number of RWF' } },
    pricingType: { type: String, enum: PRICING_TYPES, required: true },
    estimatedDuration: { type: String, trim: true, maxlength: 60 },

    location: {
      district: { type: String, enum: [...RWANDA_DISTRICTS], required: true },
      sector: { type: String, trim: true, maxlength: 60 },
    },
    availability: {
      days: [{ type: String, enum: DAYS }],
      notes: { type: String, trim: true, maxlength: 300 },
    },

    status: { type: String, enum: LISTING_STATUS, default: 'draft' },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

listingSchema.index({ status: 1, category: 1, priceFrom: 1 });
listingSchema.index({ status: 1, 'location.district': 1 });
listingSchema.index({ provider: 1, status: 1, createdAt: -1 });
// Keyword search. A title match counts five times as much as a description match.
listingSchema.index({ title: 'text', description: 'text' }, { weights: { title: 5, description: 1 }, name: 'listing_text' });

module.exports = mongoose.model('ServiceListing', listingSchema);
module.exports.LISTING_STATUS = LISTING_STATUS;
module.exports.PRICING_TYPES = PRICING_TYPES;
module.exports.DAYS = DAYS;
