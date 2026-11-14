import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  adminAudit,
  gamesplanetClick,
  gamesplanetGame,
  gamesplanetPin,
  gamesplanetSetting,
  user,
} from '~~/server/db/schema';
import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

vi.mock('nitropack/runtime', () => ({ useStorage: () => ({}) }));

const ACTOR = 'gp-deals-admin';

async function game(
  uid: string,
  extra: Partial<typeof gamesplanetGame.$inferInsert> = {},
): Promise<void> {
  await db.insert(gamesplanetGame).values({
    uid,
    name: `Game ${uid}`,
    priceCents: 999,
    basePriceCents: 1999,
    url: `https://fr.gamesplanet.com/game/game-${uid}--${uid}`,
    ...extra,
  });
}

async function problemOf(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run;
  } catch (error) {
    return (error as { data?: { problem?: string } }).data?.problem;
  }
  return undefined;
}

beforeEach(async () => {
  await db.delete(adminAudit);
  await db.delete(gamesplanetClick);
  await db.delete(gamesplanetPin);
  await db.delete(gamesplanetGame);
  await db.delete(gamesplanetSetting);
  await db
    .insert(user)
    .values({ id: ACTOR, name: 'Admin', email: `${ACTOR}@epitech.eu`, tenantId: 'epitech' })
    .onConflictDoNothing();
});

describe('listPublic', () => {
  it('shows the best three sellers France can buy, with the ref', async () => {
    await game('1-1', { chartRank: 2 });
    await game('2-1', { chartRank: 1 });
    await game('3-1', { chartRank: 3, availableInFrance: false });
    await game('4-1', { chartRank: 4 });
    await game('5-1', { chartRank: 5 });
    await game('6-1');
    const { deals, siteUrl } = await gamesplanetDealsService.listPublic();
    expect(deals.map((deal) => deal.uid)).toEqual(['2-1', '1-1', '4-1']);
    expect(deals[0]!.url).toBe('https://fr.gamesplanet.com/game/game-2-1--2-1?ref=teknantes');
    expect(siteUrl).toBe('https://fr.gamesplanet.com/?ref=teknantes');
  });

  it('puts pinned games first and does not repeat them', async () => {
    await game('1-1', { chartRank: 1 });
    await game('2-1', { chartRank: 2 });
    await game('3-1', { chartRank: 3 });
    await game('9-1');
    await gamesplanetDealsService.pin({ actorId: ACTOR, uid: '9-1' });
    await gamesplanetDealsService.pin({ actorId: ACTOR, uid: '2-1' });
    const { deals } = await gamesplanetDealsService.listPublic();
    expect(deals.map((deal) => [deal.uid, deal.pinned])).toEqual([
      ['9-1', true],
      ['2-1', true],
      ['1-1', false],
    ]);
  });

  it('uses the ref set by admins', async () => {
    await game('1-1', { chartRank: 1 });
    await gamesplanetDealsService.setRefCode({ actorId: ACTOR, refCode: 'other' });
    const { deals } = await gamesplanetDealsService.listPublic();
    expect(deals[0]!.url).toContain('ref=other');
  });

  it('shows a discount and an end date only for a lower price still running', async () => {
    const now = new Date('2026-11-14T12:00:00Z');
    await game('1-1', { chartRank: 1, flashEndsAt: new Date('2026-11-18T00:00:00Z') });
    await game('2-1', { chartRank: 2, flashEndsAt: new Date('2026-11-10T00:00:00Z') });
    await game('3-1', {
      chartRank: 3,
      priceCents: 1999,
      flashEndsAt: new Date('2026-11-18T00:00:00Z'),
    });
    const { deals } = await gamesplanetDealsService.listPublic(now);
    expect(deals[0]).toMatchObject({ discountPercent: 50, endsAt: '2026-11-18T00:00:00.000Z' });
    expect(deals[1]).toMatchObject({ discountPercent: 50, endsAt: null });
    expect(deals[2]).toMatchObject({ discountPercent: null, endsAt: null });
  });

  it('points covers at our own copies', async () => {
    await game('1-1', { chartRank: 1, teaserKey: `${'a'.repeat(64)}.webp` });
    const { deals } = await gamesplanetDealsService.listPublic();
    expect(deals[0]!.cover).toBe(`/api/gamesplanet/covers/${'a'.repeat(64)}.webp`);
    expect(deals[0]!.packshot).toBeNull();
  });
});

