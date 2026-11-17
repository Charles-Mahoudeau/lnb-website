import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventRoom,
  eventType,
  minecraftAccount,
  playtimeClosure,
  playtimeSettings,
  user,
} from '~~/server/db/schema';
import { eventAdminService } from '~~/server/services/events/admin';
import { playtimeContextService } from '~~/server/services/playtime/context';
import { playtimeSettingsService } from '~~/server/services/playtime/settings';

import type { EventBody } from '#shared/schemas/events';
import { parisInstant } from '#shared/utils/paris-time';

// The events service refuses with Nuxt's createError and reads Nitro storage, which Node can't load.
vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NOW = parisInstant('2031-09-10', 10 * 60);

let counter = 0;
async function player() {
  const id = `evmode-${String(++counter)}-${String(Date.now())}`;
  await db
    .insert(user)
    .values({ id, name: 'Event Player', email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({
    uuid: crypto.randomUUID(),
    userId: id,
    username: `E${String(counter)}x${String(Date.now() % 10000)}`,
  });
  return id;
}

async function body(over: Partial<EventBody> = {}): Promise<EventBody> {
  let [room] = await db.select({ id: eventRoom.id }).from(eventRoom).limit(1);
  room ??= (
    await db
      .insert(eventRoom)
      .values({ name: `Room ${String(Date.now())}` })
      .returning({ id: eventRoom.id })
  )[0]!;
  let [type] = await db.select({ id: eventType.id }).from(eventType).limit(1);
  type ??= (
    await db
      .insert(eventType)
      .values({ nameEn: `T${String(Date.now())}`, nameFr: 'T', icon: 'i-lucide-swords' })
      .returning({ id: eventType.id })
  )[0]!;
  return {
    name: 'LAN night',
    description: 'A night of games.',
    roomId: room.id,
    typeId: type.id,
    schools: [EPITECH],
    startsAt: new Date(parisInstant('2031-09-10', 18 * 60)).toISOString(),
    endsAt: new Date(parisInstant('2031-09-11', 2 * 60)).toISOString(),
    capacity: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    price: null,
    hidden: false,
    bdeSync: false,
    ...over,
  };
}

async function closureOf(eventId: string) {
  const [row] = await db.select().from(playtimeClosure).where(eq(playtimeClosure.eventId, eventId));
  return row;
}

beforeEach(async () => {
  await db.update(playtimeSettings).set({ mode: 'observe' }).where(eq(playtimeSettings.id, 1));
  playtimeSettingsService.clearCache();
});

describe('event mode', () => {
  it('makes a closure for the event days, moves it with the event, and drops it when switched off', async () => {
    const actorId = await player();
    const { id } = await eventAdminService.create({
      actorId,
      body: await body({ playtimeFree: 'everyone' }),
    });
    expect(await closureOf(id)).toMatchObject({
      label: 'LAN night',
      startsOn: '2031-09-10',
      endsOn: '2031-09-11',
      tenantIds: null,
      eventScope: 'everyone',
    });
    expect((await eventAdminService.get(id)).playtimeFree).toBe('everyone');

    await eventAdminService.update({
      actorId,
      id,
      body: await body({
        name: 'LAN night 2',
        startsAt: new Date(parisInstant('2031-09-12', 18 * 60)).toISOString(),
        endsAt: new Date(parisInstant('2031-09-12', 23 * 60)).toISOString(),
        playtimeFree: 'registered',
      }),
    });
    expect(await closureOf(id)).toMatchObject({
      label: 'LAN night 2',
      startsOn: '2031-09-12',
      endsOn: '2031-09-12',
      eventScope: 'registered',
    });

    await eventAdminService.update({ actorId, id, body: await body({ playtimeFree: null }) });
    expect(await closureOf(id)).toBeUndefined();
    await db.delete(event).where(eq(event.id, id));
  });

  it('frees registered players, not the waitlist or others, and only once published', async () => {
    const actorId = await player();
    const registered = await player();
    const waiting = await player();
    const other = await player();
    const { id } = await eventAdminService.create({
      actorId,
      body: await body({ playtimeFree: 'registered', hidden: true, capacity: 1 }),
    });
    await db.insert(eventRegistration).values([
      { eventId: id, userId: registered, status: 'registered' },
      { eventId: id, userId: waiting, status: 'waitlist' },
    ]);
    const days = async (userId: string) =>
      (await playtimeContextService.load(db, userId, NOW))?.closures.length;

    // A draft: the closure exists, but doesn't apply.
    expect(await closureOf(id)).toBeDefined();
    expect(await days(registered)).toBe(0);

    await eventAdminService.update({
      actorId,
      id,
      body: await body({ playtimeFree: 'registered', hidden: false, capacity: 1 }),
    });
    expect(await days(registered)).toBe(1);
    expect(await days(waiting)).toBe(0);
    expect(await days(other)).toBe(0);

    // Everyone, once switched.
    await eventAdminService.update({
      actorId,
      id,
      body: await body({ playtimeFree: 'everyone', capacity: 1 }),
    });
    expect(await days(other)).toBe(1);

    await eventAdminService.cancel({ actorId, id });
    expect(await closureOf(id)).toBeUndefined();
    expect(await days(registered)).toBe(0);
    await db.delete(event).where(eq(event.id, id));
  });

  it('copies the setting to a duplicate, on its new days', async () => {
    const actorId = await player();
    const { id } = await eventAdminService.create({
      actorId,
      body: await body({ playtimeFree: 'registered' }),
    });
    const copy = await eventAdminService.duplicate({
      actorId,
      id,
      body: {
        startsAt: new Date(parisInstant('2031-10-01', 18 * 60)).toISOString(),
        endsAt: new Date(parisInstant('2031-10-01', 22 * 60)).toISOString(),
      },
    });
    expect(await closureOf(copy.id)).toMatchObject({
      startsOn: '2031-10-01',
      endsOn: '2031-10-01',
      eventScope: 'registered',
    });
    await db.delete(event).where(eq(event.id, id));
    // Deleting an event takes its closure with it.
    await db.delete(event).where(eq(event.id, copy.id));
    expect(await closureOf(copy.id)).toBeUndefined();
  });
});
