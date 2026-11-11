import { eq, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { partnerEvent, partnerEventGame, partnerEventInterest, user } from '~~/server/db/schema';
import { partnerEventService } from '~~/server/services/partner-events';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const SEEDED = 'arena-league-university-2027';
const ALICE = 'partner-event-alice';
const BOB = 'partner-event-bob';

async function problemOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { data?: { problem?: unknown } }).data?.problem;
  }
  return undefined;
}

/** A throwaway event with one game, for the tests that change the event itself. */
async function makeEvent(slug: string, values: Partial<typeof partnerEvent.$inferInsert> = {}) {
  const [row] = await db
    .insert(partnerEvent)
    .values({ slug, ...values })
    .returning();
  await db
    .insert(partnerEventGame)
    .values({ partnerEventId: row!.id, key: 'lol', status: 'confirmed', starters: 5, position: 0 });
  return row!;
}

beforeAll(async () => {
  await db
    .insert(user)
    .values([
      { id: ALICE, name: 'Alice', email: 'alice.pe@epitech.eu', tenantId: EPITECH },
      { id: BOB, name: 'Bob', email: 'bob.pe@epitech.eu', tenantId: EPITECH },
    ])
    .onConflictDoNothing();
});

describe('the seeded Arena League event', () => {
  it('has its four games, two of them confirmed', async () => {
    const view = await partnerEventService.view(SEEDED, null);
    expect(view.games.map((game) => [game.key, game.status, game.starters])).toEqual([
      ['lol', 'confirmed', 5],
      ['valorant', 'confirmed', 5],
      ['rocket-league', 'study', 3],
      ['cs2', 'study', 5],
    ]);
    expect(view.websiteUrl).toBe('https://arenaleague.tv');
    expect(view.discordUrl).toBe('https://discord.gg/wjv9NN7DGg');
    expect(view.mine).toBeNull();
    expect(view.interestOpen).toBe(true);
    expect(view.dateConfirmed).toBe(false);
  });

  it('answers 404 for an unknown slug', async () => {
    expect(await problemOf(partnerEventService.view('nope', null))).toBe('partnerEventNotFound');
  });
});

