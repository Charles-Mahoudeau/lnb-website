import { randomBytes } from 'node:crypto';

// Warden's pure rules, without database or Nuxt imports, so plain unit tests can load them.

/** Length of the label in <token>.mc.bde-teknantes.fr. Mirrors SERVER_TOKEN_LENGTH in shared/schemas/warden.ts. */
const TOKEN_LENGTH = 26;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 26 characters of lowercase base32 (130 bits), so it's a valid DNS label. */
export function generateServerToken(): string {
  return Array.from(randomBytes(TOKEN_LENGTH), (byte) => BASE32[byte & 31]).join('');
}

/** A player's own limit wins over the global one. */
export function resolveMaxAccounts(override: number | null | undefined, global: number): number {
  return override ?? global;
}

/** A ban is active until it's revoked or it expires. Null expiry means permanent. */
export function isBanActive(
  ban: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
): boolean {
  return ban.revokedAt === null && (ban.expiresAt === null || ban.expiresAt > now);
}

/** Sessions with no heartbeat for this long are closed at their last heartbeat. */
export const SESSION_TIMEOUT_MS = 3 * 60 * 1000;

/** Whether a session counts as online: open, with a recent heartbeat. */
export function isOnline(
  session: { endedAt: Date | null; lastHeartbeatAt: Date },
  now = Date.now(),
): boolean {
  return session.endedAt === null && now - session.lastHeartbeatAt.getTime() < SESSION_TIMEOUT_MS;
}

/** "Charles Mahoudeau" becomes "Charles M.", for players who show their name in-game. */
export function shortName(name: string): string {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}
