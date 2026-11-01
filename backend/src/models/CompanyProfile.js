const mongoose = require('mongoose');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { toJSONOptions } = require('./helpers');

const companyProfileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    companyName: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    registrationNumber: { type: String, trim: true, maxlength: 30 }, // TIN / RDB number. Owner and admin only.
    industry: { type: String, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000 },
    website: { type: String, trim: true, maxlength: 200 },
    address: {
      district: { type: String, enum: [...RWANDA_DISTRICTS] },
      sector: { type: String, trim: true, maxlength: 60 },
      street: { type: String, trim: true, maxlength: 120 },
    },
    contactPerson: {
      name: { type: String, trim: true, maxlength: 100 },
      phone: { type: String, trim: true, maxlength: 20 },
    },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

module.exports = mongoose.model('CompanyProfile', companyProfileSchema);
