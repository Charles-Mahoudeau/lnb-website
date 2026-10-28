import { eq } from 'drizzle-orm';
import type { RequestEvent } from 'nuxt/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { adminAudit, apiKey, apiKeyUsage, featureFlag, user } from '~~/server/db/schema';
import { apiKeyService } from '~~/server/services/api-keys';
import { flagService } from '~~/server/services/flags';
import { requireAccess } from '~~/server/utils/api-key';

import type { ApiKeyPermission } from '#shared/api-keys';

const ADMIN = 'api-key-admin';
const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const DAY = 86_400_000;

beforeAll(async () => {
  await db
    .insert(user)
    .values({ id: ADMIN, name: 'Key Admin', email: 'keys@epitech.eu', tenantId: EPITECH })
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(apiKey);
  await db.delete(featureFlag);
});

async function make(permissions: ApiKeyPermission[] = ['links:read'], expiresInDays = 365) {
  return apiKeyService.create({
    actorId: ADMIN,
    body: { name: 'BDE website', description: 'Shows the agenda', expiresInDays, permissions },
  });
}

/** A request as the guards see it: its headers, URL and method. */
function request(authorization?: string): RequestEvent {
  return {
    req: {
      headers: new Headers(authorization ? { authorization } : {}),
      url: 'http://localhost/api/admin/short-links',
      method: 'GET',
    },
  } as unknown as RequestEvent;
}

const person = { id: 'a-person' } as never;
const asPerson = () => Promise.resolve(person);

describe('api key service', () => {
  it('keeps a hash of the secret, never the secret, and logs the creation', async () => {
    const { key, secret } = await make(['links:read', 'links:create']);
    expect(secret).toMatch(/^lnb_/);
    expect(key).toMatchObject({ name: 'BDE website', status: 'active', calls7d: 0 });
    const [row] = await db.select().from(apiKey).where(eq(apiKey.id, key.id));
    expect(row!.keyHash).not.toContain(secret);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row!.prefix).toBe(secret.slice(0, 8));
    const audit = await db.select().from(adminAudit).where(eq(adminAudit.action, 'apiKey.create'));
    expect(audit.at(-1)?.data).toMatchObject({ id: key.id, name: 'BDE website' });
    expect(JSON.stringify(audit.at(-1))).not.toContain(secret);
  });

  it('authenticates a key with its permissions, and refuses an unknown secret', async () => {
    const { key, secret } = await make(['links:read', 'warden:read']);
    expect(await apiKeyService.authenticate(secret)).toEqual({
      id: key.id,
      name: 'BDE website',
      permissions: ['links:read', 'warden:read'],
    });
    expect(await apiKeyService.authenticate(`${secret}x`)).toBeNull();
    expect(await apiKeyService.authenticate('lnb_nothing')).toBeNull();
  });

  it('stops authenticating once the key has expired', async () => {
    const { key, secret } = await make();
    await db
      .update(apiKey)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiKey.id, key.id));
    expect(await apiKeyService.authenticate(secret)).toBeNull();
    expect((await apiKeyService.detail(key.id)).status).toBe('expired');
  });

  it('revokes a key at once, and logs it', async () => {
    const { key, secret } = await make();
    await apiKeyService.revoke({ actorId: ADMIN, id: key.id });
    expect(await apiKeyService.authenticate(secret)).toBeNull();
    expect((await apiKeyService.detail(key.id)).status).toBe('revoked');
    // Revoking again changes nothing.
    await apiKeyService.revoke({ actorId: ADMIN, id: key.id });
    const audit = await db.select().from(adminAudit).where(eq(adminAudit.action, 'apiKey.revoke'));
    expect(audit.filter((entry) => entry.data.id === key.id)).toHaveLength(1);
  });

  it('rotates: a new key with the same permissions, the old one working until the overlap ends', async () => {
    const old = await make(['links:read', 'links:create'], 90);
    const rotated = await apiKeyService.rotate({
      actorId: ADMIN,
      id: old.key.id,
      body: { overlapDays: 3 },
    });
    expect(rotated.key).toMatchObject({
      name: 'BDE website',
      permissions: ['links:read', 'links:create'],
      status: 'active',
    });
    expect(rotated.secret).not.toBe(old.secret);

    const oldKey = await apiKeyService.detail(old.key.id);
    expect(oldKey.status).toBe('rotating');
    const days = (new Date(oldKey.expiresAt).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
    // Both work during the overlap.
    expect(await apiKeyService.authenticate(old.secret)).not.toBeNull();
    expect(await apiKeyService.authenticate(rotated.secret)).not.toBeNull();

    // The new key lives a year from now, whatever the old one had left.
    const years = (new Date(rotated.key.expiresAt).getTime() - Date.now()) / DAY;
    expect(years).toBeGreaterThan(364);
    expect(years).toBeLessThanOrEqual(365);
  });

  it('never extends an old key that expires before the overlap ends', async () => {
    const old = await make(['links:read'], 1);
    await apiKeyService.rotate({ actorId: ADMIN, id: old.key.id, body: { overlapDays: 7 } });
    const days =
      (new Date((await apiKeyService.detail(old.key.id)).expiresAt).getTime() - Date.now()) / DAY;
    expect(days).toBeLessThan(1.01);
  });

  it('refuses to rotate a revoked, expired or already replaced key', async () => {
    const revoked = await make();
    await apiKeyService.revoke({ actorId: ADMIN, id: revoked.key.id });
    const replaced = await make();
    await apiKeyService.rotate({ actorId: ADMIN, id: replaced.key.id, body: { overlapDays: 1 } });
    for (const id of [revoked.key.id, replaced.key.id]) {
      await expect(
        apiKeyService.rotate({ actorId: ADMIN, id, body: { overlapDays: 1 } }),
      ).rejects.toMatchObject({ status: 409, data: { problem: 'apiKeyNotUsable' } });
    }
    await expect(
      apiKeyService.rotate({
        actorId: ADMIN,
        id: '00000000-0000-4000-8000-000000000000',
        body: { overlapDays: 1 },
      }),
    ).rejects.toMatchObject({ status: 404, data: { problem: 'apiKeyNotFound' } });
  });

  it('counts calls per route and day, and moves the last-used time', async () => {
    const { key } = await make();
    apiKeyService.recordUse(key.id, 'GET /api/admin/short-links');
    apiKeyService.recordUse(key.id, 'GET /api/admin/short-links');
    apiKeyService.recordUse(key.id, 'POST /api/admin/short-links');
    await expect
      .poll(async () => (await apiKeyService.detail(key.id)).calls7d, { timeout: 5000 })
      .toBe(3);
    const detail = await apiKeyService.detail(key.id);
    expect(detail.routes).toEqual([
      { route: 'GET /api/admin/short-links', calls: 2 },
      { route: 'POST /api/admin/short-links', calls: 1 },
    ]);
    expect(detail.lastUsedAt).not.toBeNull();
    expect((await apiKeyService.listAdmin()).keys[0]?.calls7d).toBe(3);
  });

  it('prunes keys that stopped working 90 days ago, and counts older than 30 days', async () => {
    const stale = await make();
    const revoked = await make();
    const fresh = await make();
    await db
      .update(apiKey)
      .set({ expiresAt: new Date(Date.now() - 91 * DAY) })
      .where(eq(apiKey.id, stale.key.id));
    await db
      .update(apiKey)
      .set({ revokedAt: new Date(Date.now() - 91 * DAY) })
      .where(eq(apiKey.id, revoked.key.id));
    await db.insert(apiKeyUsage).values([
      {
        keyId: fresh.key.id,
        day: new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10),
        route: 'GET /a',
        calls: 5,
      },
      {
        keyId: fresh.key.id,
        day: new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10),
        route: 'GET /a',
        calls: 2,
      },
    ]);
    expect(await apiKeyService.prune()).toEqual({ keys: 2, usage: 1 });
    const left = await db.select({ id: apiKey.id }).from(apiKey);
    expect(left.map((row) => row.id)).toEqual([fresh.key.id]);
    expect((await apiKeyService.detail(fresh.key.id)).calls7d).toBe(2);
  });

  it('reports the keys that expire soon, but not those a newer key replaced', async () => {
    await make(['links:read'], 10);
    const replaced = await make(['links:read'], 10);
    await apiKeyService.rotate({ actorId: ADMIN, id: replaced.key.id, body: { overlapDays: 1 } });
    await make(['links:read'], 365);
    expect(await apiKeyService.overview()).toEqual({ usable: 4, soon: 1 });
  });
});

