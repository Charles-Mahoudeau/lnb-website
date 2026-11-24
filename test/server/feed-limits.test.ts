import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { feedLikeService } from '~~/server/services/feed/likes';
import { feedPostService } from '~~/server/services/feed/posts';

import { person, post, problemOf, reply, server, setFlags, site, wipe } from './feed-helpers';
import type { Person } from './feed-helpers';

// The per-account limits of docs/feed.md ("Rate limits") at their boundaries: 3 main posts a
// minute and 15 an hour, 6 replies a minute and 60 an hour, 60 likes and unlikes a minute,
// counted per LNB account across its Minecraft accounts and the browser. The limiter reads
// Date.now(), which these tests move forward.

let now = Date.now();

function advance(seconds: number) {
  now += seconds * 1000;
}

async function outcome(promise: Promise<unknown>) {
  const refused = await problemOf(promise);
  return refused ? `${String(refused.status)} ${String(refused.problem)}` : 'ok';
}

async function retryAfter(promise: Promise<unknown>): Promise<number> {
  const refused = await problemOf(promise);
  expect(refused).toMatchObject({ status: 429, problem: 'rateLimited' });
  return refused!.retryAfter as number;
}

describe('Feed rate limits', () => {
  beforeEach(async () => {
    await wipe();
    setFlags();
    now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.mocked(Date.now).mockRestore();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  it('takes 3 main posts a minute, the fourth waits for the minute to end', async () => {
    const camille = await person('Camille Roux');
    for (let i = 0; i < 3; i++) expect(await outcome(post(camille, `P${String(i)}`))).toBe('ok');
    advance(30);
    const wait = await retryAfter(post(camille, 'Quatre'));
    expect(wait).toBeGreaterThanOrEqual(29);
    expect(wait).toBeLessThanOrEqual(31);
    advance(31);
    expect(await outcome(post(camille, 'Quatre'))).toBe('ok');
  });

  it('takes 15 main posts an hour, whatever the minutes', async () => {
    const camille = await person('Camille Roux');
    for (let minute = 0; minute < 5; minute++) {
      for (let i = 0; i < 3; i++) {
        expect(await outcome(post(camille, `M${String(minute)}P${String(i)}`))).toBe('ok');
      }
      advance(61);
    }
    // 5 minutes in: the minute is fresh, the hour is spent.
    const wait = await retryAfter(post(camille, 'Seize'));
    expect(wait).toBeGreaterThan(60);
    expect(wait).toBeLessThanOrEqual(3600 - 5 * 61 + 1);
    advance(3600 - 5 * 61);
    expect(await outcome(post(camille, 'Seize'))).toBe('ok');
  });

  it('counts both feeds, every Minecraft account and the browser together', async () => {
    const kael = await person('Kael Dubois', { role: 'feed-announcer', accounts: 2 });
    expect(await outcome(post(kael, 'Global'))).toBe('ok');
    expect(
      await outcome(post({ uuid: kael.accounts[1]!.uuid }, 'Annonce', { feed: 'announcements' })),
    ).toBe('ok');
    expect(
      await outcome(
        feedPostService.create({
          actor: site(kael),
          idempotencyKey: randomUUID(),
          feed: 'global',
          text: 'Du site',
          anonymous: false,
        }),
      ),
    ).toBe('ok');
    expect(await outcome(post(kael, 'Trop'))).toBe('429 rateLimited');
    // Another person is counted apart.
    const mika = await person('Mika Lefort');
    expect(await outcome(post(mika, 'Libre'))).toBe('ok');
    // Replies have their own count.
    expect(await outcome(reply(kael, (await post(mika, 'Fil')).post.id))).toBe('ok');
  });

  it('counts only what passes the other checks first', async () => {
    const camille = await person('Camille Roux');
    for (let i = 0; i < 5; i++) {
      expect(await outcome(post(camille, '  '))).toBe('400 emptyText');
      expect(await outcome(post(camille, 'x', { feed: 'announcements' }))).toBe('403 notAllowed');
    }
    for (let i = 0; i < 3; i++) expect(await outcome(post(camille, `P${String(i)}`))).toBe('ok');
    // A replay is answered before the rate.
    const key = randomUUID();
    advance(61);
    expect(await outcome(post(camille, 'Rejouée', { key }))).toBe('ok');
    for (let i = 0; i < 2; i++) expect(await outcome(post(camille, `Q${String(i)}`))).toBe('ok');
    expect(await outcome(post(camille, 'Rejouée', { key }))).toBe('ok');
    expect(await outcome(post(camille, 'Trop'))).toBe('429 rateLimited');
  });

  it('takes 6 replies a minute and 60 an hour', async () => {
    const camille = await person('Camille Roux');
    const mika: Person = await person('Mika Lefort');
    const { post: main } = await post(camille, 'Fil');
    for (let minute = 0; minute < 10; minute++) {
      for (let i = 0; i < 6; i++) expect(await outcome(reply(mika, main.id))).toBe('ok');
      expect(await outcome(reply(mika, main.id)), `minute ${String(minute)}`).toBe(
        '429 rateLimited',
      );
      advance(61);
    }
    const wait = await retryAfter(reply(mika, main.id));
    expect(wait).toBeGreaterThan(60);
    advance(wait);
    expect(await outcome(reply(mika, main.id))).toBe('ok');
  });

  it('takes 60 likes and unlikes a minute, changes or not', async () => {
    const camille = await person('Camille Roux', { accounts: 2 });
    const mika = await person('Mika Lefort');
    const { post: created } = await post(mika, 'Like');
    const like = (uuid: string, liked: boolean) =>
      feedLikeService.setLiked({
        actor: { source: 'server', player: uuid },
        postId: created.id,
        liked,
      });
    for (let i = 0; i < 60; i++) {
      // Liking a liked post still counts.
      expect(await outcome(like(camille.accounts[i % 2]!.uuid, i % 3 !== 0))).toBe('ok');
    }
    expect(await outcome(like(camille.uuid, true))).toBe('429 rateLimited');
    expect(await outcome(like(camille.uuid, false))).toBe('429 rateLimited');
    // A refused like changes nothing.
    expect(await outcome(like(mika.uuid, true))).toBe('ok');
    advance(60);
    expect(await outcome(like(camille.uuid, true))).toBe('ok');
    expect((await like(camille.uuid, true)).likes).toBe(2);
  });

  it('replays simultaneous retries of one key, whatever the limits say', async () => {
    const camille = await person('Camille Roux');
    await post(camille, 'Un');
    await post(camille, 'Deux');
    // One post left this minute: ten copies of one request, at once, all get the same post.
    const key = randomUUID();
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => post(camille, 'Trois', { key })),
    );
    expect(new Set(answers.map((answer) => answer.post.id)).size).toBe(1);
    expect(answers.filter((answer) => !answer.replayed)).toHaveLength(1);
    // The limit counted the one post made, and is now full.
    expect(await outcome(post(camille, 'Quatre'))).toBe('429 rateLimited');
    expect((await post(camille, 'Trois', { key })).replayed).toBe(true);
  });

  it('refuses a like on an unknown post before counting it', async () => {
    const mika = await person('Mika Lefort');
    const { post: created } = await post(mika, 'Like');
    for (let i = 0; i < 70; i++) {
      expect(
        await outcome(
          feedLikeService.setLiked({ actor: server(mika), postId: randomUUID(), liked: true }),
        ),
      ).toBe('404 notFound');
    }
    expect(
      await outcome(
        feedLikeService.setLiked({ actor: server(mika), postId: created.id, liked: true }),
      ),
    ).toBe('ok');
  });
});
