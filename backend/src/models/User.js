const mongoose = require('mongoose');
const { ROLES, USER_STATUS } = require('../utils/roles');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    phone: { type: String, trim: true, maxlength: 20 },

    // Never returned by queries unless explicitly requested with .select('+field')
    passwordHash: { type: String, required: true, select: false },

    roles: {
      type: [{ type: String, enum: Object.values(ROLES) }],
      default: [ROLES.CUSTOMER],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one role is required',
      },
    },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },

    emailVerified: { type: Boolean, default: false },
    // Only SHA-256 hashes of one-time tokens are stored; the raw token exists only in the email.
    emailVerificationTokenHash: { type: String, select: false, index: true, sparse: true },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false, index: true, sparse: true },
    passwordResetExpires: { type: Date, select: false },

    // Incremented on logout / password reset to revoke every previously issued access token.
    tokenVersion: { type: Number, default: 0 },
    suspendedAt: { type: Date },
    suspensionReason: { type: String, trim: true, maxlength: 500 },
    lastLoginAt: { type: Date },
    // Account verification by the super administrator (separate from the provider verification flow and from email confirmation).
    accountVerified: { type: Boolean, default: false },
    accountVerifiedAt: { type: Date },
    accountVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    accountVerificationNote: { type: String, trim: true, maxlength: 500 },
    invitePending: { type: Boolean, default: false }, // created by a super admin; true until the person has chosen their own password
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.emailVerificationTokenHash;
        delete ret.emailVerificationExpires;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        delete ret.tokenVersion;
        delete ret.accountVerifiedBy;
        return ret;
      },
    },
  },
);

userSchema.index({ roles: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
