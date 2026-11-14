import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  event,
  eventRoom,
  eventType,
  featureFlag,
  gamesplanetGame,
  gamesplanetPin,
} from '~~/server/db/schema';
import { eventAdminService } from '~~/server/services/events/admin';
import { eventPublicService } from '~~/server/services/events/public';
import { gamesplanetService } from '~~/server/services/gamesplanet';
import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));
vi.mock('nitropack/runtime', () => ({ useStorage: () => ({}) }));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const viewer = { userId: null, tenantId: null, canSeeDrafts: false };
let roomId: string;
let typeId: string;

beforeAll(async () => {
  const [room] = await db.insert(eventRoom).values({ name: 'Game room' }).returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Game night', nameFr: 'Soirée jeu', icon: 'i-lucide-gamepad-2' })
    .returning();
  roomId = room!.id;
  typeId = type!.id;
});

afterAll(async () => {
  await db.delete(featureFlag);
});

beforeEach(async () => {
  await db.delete(featureFlag);
  await db.delete(gamesplanetPin);
  await db.delete(gamesplanetGame);
  await db.insert(gamesplanetGame).values({
    uid: '77-1',
    name: 'Party Game',
    priceCents: 500,
    basePriceCents: 1000,
    steamId: '12345',
    url: 'https://fr.gamesplanet.com/game/party-game-steam-key--77-1',
  });
});

async function newEvent(patch: Partial<typeof event.$inferInsert> = {}) {
  const [row] = await db
    .insert(event)
    .values({
      name: 'Game night',
      description: 'Bring friends.',
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000),
      hidden: false,
      gamesplanetUid: '77-1',
      ...patch,
    })
    .returning();
  return row!;
}

describe('event page deal', () => {
  it('shows the game with the ref while the event is not over', async () => {
    const e = await newEvent();
    const view = await eventPublicService.get(e.id, viewer);
    expect(view.gamesplanet).toMatchObject({
      uid: '77-1',
      name: 'Party Game',
      discountPercent: 50,
    });
    expect(view.gamesplanet?.url).toContain('ref=teknantes');
  });

  it('hides it after the event, when cancelled, without a game or with a flag off', async () => {
    const over = await newEvent({
      startsAt: new Date(Date.now() - 2 * 86_400_000),
      endsAt: new Date(Date.now() - 86_400_000),
    });
    expect((await eventPublicService.get(over.id, viewer)).gamesplanet).toBeNull();
    const cancelled = await newEvent({ cancelledAt: new Date() });
    expect((await eventPublicService.get(cancelled.id, viewer)).gamesplanet).toBeNull();
    const none = await newEvent({ gamesplanetUid: null });
    expect((await eventPublicService.get(none.id, viewer)).gamesplanet).toBeNull();
    const gone = await newEvent({ gamesplanetUid: '0-0' });
    expect((await eventPublicService.get(gone.id, viewer)).gamesplanet).toBeNull();
    const shown = await newEvent();
    await db.insert(featureFlag).values({ key: 'gamesplanet.events', enabled: false });
    // The flags are cached for ten seconds.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 11_000 });
    expect((await eventPublicService.get(shown.id, viewer)).gamesplanet).toBeNull();
    vi.useRealTimers();
  });
});

describe('choosing the game', () => {
  it('finds a game by name, by Gamesplanet link and by Steam link', async () => {
    const byName = await gamesplanetDealsService.search('party');
    expect(byName.games.map((g) => g.uid)).toEqual(['77-1']);
    const byLink = await gamesplanetDealsService.search(
      'https://fr.gamesplanet.com/game/party-game-steam-key--77-1?ref=x',
    );
    expect(byLink.games.map((g) => g.uid)).toEqual(['77-1']);
    const bySteam = await gamesplanetDealsService.search(
      'https://store.steampowered.com/app/12345/Party_Game/',
    );
    expect(bySteam.games.map((g) => g.uid)).toEqual(['77-1']);
    expect((await gamesplanetDealsService.search('https://example.com/x')).games).toEqual([]);
  });

  it('refuses an unknown game when saving an event, and keeps the covers of event games', async () => {
    const e = await newEvent({ gamesplanetUid: null });
    const admin = await eventAdminService.get(e.id);
    const body = {
      name: admin.name,
      description: admin.description,
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: admin.startsAt,
      endsAt: admin.endsAt,
      capacity: null,
      teamMode: false,
      teamMin: null,
      teamMax: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      price: null,
      hidden: false,
      reminderOffsets: [60],
      bdeSync: false,
      banner: null,
      embed: null,
    };
    await expect(
      eventAdminService.update({
        actorId: 'nobody',
        id: e.id,
        body: { ...body, gamesplanetUid: '0-0' },
      }),
    ).rejects.toMatchObject({ data: { problem: 'gamesplanetGameNotFound' } });
    await db.update(event).set({ gamesplanetUid: '77-1' }).where(eq(event.id, e.id));
    expect(await gamesplanetService.coverUids()).toContain('77-1');
  });
});