describe('saving interest', () => {
  it('adds games, counts them and returns the student’s own', async () => {
    const view = await partnerEventService.saveInterest({
      userId: ALICE,
      slug: SEEDED,
      body: {
        consent: true,
        games: [{ game: 'lol', inGameName: 'Alice#EUW', rank: 'Gold II' }, { game: 'cs2' }],
      },
    });
    expect(view.mine).toEqual([
      { game: 'lol', inGameName: 'Alice#EUW', rank: 'Gold II', hidden: false },
      { game: 'cs2', inGameName: '', rank: '', hidden: false },
    ]);
    const count = (key: string) => view.games.find((game) => game.key === key)!.interested;
    expect(count('lol')).toBeGreaterThanOrEqual(1);
    expect(count('cs2')).toBeGreaterThanOrEqual(1);
    // A student in two games is one student.
    const sum = view.games.reduce((total, game) => total + game.interested, 0);
    expect(view.students).toBeGreaterThanOrEqual(1);
    expect(view.students).toBeLessThan(sum);
    // Visitors and other students don't see it in `mine`.
    expect((await partnerEventService.view(SEEDED, null)).mine).toBeNull();
    expect((await partnerEventService.view(SEEDED, BOB)).mine).toEqual([]);
  });

  it('replaces the set: games left out are withdrawn, kept ones are updated', async () => {
    const before = (await partnerEventService.view(SEEDED, null)).games.find(
      (game) => game.key === 'cs2',
    )!.interested;
    const view = await partnerEventService.saveInterest({
      userId: ALICE,
      slug: SEEDED,
      body: { consent: true, games: [{ game: 'lol', inGameName: 'Alice#NTS', rank: 'Gold I' }] },
    });
    expect(view.mine).toEqual([
      { game: 'lol', inGameName: 'Alice#NTS', rank: 'Gold I', hidden: false },
    ]);
    expect(view.games.find((game) => game.key === 'cs2')!.interested).toBe(before - 1);
  });

  it('keeps one row per student and game, and the first consent date', async () => {
    const rows = await db
      .select()
      .from(partnerEventInterest)
      .where(eq(partnerEventInterest.userId, ALICE));
    expect(rows).toHaveLength(1);
    const first = rows[0]!.consentedAt;
    await partnerEventService.saveInterest({
      userId: ALICE,
      slug: SEEDED,
      body: { consent: true, games: [{ game: 'lol', rank: 'Platinum IV' }] },
    });
    const [after] = await db
      .select()
      .from(partnerEventInterest)
      .where(eq(partnerEventInterest.userId, ALICE));
    expect(after!.rank).toBe('Platinum IV');
    expect(after!.consentedAt).toEqual(first);
  });

  it('needs the consent to save', async () => {
    expect(
      await problemOf(
        partnerEventService.saveInterest({
          userId: BOB,
          slug: SEEDED,
          body: { consent: false, games: [{ game: 'lol' }] },
        }),
      ),
    ).toBe('consentRequired');
    expect((await partnerEventService.view(SEEDED, BOB)).mine).toEqual([]);
  });

  it('withdraws everything with an empty list, without consent', async () => {
    const view = await partnerEventService.saveInterest({
      userId: ALICE,
      slug: SEEDED,
      body: { consent: false, games: [] },
    });
    expect(view.mine).toEqual([]);
  });

  it('refuses a game the event doesn’t have', async () => {
    const event = await makeEvent('single-game-event');
    expect(
      await problemOf(
        partnerEventService.saveInterest({
          userId: ALICE,
          slug: event.slug,
          body: { consent: true, games: [{ game: 'valorant' }] },
        }),
      ),
    ).toBe('partnerEventNotFound');
  });

  it('is paused by the event’s switch, but withdrawing stays possible', async () => {
    const event = await makeEvent('paused-event');
    await partnerEventService.saveInterest({
      userId: ALICE,
      slug: event.slug,
      body: { consent: true, games: [{ game: 'lol' }] },
    });
    await db.update(partnerEvent).set({ interestOpen: false }).where(eq(partnerEvent.id, event.id));

    const paused = await partnerEventService.view(event.slug, ALICE);
    expect(paused.interestOpen).toBe(false);
    expect(
      await problemOf(
        partnerEventService.saveInterest({
          userId: BOB,
          slug: event.slug,
          body: { consent: true, games: [{ game: 'lol' }] },
        }),
      ),
    ).toBe('interestClosed');
    const withdrawn = await partnerEventService.saveInterest({
      userId: ALICE,
      slug: event.slug,
      body: { consent: false, games: [] },
    });
    expect(withdrawn.mine).toEqual([]);
  });

  it('is read-only once the event is closed', async () => {
    const event = await makeEvent('closed-event', { closedAt: new Date() });
    const view = await partnerEventService.view(event.slug, null);
    expect(view.closedAt).not.toBeNull();
    expect(view.interestOpen).toBe(false);
    expect(view.teamsOpen).toBe(false);
    for (const body of [
      { consent: true, games: [{ game: 'lol' as const }] },
      { consent: false, games: [] },
    ]) {
      expect(
        await problemOf(partnerEventService.saveInterest({ userId: BOB, slug: event.slug, body })),
      ).toBe('partnerEventClosed');
    }
  });

  it('is removed with the account', async () => {
    await partnerEventService.saveInterest({
      userId: BOB,
      slug: SEEDED,
      body: { consent: true, games: [{ game: 'valorant' }] },
    });
    await db.delete(user).where(inArray(user.id, [BOB]));
    const rows = await db
      .select()
      .from(partnerEventInterest)
      .where(eq(partnerEventInterest.userId, BOB));
    expect(rows).toHaveLength(0);
  });
});
