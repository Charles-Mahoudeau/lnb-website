// What an API key can be allowed to do, and how long it lives. The catalog is the source of
// truth for the admin form and for the routes that accept a key. See docs/api-keys.md.

/**
 * The permissions, grouped by feature. A permission only exists for data a visitor can't already
 * read: public pages need no key. Add one here, then require it in a route with `requireAccess`.
 */
export const API_KEY_GROUPS = [
  {
    id: 'events',
    permissions: ['events:read-hidden', 'registrations:read', 'registrations:write'],
  },
  { id: 'links', permissions: ['links:read', 'links:create'] },
  { id: 'minecraft', permissions: ['warden:read'] },
] as const;

export type ApiKeyGroupId = (typeof API_KEY_GROUPS)[number]['id'];
export type ApiKeyPermission = (typeof API_KEY_GROUPS)[number]['permissions'][number];

export const API_KEY_PERMISSIONS = API_KEY_GROUPS.flatMap(
  (group) => group.permissions,
) as unknown as [ApiKeyPermission, ...ApiKeyPermission[]];

export function isApiKeyPermission(value: string): value is ApiKeyPermission {
  return (API_KEY_PERMISSIONS as readonly string[]).includes(value);
}

/** The permission's key in the i18n messages (admin.apiKeys.permissions.*). */
export function permissionMessageKey(permission: ApiKeyPermission): string {
  return permission.replaceAll(/[^a-z]/gi, '_');
}

/** Every key starts with this, so a leaked one is recognised by secret scanners. */
export const API_KEY_PREFIX = 'lnb_';
/** The longest a key lives. */
export const API_KEY_MAX_DAYS = 365;
/** The lifetimes the form offers. The default is the last one. */
export const API_KEY_EXPIRY_CHOICES = [30, 90, 365] as const;
/** How long the old key keeps working after a rotation. The default is the middle one. */
export const API_KEY_OVERLAP_CHOICES = [1, 3, 7] as const;
export const API_KEY_DEFAULT_OVERLAP_DAYS = 3;
/** A key this close to its expiry is flagged. */
export const API_KEY_SOON_DAYS = 30;
/** Keys and call counts are removed this long after the key stopped working. */
export const API_KEY_RETENTION_DAYS = 90;
/** Call counts are kept this long. */
export const API_KEY_USAGE_DAYS = 30;

export const API_KEY_STATUSES = ['active', 'soon', 'rotating', 'expired', 'revoked'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

const DAY_MS = 86_400_000;

/**
 * Where a key stands. Revoked wins, then expired, then rotating out (a newer key replaced it, so
 * it is not flagged as expiring), then expiring soon.
 */
export function apiKeyStatus(
  key: { expiresAt: Date; revokedAt: Date | null; rotatedAt: Date | null },
  now = new Date(),
): ApiKeyStatus {
  if (key.revokedAt) return 'revoked';
  if (key.expiresAt <= now) return 'expired';
  if (key.rotatedAt) return 'rotating';
  if (key.expiresAt.getTime() - now.getTime() <= API_KEY_SOON_DAYS * DAY_MS) return 'soon';
  return 'active';
}

/** A key that can still authenticate. */
export function isApiKeyUsable(status: ApiKeyStatus): boolean {
  return status === 'active' || status === 'soon' || status === 'rotating';
}
