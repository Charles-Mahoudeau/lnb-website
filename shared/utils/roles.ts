// Roles are Better Auth admin plugin roles (server/lib/auth.ts). A user's `role` is a
// comma-separated list, such as "admin,warden-admin".

/** Site admins: everything, including Warden. */
export const ADMIN_ROLE = 'admin';
/** Minecraft staff: the Warden admin panel and in-game moderation, nothing else on the site. */
export const WARDEN_ADMIN_ROLE = 'warden-admin';

export function parseRoles(role: string | null | undefined): string[] {
  return (role ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function hasRole(role: string | null | undefined, name: string): boolean {
  return parseRoles(role).includes(name);
}

export function isAdmin(role: string | null | undefined): boolean {
  return hasRole(role, ADMIN_ROLE);
}

/** Site admins are Warden admins too. */
export function isWardenAdmin(role: string | null | undefined): boolean {
  return isAdmin(role) || hasRole(role, WARDEN_ADMIN_ROLE);
}

/** The role list with `name` added or removed, or null for a plain user. */
export function withRole(
  role: string | null | undefined,
  name: string,
  on: boolean,
): string | null {
  const roles = parseRoles(role).filter((r) => r !== name && r !== 'user');
  if (on) roles.push(name);
  return roles.length ? roles.join(',') : null;
}
