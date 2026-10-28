import { createHash, randomBytes } from 'node:crypto';

import { API_KEY_PREFIX } from '../../shared/api-keys.ts';

// Making, reading and hashing API keys. No Nuxt imports, so unit tests can load it.

/** A new key: the prefix and 40 random characters (240 bits). Shown once, then only hashed. */
export function generateApiKey(): { secret: string; prefix: string; hash: string } {
  const secret = `${API_KEY_PREFIX}${randomBytes(30).toString('base64url')}`;
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX.length + 4), hash: hashApiKey(secret) };
}

/** SHA-256 is enough: the secret is random, so there is nothing to brute-force. */
export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** The key in an `Authorization: Bearer lnb_…` header, or null when it carries none. */
export function bearerApiKey(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  const token = match?.[1];
  return token?.startsWith(API_KEY_PREFIX) ? token : null;
}

/**
 * The route a call is counted under: `GET /api/admin/short-links/:id`. Segments that look like
 * an id (long, or all digits) are replaced, so the counters stay few.
 */
export function routeLabel(method: string, path: string): string {
  const generic = path
    .split('/')
    .map((segment) => (segment.length >= 20 || /^\d+$/.test(segment) ? ':id' : segment))
    .join('/');
  return `${method.toUpperCase()} ${generic}`.slice(0, 200);
}
