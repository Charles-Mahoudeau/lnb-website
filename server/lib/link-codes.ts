import { randomBytes, randomInt } from 'node:crypto';

import { LINK_CODE_LENGTH } from '../../shared/utils/link-apps';

// No Nuxt imports: server/lib/auth.ts uses these, and the Better Auth CLI loads it.

/** A 6-digit code people type on /link. Better Auth's device codes and Warden's both use it. */
export function generateLinkCode(): string {
  return String(randomInt(10 ** LINK_CODE_LENGTH)).padStart(LINK_CODE_LENGTH, '0');
}

/** The secret half of a device code, which only the app holds. */
export function generateDeviceCode(): string {
  return randomBytes(32).toString('base64url');
}
