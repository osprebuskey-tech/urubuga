import { ROLES } from './constants';

/** A super administrator can do everything an administrator can, exactly as the API treats them. */
export function effectiveRoles(roles = []) {
  return roles.includes(ROLES.SUPER_ADMIN) && !roles.includes(ROLES.ADMIN) ? [...roles, ROLES.ADMIN] : roles;
}

export const userHasRole = (user, ...wanted) => effectiveRoles(user?.roles).some((r) => wanted.includes(r));
