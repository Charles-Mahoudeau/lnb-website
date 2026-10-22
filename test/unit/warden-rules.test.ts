import { describe, expect, it } from 'vitest';

import {
  isBanActive,
  generateDeviceToken,
  hashSecret,
  shouldTouchDevice,
  resolveMaxAccounts,
  isOnline,
  SESSION_TIMEOUT_MS,
  shortName,
} from '../../server/services/warden/rules.ts';

describe('device tokens', () => {
  it('are lnbw_ and 32 random bytes in base64url', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateDeviceToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^lnbw_[\w-]{43}$/);
  });

  it('hash to a SHA-256 hex string that differs per secret', () => {
    expect(hashSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashSecret('abd')).not.toBe(hashSecret('abc'));
  });

  it('are written to the database at most once an hour', () => {
    const now = Date.now();
    expect(shouldTouchDevice(new Date(now - 59 * 60_000), now)).toBe(false);
    expect(shouldTouchDevice(new Date(now - 60 * 60_000), now)).toBe(true);
  });
});

describe('resolveMaxAccounts', () => {
  it("prefers the player's own limit", () => {
    expect(resolveMaxAccounts(3, 1)).toBe(3);
    expect(resolveMaxAccounts(0, 1)).toBe(0);
    expect(resolveMaxAccounts(null, 1)).toBe(1);
  });
});

describe('isBanActive', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('is active until revoked or expired', () => {
    expect(isBanActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isBanActive({ revokedAt: null, expiresAt: new Date('2026-10-16') }, now)).toBe(true);
    expect(isBanActive({ revokedAt: null, expiresAt: new Date('2026-10-14') }, now)).toBe(false);
    expect(isBanActive({ revokedAt: new Date('2026-10-15'), expiresAt: null }, now)).toBe(false);
  });
});

describe('sessions', () => {
  it('count as online while open with a recent heartbeat', () => {
    const now = Date.now();
    expect(isOnline({ endedAt: null, lastHeartbeatAt: new Date(now - 1000) }, now)).toBe(true);
    expect(
      isOnline({ endedAt: null, lastHeartbeatAt: new Date(now - SESSION_TIMEOUT_MS - 1) }, now),
    ).toBe(false);
    expect(isOnline({ endedAt: new Date(now), lastHeartbeatAt: new Date(now) }, now)).toBe(false);
  });

  it('shorten names for in-game display', () => {
    expect(shortName('Charles Mahoudeau')).toBe('Charles M.');
    expect(shortName('Jean Paul de la Tour')).toBe('Jean T.');
    expect(shortName('Cher')).toBe('Cher');
  });
});
