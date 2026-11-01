const mongoose = require('mongoose');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { toJSONOptions } = require('./helpers');

// A request is "open" until the customer accepts a quotation or cancels it.
// The job lifecycle (in progress, completed, disputed...) belongs to the Booking model in Milestone 5.
const REQUEST_STATUS = ['open', 'accepted', 'cancelled'];

const attachmentSchema = new mongoose.Schema(
  { key: { type: String, required: true }, url: { type: String, required: true } },
  { toJSON: toJSONOptions(['key']) },
);

const wholeRwf = { validator: Number.isInteger, message: 'Must be a whole number of RWF' };

const requestSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyProfile' }, // set when a business requests on behalf of its company
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile' }, // set when the request is directed at one provider

    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', required: true },
    subcategory: { type: String, trim: true, lowercase: true, maxlength: 80 },
    attachments: { type: [attachmentSchema], default: [] },

    location: {
      district: { type: String, enum: [...RWANDA_DISTRICTS], required: true },
      sector: { type: String, trim: true, maxlength: 60 },
    },
    preferredDate: { type: Date },
    budgetMin: { type: Number, min: 0, validate: wholeRwf },
    budgetMax: { type: Number, min: 0, validate: wholeRwf },

    status: { type: String, enum: REQUEST_STATUS, default: 'open' },
    acceptedQuotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

requestSchema.index({ customer: 1, status: 1, createdAt: -1 });
requestSchema.index({ status: 1, category: 1, createdAt: -1 });
requestSchema.index({ provider: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceRequest', requestSchema);
module.exports.REQUEST_STATUS = REQUEST_STATUS;