describe('requireAccess', () => {
  it('lets a person in through the route’s own guard when no key is sent', async () => {
    expect(await requireAccess(request(), { permission: 'links:read', user: asPerson })).toEqual({
      kind: 'user',
      user: person,
    });
  });

  it('lets a key in when it holds the permission', async () => {
    const { key, secret } = await make(['links:read']);
    const actor = await requireAccess(request(`Bearer ${secret}`), {
      permission: 'links:read',
      user: asPerson,
    });
    expect(actor).toMatchObject({ kind: 'key', key: { id: key.id } });
  });

  it('refuses a key without the permission with a 403', async () => {
    const { secret } = await make(['links:read']);
    await expect(
      requireAccess(request(`Bearer ${secret}`), { permission: 'links:create', user: asPerson }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an unknown, revoked or expired key with a 401, and never falls back to a person', async () => {
    const { key, secret } = await make();
    await apiKeyService.revoke({ actorId: ADMIN, id: key.id });
    for (const header of [`Bearer ${secret}`, 'Bearer lnb_unknown']) {
      await expect(
        requireAccess(request(header), { permission: 'links:read', user: asPerson }),
      ).rejects.toMatchObject({ status: 401 });
    }
  });

  it('answers 503 while the apiKeys flag is off, and works again when it is on', async () => {
    const { secret } = await make();
    // `set` also clears the flag cache, which would otherwise hold the old state for 10 seconds.
    await flagService.set({ actorId: ADMIN, key: 'apiKeys', enabled: false });
    await expect(
      requireAccess(request(`Bearer ${secret}`), { permission: 'links:read', user: asPerson }),
    ).rejects.toMatchObject({ status: 503, data: { problem: 'disabled', flag: 'apiKeys' } });
    await flagService.set({ actorId: ADMIN, key: 'apiKeys', enabled: true });
    await expect(
      requireAccess(request(`Bearer ${secret}`), { permission: 'links:read', user: asPerson }),
    ).resolves.toMatchObject({ kind: 'key' });
  });
});
