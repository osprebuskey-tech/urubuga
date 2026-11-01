const mongoose = require('mongoose');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { toJSONOptions } = require('./helpers');

const districts = [...RWANDA_DISTRICTS];
// needs_info: an administrator reviewed the request and asked the provider for more information before deciding.
const VERIFICATION_STATUS = ['unverified', 'pending', 'needs_info', 'verified', 'rejected'];

const portfolioItemSchema = new mongoose.Schema(
  {
    imageKey: { type: String, required: true },
    imageUrl: { type: String, required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions(['imageKey']) },
);

const providerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 1000 },
    avatarKey: { type: String },
    avatarUrl: { type: String },

    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory' }],
    // Which documents are required depends on this: individuals give a National ID and CV; businesses an RDB certificate and the representative's ID.
    providerType: { type: String, enum: ['individual', 'business'], default: 'individual' },
    skills: [{ type: String, trim: true, maxlength: 40 }],
    experienceYears: { type: Number, min: 0, max: 60, validate: { validator: Number.isInteger, message: 'Must be a whole number' } },

    location: {
      district: { type: String, enum: districts },
      sector: { type: String, trim: true, maxlength: 60 },
    },
    coverage: [{ type: String, enum: districts }],

    // Private by default: email/phone are only shown publicly if the provider opts in.
    contactPreferences: {
      showPhone: { type: Boolean, default: false },
      showEmail: { type: Boolean, default: false },
      preferredChannel: { type: String, enum: ['in_app', 'phone', 'email'], default: 'in_app' },
    },

    portfolio: [portfolioItemSchema],

    verificationStatus: { type: String, enum: VERIFICATION_STATUS, default: 'unverified' },
    verificationNote: { type: String, maxlength: 500 }, // the administrator's message to the provider (reason or question)
    verificationResponse: { type: String, maxlength: 500 }, // the provider's reply when they resubmit after a needs_info request
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // System-maintained. Never writable through the API.
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    completedJobs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: toJSONOptions(['avatarKey']) },
);

providerProfileSchema.index({ verificationStatus: 1, createdAt: -1 });
providerProfileSchema.index({ categories: 1, ratingAvg: -1 });
providerProfileSchema.index({ 'location.district': 1 });
providerProfileSchema.index({ coverage: 1 });
// Keyword search over name, skills and bio (in that order of importance).
providerProfileSchema.index(
  { displayName: 'text', skills: 'text', bio: 'text' },
  { weights: { displayName: 5, skills: 3, bio: 1 }, name: 'provider_text' },
);

module.exports = mongoose.model('ProviderProfile', providerProfileSchema);
module.exports.VERIFICATION_STATUS = VERIFICATION_STATUS;
