const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const PARTNER_KINDS = ['partner', 'sponsor'];
const PARTNER_STATUS = ['active', 'hidden'];

const partnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    kind: { type: String, enum: PARTNER_KINDS, default: 'partner' },
    websiteUrl: { type: String, trim: true, maxlength: 300 },
    logoUrl: { type: String, required: true },
    logoKey: { type: String, required: true },
    sortOrder: { type: Number, default: 0, min: 0, max: 10000 },
    status: { type: String, enum: PARTNER_STATUS, default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: toJSONOptions(['logoKey', 'createdBy']) },
);

partnerSchema.index({ status: 1, kind: -1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('Partner', partnerSchema);
module.exports.PARTNER_KINDS = PARTNER_KINDS;
module.exports.PARTNER_STATUS = PARTNER_STATUS;
