import { describe, expect, it } from 'vitest';

import { rulesFor, rulesForMode } from '../../server/lib/rate-limit-rules.ts';
import { createLimiter } from '../../server/lib/rate-limit.ts';

const names = (method: string, path: string) => rulesFor(method, path).map((rule) => rule.name);

describe('createLimiter', () => {
  it('allows the points per window, per key, then says when to retry', async () => {
    const consume = createLimiter(2, 60);
    expect((await consume('a')).allowed).toBe(true);
    expect((await consume('a')).allowed).toBe(true);
    const refused = await consume('a');
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect((await consume('b')).allowed).toBe(true);
  });
});

describe('rulesFor', () => {
  it('leaves Better Auth, the health check and pages alone', () => {
    expect(names('POST', '/api/auth/sign-in/social')).toEqual([]);
    expect(names('GET', '/api/health')).toEqual([]);
    expect(names('GET', '/events')).toEqual([]);
  });

  it('limits reads by IP only', () => {
    expect(rulesFor('GET', '/api/events')).toMatchObject([{ name: 'api', by: 'ip' }]);
  });

  it('adds a per-account limit to writes, tighter for sensitive and heavy ones', () => {
    expect(names('POST', '/api/events/3/registration')).toEqual(['api', 'write']);
    expect(names('PATCH', '/api/admin/flags/x')).toEqual(['api', 'write-admin']);
    expect(names('POST', '/api/link/approve')).toEqual(['api', 'write-sensitive']);
    expect(names('POST', '/api/warden/me/token')).toEqual(['api', 'write-sensitive']);
    expect(names('POST', '/api/admin/events/images')).toEqual(['api', 'write-heavy']);
    expect(names('POST', '/api/admin/users/bulk')).toEqual(['api', 'write-heavy']);
  });

  it('gives the short links and the Minecraft server their own ceiling', () => {
    expect(names('GET', '/go/lan')).toEqual(['go']);
    expect(names('POST', '/api/warden/server/sessions/heartbeat')).toEqual(['warden-server']);
    expect(names('PUT', '/api/warden/client/presence')).toEqual(['warden-client']);
    expect(names('POST', '/api/warden/client/link-requests')).toEqual([
      'warden-client',
      'warden-link-request',
    ]);
  });
});

describe('rulesForMode', () => {
  it('keeps the table as is in normal mode', () => {
    expect(rulesForMode('normal', 'POST', '/api/events')).toEqual(rulesFor('POST', '/api/events'));
  });

  it('applies no rule when off', () => {
    expect(rulesForMode('off', 'POST', '/api/events')).toEqual([]);
    expect(rulesForMode('off', 'GET', '/go/abc')).toEqual([]);
  });

  it('multiplies the per-IP ceilings in event mode and leaves per-account limits', () => {
    const [ip, account] = rulesForMode('event', 'POST', '/api/events');
    expect(ip).toMatchObject({ name: 'api:event', points: 15000, by: 'ip' });
    expect(account).toMatchObject({ name: 'write', points: 60, by: 'user' });
  });

  it('does not loosen the link request limit', () => {
    const rules = rulesForMode('event', 'POST', '/api/warden/client/link-requests');
    expect(rules.find((rule) => rule.name === 'warden-link-request')?.points).toBe(30);
  });
});
