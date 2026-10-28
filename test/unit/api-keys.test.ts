import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import { bearerApiKey, generateApiKey, hashApiKey, routeLabel } from '../../server/lib/api-keys.ts';
import { keyedRoutes } from '../../server/lib/openapi.ts';
import { acceptsApiKey, rulesForApiKey, rulesFor } from '../../server/lib/rate-limit-rules.ts';
import {
  API_KEY_GROUPS,
  API_KEY_PERMISSIONS,
  apiKeyStatus,
  isApiKeyUsable,
  permissionMessageKey,
} from '../../shared/api-keys.ts';
import { apiKeyBody } from '../../shared/schemas/api-keys.ts';

const DAY = 86_400_000;
const now = new Date('2026-10-28T12:00:00Z');
const in_ = (days: number) => new Date(now.getTime() + days * DAY);

describe('apiKeyStatus', () => {
  const base = { expiresAt: in_(200), revokedAt: null, rotatedAt: null };

  it('is active well before the expiry, and soon within 30 days of it', () => {
    expect(apiKeyStatus(base, now)).toBe('active');
    expect(apiKeyStatus({ ...base, expiresAt: in_(30) }, now)).toBe('soon');
    expect(apiKeyStatus({ ...base, expiresAt: in_(31) }, now)).toBe('active');
  });

  it('is expired once the expiry has passed', () => {
    expect(apiKeyStatus({ ...base, expiresAt: in_(0) }, now)).toBe('expired');
    expect(apiKeyStatus({ ...base, expiresAt: in_(-3) }, now)).toBe('expired');
  });

  it('shows a replaced key as rotating out, not as expiring soon', () => {
    expect(apiKeyStatus({ ...base, expiresAt: in_(2), rotatedAt: in_(-1) }, now)).toBe('rotating');
    expect(apiKeyStatus({ ...base, expiresAt: in_(-1), rotatedAt: in_(-4) }, now)).toBe('expired');
  });

  it('lets revoked win over everything', () => {
    expect(apiKeyStatus({ ...base, revokedAt: in_(-1) }, now)).toBe('revoked');
    expect(apiKeyStatus({ ...base, revokedAt: in_(-1), expiresAt: in_(-5) }, now)).toBe('revoked');
  });

  it('can authenticate while active, soon or rotating only', () => {
    expect(
      ['active', 'soon', 'rotating', 'expired', 'revoked'].map((s) => isApiKeyUsable(s as never)),
    ).toEqual([true, true, true, false, false]);
  });
});

describe('keys', () => {
  it('makes a prefixed secret of 40 random characters, and keeps only its hash', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.secret).toMatch(/^lnb_[A-Za-z0-9_-]{40}$/);
    expect(a.secret).not.toBe(b.secret);
    expect(a.prefix).toBe(a.secret.slice(0, 8));
    expect(a.hash).toBe(hashApiKey(a.secret));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.secret);
  });

  it('reads a key from a bearer header, and nothing else', () => {
    expect(bearerApiKey('Bearer lnb_abc123')).toBe('lnb_abc123');
    expect(bearerApiKey('bearer   lnb_abc123')).toBe('lnb_abc123');
    // Other bearer credentials (the Minecraft server, Warden devices) are not keys.
    expect(bearerApiKey('Bearer lnbw_device')).toBeNull();
    expect(bearerApiKey('Bearer something')).toBeNull();
    expect(bearerApiKey('Basic lnb_abc')).toBeNull();
    expect(bearerApiKey('Bearer lnb_a b')).toBeNull();
    expect(bearerApiKey(null)).toBeNull();
  });

  it('counts a call under the route, with ids replaced', () => {
    expect(routeLabel('get', '/api/admin/short-links')).toBe('GET /api/admin/short-links');
    expect(
      routeLabel('GET', '/api/admin/events/6f0f5d34-5e0e-49f1-b2d6-6f4a9d1d2c3b/registrations'),
    ).toBe('GET /api/admin/events/:id/registrations');
    expect(
      routeLabel('DELETE', '/api/admin/events/4/registrations/Qk3mZpA9sT1vXyW2bN8cD5eF7gH0jL4m'),
    ).toBe('DELETE /api/admin/events/:id/registrations/:id');
  });
});

