const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  PROVIDER: 'provider',
  BUSINESS: 'business',
  ADMIN: 'admin',
  // Staff roles. Never self-assignable: only a super admin can create these accounts (or the create-admin scripts).
  SUPER_ADMIN: 'super_admin', // everything an admin can do, plus creating users and the activity report
  FINANCE: 'finance', // in charge of payment follow-up: payments, payouts, refunds; nothing else
});

// Roles a person may pick for themselves at sign-up. Staff roles are never self-assignable.
const SELF_REGISTRATION_ROLES = Object.freeze([ROLES.CUSTOMER, ROLES.PROVIDER, ROLES.BUSINESS]);

const ADMIN_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
const STAFF_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.FINANCE]);

const USER_STATUS = Object.freeze({ ACTIVE: 'active', SUSPENDED: 'suspended' });

const has = (user, roles) => Boolean(user?.roles?.some((r) => roles.includes(r)));

/** Administrators: the admin role, and super admins (who can do everything an admin can). */
const isAdmin = (user) => has(user, ADMIN_ROLES);
const isSuperAdmin = (user) => has(user, [ROLES.SUPER_ADMIN]);
/** Who may work with payments: administrators and the payment follow-up (finance) role. */
const canManagePayments = (user) => has(user, [...ADMIN_ROLES, ROLES.FINANCE]);
/** Staff accounts have no customer or provider side. */
const isStaff = (user) => has(user, STAFF_ROLES);

module.exports = { ROLES, SELF_REGISTRATION_ROLES, ADMIN_ROLES, STAFF_ROLES, USER_STATUS, isAdmin, isSuperAdmin, canManagePayments, isStaff };
