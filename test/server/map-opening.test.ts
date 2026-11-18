import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { mapSetting, user } from '~~/server/db/schema';
import { mapService } from '~~/server/services/map';

import { DEFAULT_MAP_URL } from '#shared/schemas/map';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'map-opening-test-admin';
const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

beforeEach(async () => {
  await db.delete(mapSetting);
  await db
    .insert(user)
    .values({
      id: ADMIN,
      name: 'Admin',
      email: 'map-opening@example.test',
      emailVerified: true,
      tenantId: EPITECH,
    })
    .onConflictDoNothing();
});
afterAll(async () => {
  await db.delete(mapSetting);
  await db.delete(user).where(eq(user.id, ADMIN));
});

const update = (body: Parameters<typeof mapService.update>[0]['body']) =>
  mapService.update({ actorId: ADMIN, body });

describe('the map opening', () => {
  it('is open until an admin says otherwise', async () => {
    expect(await mapService.getPublic()).toEqual({
      url: DEFAULT_MAP_URL,
      locked: false,
      opensAt: null,
      lockedAt: null,
    });
  });

  it('hides the address from visitors until the date, and shows it to admins', async () => {
    await update({ mode: 'date', opensAt: FUTURE });
    const visitor = await mapService.getPublic();
    expect(visitor.url).toBeNull();
    expect(visitor.locked).toBe(true);
    expect(visitor.opensAt).toBe(FUTURE);
    expect(visitor.lockedAt).not.toBeNull();
    expect((await mapService.getPublic({ admin: true })).url).toBe(DEFAULT_MAP_URL);
  });

  it('asks nothing of the map while it is closed to the visitor', async () => {
    await update({ mode: 'closed' });
    expect(await mapService.getStatus()).toEqual({ ok: false, status: null });
  });

  it('opens by itself once the date has passed', async () => {
    await update({ mode: 'date', opensAt: PAST });
    const view = await mapService.getPublic();
    expect(view.locked).toBe(false);
    expect(view.url).toBe(DEFAULT_MAP_URL);
  });

  it('keeps when it was closed while it stays closed, and forgets it once open', async () => {
    const first = await update({ mode: 'closed' });
    const second = await update({ mode: 'date', opensAt: FUTURE });
    expect(second.lockedAt).toBe(first.lockedAt);
    const open = await update({ mode: 'open' });
    expect(open.lockedAt).toBeNull();
    expect(open.opensAt).toBeNull();
  });

  it('leaves the opening alone when only the address changes', async () => {
    await update({ mode: 'date', opensAt: FUTURE });
    const saved = await update({ url: 'https://map.example.com/' });
    expect(saved.mode).toBe('date');
    expect(saved.opensAt).toBe(FUTURE);
  });
});