describe('the catalog', () => {
  it('has unique permissions, each with a name and a description in both languages', () => {
    expect(new Set(API_KEY_PERMISSIONS).size).toBe(API_KEY_PERMISSIONS.length);
    for (const messages of [en, fr]) {
      const section = messages.admin.apiKeys as {
        permissions: Record<string, { label: string; description: string }>;
        groups: Record<string, { label: string; description: string }>;
      };
      for (const permission of API_KEY_PERMISSIONS) {
        const entry = section.permissions[permissionMessageKey(permission)];
        expect(entry?.label, permission).toBeTruthy();
        expect(entry?.description, permission).toBeTruthy();
      }
      for (const group of API_KEY_GROUPS) expect(section.groups[group.id]?.label).toBeTruthy();
    }
  });

  it('has a route that requires each permission, and no route that requires an unknown one', () => {
    const required = new Set(keyedRoutes().map((route) => route.key));
    expect([...required].sort()).toEqual([...API_KEY_PERMISSIONS].sort());
  });

  it('never lets a key reach the admin area’s dangerous routes', () => {
    const paths = keyedRoutes().map((route) => route.path);
    for (const path of paths) {
      expect(path).not.toMatch(/\/(users|flags|rate-limit|api-keys|roles|bulk)(\/|$)/);
      expect(path).not.toMatch(/bans|appeals|settings/);
    }
  });
});

describe('creating a key', () => {
  const valid = { name: 'BDE website', expiresInDays: 365, permissions: ['links:read'] };

  it('needs a name, a permission and an expiry of at most a year', () => {
    expect(apiKeyBody.safeParse(valid).success).toBe(true);
    expect(apiKeyBody.safeParse({ ...valid, name: '  ' }).success).toBe(false);
    expect(apiKeyBody.safeParse({ ...valid, permissions: [] }).success).toBe(false);
    expect(apiKeyBody.safeParse({ ...valid, permissions: ['users:delete'] }).success).toBe(false);
    expect(apiKeyBody.safeParse({ ...valid, expiresInDays: 366 }).success).toBe(false);
    expect(apiKeyBody.safeParse({ ...valid, expiresInDays: 0 }).success).toBe(false);
  });

  it('drops duplicate permissions', () => {
    const parsed = apiKeyBody.parse({ ...valid, permissions: ['links:read', 'links:read'] });
    expect(parsed.permissions).toEqual(['links:read']);
  });
});

describe('rate limits for keys', () => {
  it('counts a key per key, reads and writes apart', () => {
    expect(rulesForApiKey('normal', 'GET')).toMatchObject([
      { name: 'api-key-read', by: 'key', points: 600 },
    ]);
    expect(rulesForApiKey('event', 'POST')).toMatchObject([
      { name: 'api-key-write', by: 'key', points: 60 },
    ]);
  });

  it('applies nothing when rate limiting is off', () => {
    expect(rulesForApiKey('off', 'POST')).toEqual([]);
  });

  it('leaves Better Auth, the health check and Warden’s own callers to their credentials', () => {
    expect(acceptsApiKey('/api/admin/short-links')).toBe(true);
    for (const path of [
      '/api/auth/get-session',
      '/api/health',
      '/api/warden/server/login',
      '/api/warden/client/me',
      '/go/abc',
      '/events',
    ]) {
      expect(acceptsApiKey(path), path).toBe(false);
    }
  });

  it('puts making and rotating keys under the tight credential limit', () => {
    const names = (m: string, p: string) => rulesFor(m, p).map((rule) => rule.name);
    expect(names('POST', '/api/admin/api-keys')).toEqual(['api', 'write-sensitive']);
    expect(names('POST', '/api/admin/api-keys/7/rotate')).toEqual(['api', 'write-sensitive']);
    expect(names('POST', '/api/admin/api-keys/7/revoke')).toEqual(['api', 'write-sensitive']);
    expect(names('GET', '/api/admin/api-keys')).toEqual(['api']);
  });
});
