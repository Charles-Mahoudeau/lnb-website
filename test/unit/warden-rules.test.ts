import { describe, expect, it } from 'vitest';

import {
  isBanActive,
  generateServerToken,
  resolveMaxAccounts,
  isOnline,
  SESSION_TIMEOUT_MS,
  shortName,
} from '../../server/services/warden/rules.ts';
import { isServerToken } from '../../shared/schemas/warden.ts';

describe('server tokens', () => {
  it('are 26 lowercase base32 characters, a valid DNS label', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateServerToken();
      expect(token).toMatch(/^[a-z2-7]{26}$/);
      expect(isServerToken(token)).toBe(true);
    }
    expect(isServerToken('Not-A-Token')).toBe(false);
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
