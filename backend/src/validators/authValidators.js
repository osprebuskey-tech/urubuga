const { z } = require('zod');
const { SELF_REGISTRATION_ROLES } = require('../utils/roles');

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

// bcrypt only uses the first 72 BYTES, so cap by bytes (not characters) to avoid silent truncation.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password is too long (max 72 bytes)')
  .refine((v) => /[A-Za-z]/.test(v), 'Password must contain a letter')
  .refine((v) => /\d/.test(v), 'Password must contain a number');

// Rwandan mobile numbers (072/073/078/079), normalised to +2507XXXXXXXX
const phone = z
  .string()
  .trim()
  .regex(/^(\+250|250|0)?7[2389]\d{7}$/, 'Enter a valid Rwandan mobile number')
  .transform((v) => `+250${v.replace(/^(\+250|250|0)/, '')}`);

const oneTimeToken = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid token');

// .strict() rejects unknown keys, so { "roles": ["admin"] } or { "status": "active" } fail loudly.
// "Keep me signed in": a longer session. It is never granted to staff accounts, whatever is sent.
const remember = z.boolean().optional();

const registerBody = z
  .object({
    fullName: z.string().trim().min(2, 'Name is too short').max(100),
    email,
    phone: phone.optional(),
    password,
    roles: z
      .array(z.enum(SELF_REGISTRATION_ROLES))
      .min(1)
      .max(SELF_REGISTRATION_ROLES.length)
      .transform((r) => [...new Set(r)])
      .optional(),
    remember,
  })
  .strict();

const loginBody = z.object({ email, password: z.string().min(1).max(128), remember }).strict();
const forgotPasswordBody = z.object({ email }).strict();
const resetPasswordBody = z.object({ token: oneTimeToken, password }).strict();
const verifyEmailBody = z.object({ token: oneTimeToken }).strict();

// Name and phone only. Email and roles are deliberately not editable here (email changes need re-verification).
// A null phone removes the number.
const updateProfileBody = z
  .object({ fullName: z.string().trim().min(2, 'Name is too short').max(100).optional(), phone: phone.nullable().optional() })
  .strict()
  .refine((v) => v.fullName !== undefined || v.phone !== undefined, { message: 'Send at least one field to change' });

const changePasswordBody = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password').max(128), newPassword: password })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], message: 'Choose a password you have not used just now' });

module.exports = { fields: { email, phone, password }, registerBody, loginBody, forgotPasswordBody, resetPasswordBody, verifyEmailBody, updateProfileBody, changePasswordBody };
