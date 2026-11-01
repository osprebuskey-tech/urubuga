const { z } = require('zod');
const { ROLES, USER_STATUS } = require('../utils/roles');
const { VERIFICATION_STATUS } = require('../models/ProviderProfile');
const { paginationQuery, optionalParam, isoDay } = require('./commonValidators');
const { fields } = require('./authValidators');
const { STAFF_ROLES } = require('../utils/roles');

const listUsersQuery = paginationQuery.extend({
  role: z.enum(Object.values(ROLES)).optional(),
  status: z.enum(Object.values(USER_STATUS)).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  verified: z.enum(['yes', 'no']).optional(),
});

const listProvidersQuery = paginationQuery.extend({
  verificationStatus: z.enum(VERIFICATION_STATUS).optional(),
});

// "pending" can only be set by the provider (verification request), never by an admin.
// Decisions: verified (accept), rejected (reject, with a reason), needs_info (ask the provider for more, with a question).
const verificationBody = z
  .object({
    status: z.enum(['verified', 'rejected', 'needs_info', 'unverified']),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'rejected' && (!v.note || v.note.length < 5)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'A reason (at least 5 characters) is required when rejecting' });
    }
    if (v.status === 'needs_info' && (!v.note || v.note.length < 5)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say what information you need (at least 5 characters)' });
    }
  });



// Suspending needs a reason (kept in the audit log); reinstating does not.
// Verifying needs no reason (a note is optional); removing a verification needs one, because it is kept in the audit log.
const userVerificationBody = z
  .object({ verified: z.boolean(), note: z.string().trim().max(500).optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.verified && (!v.note || v.note.length < 5)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Give a reason of at least 5 characters for removing a verification' });
    }
  });

const userStatusBody = z
  .object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().max(500).optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'suspended' && (!v.reason || v.reason.length < 5)) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason of at least 5 characters for suspending an account' });
    }
  });

// A date range of at most a year. Both ends are optional (default: the last 30 days).
const reportsQuery = z
  .object({ from: optionalParam(isoDay), to: optionalParam(isoDay) })
  .superRefine((v, ctx) => {
    const start = v.from ? Date.parse(`${v.from}T00:00:00Z`) : null;
    const end = v.to ? Date.parse(`${v.to}T00:00:00Z`) : null;
    if (start && end && start > end) ctx.addIssue({ code: 'custom', path: ['from'], message: 'from cannot be after to' });
    if (start && end && (end - start) / 86_400_000 > 365) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Choose a range of at most 366 days' });
  });

// Super admin creating an account. Staff roles (admin, finance, super admin) cannot be mixed with customer, provider or business
// roles: someone who approves providers or handles payments must not also be a party to jobs.
const createUserBody = z
  .object({
    fullName: z.string().trim().min(2, 'Enter the full name').max(100),
    email: fields.email,
    phone: fields.phone.optional(),
    roles: z.array(z.enum(Object.values(ROLES))).min(1, 'Choose at least one role').max(Object.values(ROLES).length).transform((r) => [...new Set(r)]),
  })
  .strict()
  .superRefine((v, ctx) => {
    const staff = v.roles.filter((r) => STAFF_ROLES.includes(r));
    if (staff.length > 0 && staff.length !== v.roles.length) {
      ctx.addIssue({ code: 'custom', path: ['roles'], message: 'Staff roles cannot be combined with customer, provider or business roles' });
    }
  });

module.exports = { createUserBody, listUsersQuery, listProvidersQuery, verificationBody, userStatusBody, userVerificationBody, reportsQuery };