describe('pins', () => {
  it('refuses a fourth pin, an unknown game, a game France cannot buy and a repeat', async () => {
    for (const uid of ['1-1', '2-1', '3-1', '4-1']) await game(uid);
    await game('5-1', { availableInFrance: false });
    for (const uid of ['1-1', '2-1', '3-1'])
      await gamesplanetDealsService.pin({ actorId: ACTOR, uid });
    expect(await problemOf(gamesplanetDealsService.pin({ actorId: ACTOR, uid: '4-1' }))).toBe(
      'tooManyPins',
    );
    await gamesplanetDealsService.unpin({ actorId: ACTOR, uid: '3-1' });
    expect(await problemOf(gamesplanetDealsService.pin({ actorId: ACTOR, uid: '1-1' }))).toBe(
      'alreadyPinned',
    );
    expect(await problemOf(gamesplanetDealsService.pin({ actorId: ACTOR, uid: '0-0' }))).toBe(
      'gameNotFound',
    );
    expect(await problemOf(gamesplanetDealsService.pin({ actorId: ACTOR, uid: '5-1' }))).toBe(
      'notSoldInFrance',
    );
  });

  it('keeps pins in order, moves them and unpins', async () => {
    for (const uid of ['1-1', '2-1', '3-1']) {
      await game(uid);
      await gamesplanetDealsService.pin({ actorId: ACTOR, uid });
    }
    await gamesplanetDealsService.movePin({ uid: '3-1', direction: 'up' });
    await gamesplanetDealsService.movePin({ uid: '1-1', direction: 'up' });
    let view = await gamesplanetDealsService.listAdmin();
    expect(view.pins.map((pin) => pin.uid)).toEqual(['1-1', '3-1', '2-1']);
    await gamesplanetDealsService.movePin({ uid: '2-1', direction: 'down' });
    await gamesplanetDealsService.unpin({ actorId: ACTOR, uid: '1-1' });
    view = await gamesplanetDealsService.listAdmin();
    expect(view.pins.map((pin) => pin.uid)).toEqual(['3-1', '2-1']);
    expect(await problemOf(gamesplanetDealsService.unpin({ actorId: ACTOR, uid: '1-1' }))).toBe(
      'pinNotFound',
    );
  });

  it('drops a pin when its game leaves the catalog, and logs changes', async () => {
    await game('1-1');
    await gamesplanetDealsService.pin({ actorId: ACTOR, uid: '1-1' });
    await db.delete(gamesplanetGame).where(eq(gamesplanetGame.uid, '1-1'));
    expect(await db.select().from(gamesplanetPin)).toHaveLength(0);
    const log = await db.select().from(adminAudit);
    expect(log.map((entry) => entry.action)).toEqual(['gamesplanet.pin']);
  });
});

describe('search', () => {
  it('matches part of a name, best sellers first, and escapes wildcards', async () => {
    await game('1-1', { name: 'Space Quest' });
    await game('2-1', { name: 'Quest of Space', chartRank: 4 });
    await game('3-1', { name: '100% Orange Juice' });
    const found = await gamesplanetDealsService.search('quest');
    expect(found.games.map((entry) => entry.uid)).toEqual(['2-1', '1-1']);
    expect((await gamesplanetDealsService.search('%')).games.map((entry) => entry.uid)).toEqual([
      '3-1',
    ]);
    expect((await gamesplanetDealsService.search('_p')).games).toHaveLength(0);
  });
});

describe('clicks', () => {
  it('redirects to the game with the ref and counts by day, placement and game', async () => {
    await game('1-1');
    const now = new Date('2026-11-14T12:00:00Z');
    const to = 'https://fr.gamesplanet.com/game/game-1-1--1-1?ref=teknantes';
    expect(await gamesplanetDealsService.follow({ uid: '1-1', from: 'home', now })).toBe(to);
    await gamesplanetDealsService.follow({ uid: '1-1', from: 'home', now });
    await gamesplanetDealsService.follow({ uid: '1-1', from: 'event', now });
    expect(await gamesplanetDealsService.follow({ uid: 'site', from: 'footer', now })).toBe(
      'https://fr.gamesplanet.com/?ref=teknantes',
    );
    const rows = await db.select().from(gamesplanetClick);
    expect(rows.map((r) => [r.day, r.placement, r.uid, r.count]).sort()).toEqual([
      ['2026-11-14', 'event', '1-1', 1],
      ['2026-11-14', 'footer', 'site', 1],
      ['2026-11-14', 'home', '1-1', 2],
    ]);
    const { clicks } = await gamesplanetDealsService.listAdmin(now);
    expect(clicks.total).toBe(4);
    expect(clicks.byPlacement.find((r) => r.placement === 'home')?.count).toBe(2);
    expect(clicks.topGames).toEqual([{ uid: '1-1', name: 'Game 1-1', count: 3 }]);
  });

  it('refuses a game that is not in the catalog and counts nothing without a placement', async () => {
    await game('1-1');
    expect(await gamesplanetDealsService.follow({ uid: '0-0', from: 'home' })).toBeNull();
    expect(await gamesplanetDealsService.follow({ uid: '1-1', from: null })).toContain('ref=');
    expect(await db.select().from(gamesplanetClick)).toHaveLength(0);
  });

  it('deletes counts older than about a year', async () => {
    const now = new Date('2026-11-14T12:00:00Z');
    await db.insert(gamesplanetClick).values([
      { day: '2025-01-01', placement: 'home', uid: 'site', count: 3 },
      { day: '2026-11-01', placement: 'home', uid: 'site', count: 3 },
    ]);
    expect(await gamesplanetDealsService.pruneClicks(now)).toBe(1);
    expect(await db.select().from(gamesplanetClick)).toHaveLength(1);
  });
});
