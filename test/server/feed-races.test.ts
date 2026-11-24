import { randomUUID } from 'node:crypto';

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { db } from '~~/server/db';
import { feedLike, feedNotification, feedPost, user } from '~~/server/db/schema';
import { feedLikeService } from '~~/server/services/feed/likes';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedLimits } from '~~/server/services/feed/shared';
import { usersService } from '~~/server/services/users';

import {
  eventsSince,
  latestEvent,
  person,
  post,
  problemOf,
  reply,
  server,
  setFlags,
  wipe,
} from './feed-helpers';

// Feed under concurrent calls (docs/feed.md, "Idempotency", "Pinning", "Deleting", "Counts"):
// whatever the interleaving, one post per key, counts that match the rows, at most 3 pins, and
// no live reply in a deleted thread. Each race runs several rounds to vary the interleaving.

const ROUNDS = 8;

/** Settles every call, keeping each outcome or its refusal. */
async function race<T>(calls: (() => Promise<T>)[]) {
  return Promise.all(
    calls.map(async (run) => {
      try {
        return { ok: true as const, value: await run() };
      } catch (error) {
        const data = (error as { data?: { problem?: string } }).data;
        return {
          ok: false as const,
          status: (error as { statusCode?: number }).statusCode,
          problem: data?.problem,
          error,
        };
      }
    }),
  );
}

/** Every live post's reply_count equals its live replies (the thread's, or the ones answering it). */
async function expectCountsMatchRows() {
  const rows = await db.execute<{ id: string; stored: number; actual: number }>(sql`
    select p.id, p.reply_count as stored,
      (select count(*)::int from feed_post r
        where r.deleted_at is null
          and ((p.thread_id is null and r.thread_id = p.id) or r.reply_to_id = p.id)) as actual
    from feed_post p where p.deleted_at is null`);
  for (const row of rows.rows) expect(row.stored, `replies of ${row.id}`).toBe(row.actual);
  const likes = await db.execute<{ id: string; stored: number; actual: number }>(sql`
    select p.id, p.like_count as stored,
      (select count(*)::int from feed_like l where l.post_id = p.id) as actual
    from feed_post p where p.deleted_at is null`);
  for (const row of likes.rows) expect(row.stored, `likes of ${row.id}`).toBe(row.actual);
}

describe('Feed races', () => {
  let limits: MockInstance<typeof feedLimits.check>;
  beforeEach(async () => {
    await wipe();
    limits = vi.spyOn(feedLimits, 'check').mockResolvedValue();
    // Feed ships off: these tests switch it on.
    setFlags();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  describe('idempotency keys', () => {
    it('creates one post when the same request arrives twice at once', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      for (let round = 0; round < ROUNDS; round++) {
        const key = randomUUID();
        const from = await latestEvent();
        const results = await race(
          Array.from(
            { length: 3 },
            () => () => post(kael, 'Annonce', { feed: 'announcements', key }),
          ),
        );
        expect(
          results.every((result) => result.ok),
          JSON.stringify(results),
        ).toBe(true);
        const values = results.map((result) => (result.ok ? result.value : null)!);
        expect(values.filter((value) => !value.replayed)).toHaveLength(1);
        expect(new Set(values.map((value) => value.post.id)).size).toBe(1);
        const rows = await db.select().from(feedPost).where(eq(feedPost.idempotencyKey, key));
        expect(rows).toHaveLength(1);
        // One notification and one post event: the losers created nothing.
        expect(
          await db.select().from(feedNotification).where(eq(feedNotification.postId, rows[0]!.id)),
        ).toHaveLength(1);
        const types = (await eventsSince(from)).map((event) => event.type);
        expect(types.filter((type) => type === 'post')).toHaveLength(1);
        expect(types.filter((type) => type === 'notification')).toHaveLength(1);
      }
    });

    it('creates one reply, counted once, when the same reply arrives twice at once', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      for (let round = 0; round < ROUNDS; round++) {
        const key = randomUUID();
        const results = await race(
          Array.from({ length: 3 }, () => () => reply(mika, main.id, null, { key })),
        );
        expect(
          results.every((result) => result.ok),
          JSON.stringify(results),
        ).toBe(true);
      }
      const [stored] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(stored!.replyCount).toBe(ROUNDS);
      expect(await db.select().from(feedNotification)).toHaveLength(ROUNDS);
      await expectCountsMatchRows();
    });

    it('refuses the loser of the same key with another text, at once', async () => {
      const camille = await person('Camille Roux');
      for (let round = 0; round < ROUNDS; round++) {
        const key = randomUUID();
        const results = await race([
          () => post(camille, 'Salut', { key }),
          () => post(camille, 'Bonjour', { key }),
        ]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        const refused = results.find((result) => !result.ok);
        expect(refused).toMatchObject({ status: 409, problem: 'idempotencyMismatch' });
      }
    });
  });

  describe('likes', () => {
    it('keeps the count right under many likes and unlikes at once', async () => {
      const author = await person('Camille Roux');
      const likers = await Promise.all(
        Array.from({ length: 12 }, (_, i) => person(`Liker ${String(i)}`, { accounts: 2 })),
      );
      const { post: created } = await post(author);
      const like = (uuid: string, liked: boolean) => () =>
        feedLikeService.setLiked({
          actor: { source: 'server', player: uuid },
          postId: created.id,
          liked,
        });

      for (let round = 0; round < ROUNDS; round++) {
        // Each person likes from both accounts and unlikes from one, in a random order.
        const calls = likers.flatMap((liker) => [
          like(liker.accounts[0]!.uuid, true),
          like(liker.accounts[1]!.uuid, true),
          like(liker.accounts[round % 2]!.uuid, round % 3 === 0),
        ]);
        calls.sort(() => Math.random() - 0.5);
        const results = await race(calls);
        expect(
          results.every((result) => result.ok),
          JSON.stringify(results),
        ).toBe(true);
        await expectCountsMatchRows();
      }
      const [stored] = await db.select().from(feedPost).where(eq(feedPost.id, created.id));
      const rows = await db.select().from(feedLike).where(eq(feedLike.postId, created.id));
      expect(stored!.likeCount).toBe(rows.length);
    });

    it('never counts a like on a post deleted at the same time', async () => {
      const author = await person('Camille Roux');
      const likers = await Promise.all(
        Array.from({ length: 6 }, (_, i) => person(`Liker ${String(i)}`)),
      );
      for (let round = 0; round < ROUNDS; round++) {
        const { post: created } = await post(author, `R${String(round)}`);
        const results = await race<unknown>([
          ...likers.map(
            (liker) => () =>
              feedLikeService.setLiked({ actor: server(liker), postId: created.id, liked: true }),
          ),
          () => feedPostService.remove({ actor: server(author), postId: created.id }),
        ]);
        for (const result of results) {
          if (!result.ok) expect(result).toMatchObject({ status: 404, problem: 'notFound' });
        }
        const [stored] = await db.select().from(feedPost).where(eq(feedPost.id, created.id));
        const rows = await db.select().from(feedLike).where(eq(feedLike.postId, created.id));
        expect(stored!.likeCount).toBe(rows.length);
        expect(stored!.deletedAt).not.toBeNull();
      }
    });
  });

  describe('pins', () => {
    async function announcements(author: { uuid: string }, n: number) {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        ids.push((await post(author, `A${String(i)}`, { feed: 'announcements' })).post.id);
      }
      return ids;
    }

    async function pinnedCount() {
      const rows = await db
        .select({ id: feedPost.id })
        .from(feedPost)
        .where(and(isNotNull(feedPost.pinnedAt), isNull(feedPost.deletedAt)));
      return rows.length;
    }

    it('never holds more than 3 pins when two announcers pin a fourth post at once', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      for (let round = 0; round < ROUNDS; round++) {
        await db.update(feedPost).set({ pinnedAt: null, pinnedByUserId: null });
        const [a, b, c, d, e] = (await announcements(lune, 5)) as [
          string,
          string,
          string,
          string,
          string,
        ];
        for (const id of [a, b]) await feedPinService.pin({ actor: server(lune), postId: id });
        // Two pins race for the third place.
        const third = await race([
          () => feedPinService.pin({ actor: server(lune), postId: c }),
          () => feedPinService.pin({ actor: server(kael), postId: d }),
        ]);
        expect(third.filter((result) => result.ok)).toHaveLength(1);
        expect(third.find((result) => !result.ok)).toMatchObject({
          status: 409,
          problem: 'pinLimit',
        });
        expect(await pinnedCount()).toBe(3);
        // Two replacing pins race: each replaces the oldest of the group it sees.
        const loser = third.find((result) => !result.ok) === third[0] ? c : d;
        const replaced = await race([
          () => feedPinService.pin({ actor: server(lune), postId: loser, replace: true }),
          () => feedPinService.pin({ actor: server(kael), postId: e, replace: true }),
        ]);
        expect(
          replaced.every((result) => result.ok),
          JSON.stringify(replaced),
        ).toBe(true);
        expect(await pinnedCount()).toBe(3);
        const unpinned = replaced.map((result) => (result.ok ? result.value.unpinned : null));
        expect(new Set(unpinned).size).toBe(2);
      }
    });

    it('stays consistent when a replacing pin races an unpin', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      for (let round = 0; round < ROUNDS; round++) {
        await db.update(feedPost).set({ pinnedAt: null, pinnedByUserId: null });
        const [a, b, c, d] = (await announcements(lune, 4)) as [string, string, string, string];
        for (const id of [a, b, c]) await feedPinService.pin({ actor: server(lune), postId: id });
        const results = await race([
          () => feedPinService.pin({ actor: server(lune), postId: d, replace: true }),
          () => feedPinService.unpin({ actor: server(kael), postId: a }),
        ]);
        expect(
          results.every((result) => result.ok),
          JSON.stringify(results),
        ).toBe(true);
        const count = await pinnedCount();
        expect(count).toBeLessThanOrEqual(3);
        const pinned = await db
          .select({ id: feedPost.id })
          .from(feedPost)
          .where(isNotNull(feedPost.pinnedAt));
        const ids = pinned.map((row) => row.id);
        expect(ids).toContain(d);
        expect(ids).not.toContain(a);
        // The unpin ran first (D took the free place, B and C stay) or the pin did (A went to
        // make room, and the unpin found it unpinned already).
        expect(ids.sort()).toEqual([b, c, d].sort());
      }
    });

    it('never leaves a deleted post pinned when it is pinned and deleted at once', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      for (let round = 0; round < ROUNDS; round++) {
        const [a] = (await announcements(kael, 1)) as [string];
        const results = await race<unknown>([
          () => feedPinService.pin({ actor: server(lune), postId: a }),
          () => feedPostService.remove({ actor: server(kael), postId: a }),
        ]);
        for (const result of results) {
          if (!result.ok) expect(result).toMatchObject({ status: 404, problem: 'notFound' });
        }
        const [row] = await db.select().from(feedPost).where(eq(feedPost.id, a));
        expect(row!.deletedAt).not.toBeNull();
        expect(row!.pinnedAt).toBeNull();
      }
    });
  });

  describe('replies and deletions', () => {
    it('never leaves a live reply in a thread deleted at the same time', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      for (let round = 0; round < ROUNDS; round++) {
        const { post: main } = await post(camille, `Fil ${String(round)}`);
        const { post: first } = await reply(mika, main.id);
        const results = await race<unknown>([
          () => reply(mika, main.id),
          () => reply(mika, main.id, first.id),
          () => feedPostService.remove({ actor: server(camille), postId: main.id }),
          () => reply(camille, main.id, first.id),
        ]);
        for (const result of results) {
          if (!result.ok) expect(result).toMatchObject({ status: 404, problem: 'notFound' });
        }
        const live = await db
          .select({ id: feedPost.id })
          .from(feedPost)
          .where(and(eq(feedPost.threadId, main.id), isNull(feedPost.deletedAt)));
        expect(live).toEqual([]);
        // No notification is left for a row that went.
        const waiting = await db.execute<{ n: number }>(sql`
          select count(*)::int as n from feed_notification n
          join feed_post p on p.id = n.post_id where p.deleted_at is not null`);
        expect(waiting.rows[0]!.n).toBe(0);
      }
    });

    it('keeps the counts right when a reply races the deletion of the reply it answers', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const nina = await person('Nina Petit');
      for (let round = 0; round < ROUNDS; round++) {
        const { post: main } = await post(camille, `Fil ${String(round)}`);
        const { post: target } = await reply(mika, main.id);
        const results = await race<unknown>([
          () => reply(nina, main.id, target.id),
          () => reply(camille, main.id, target.id),
          () => feedPostService.remove({ actor: server(mika), postId: target.id }),
        ]);
        for (const result of results) {
          if (!result.ok) expect(result).toMatchObject({ status: 404, problem: 'notFound' });
        }
        await expectCountsMatchRows();
        // A reply that answered it keeps its line; one that lost the race was never created.
        const answers = await db
          .select({ id: feedPost.id })
          .from(feedPost)
          .where(eq(feedPost.replyToId, target.id));
        expect(answers.length).toBe(results.filter((result) => result.ok).length - 1);
      }
    });

    it('keeps the counts right when replies and their deletions interleave', async () => {
      const camille = await person('Camille Roux');
      const people = await Promise.all(
        Array.from({ length: 5 }, (_, i) => person(`Joueur ${String(i)}`)),
      );
      const { post: main } = await post(camille, 'Fil');
      const firsts = await Promise.all(people.map((who) => reply(who, main.id)));
      for (let round = 0; round < ROUNDS; round++) {
        const results = await race([
          ...people.map((who, i) => () => reply(who, main.id, firsts[i]!.post.id)),
          ...people.map((who, i) => () => reply(who, main.id, firsts[(i + 1) % 5]!.post.id)),
        ]);
        expect(results.every((result) => result.ok)).toBe(true);
        const mine = await db
          .select({ id: feedPost.id, author: feedPost.authorUserId })
          .from(feedPost)
          .where(and(eq(feedPost.threadId, main.id), isNull(feedPost.deletedAt)));
        const removals = mine
          .filter((row) => !firsts.some((first) => first.post.id === row.id))
          .slice(0, 4)
          .map((row) => () => {
            const who = people.find((candidate) => candidate.id === row.author)!;
            return feedPostService.remove({ actor: server(who), postId: row.id });
          });
        await race(removals);
        await expectCountsMatchRows();
      }
    });
  });

  describe('deleting twice at once', () => {
    it('counts a reply deleted by its author and a moderator at once only once', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const { post: main } = await post(camille, 'Fil');
      for (let round = 0; round < ROUNDS; round++) {
        const { post: target } = await reply(mika, main.id);
        const { post: answer } = await reply(camille, main.id, target.id);
        const from = await latestEvent();
        const results = await race<unknown>([
          () => feedPostService.remove({ actor: server(mika), postId: answer.id }),
          () => feedPostService.remove({ actor: server(camille), postId: answer.id }),
          () => feedPostService.remove({ actor: server(lune), postId: answer.id }),
        ]);
        // Mika didn't write it: refused (403, or 404 once it's gone); the others both succeed.
        expect(results[0]).toMatchObject({ ok: false });
        expect(results[1]!.ok && results[2]!.ok).toBe(true);
        await expectCountsMatchRows();
        const deleted = (await eventsSince(from)).filter((event) => event.type === 'deleted');
        expect(deleted).toHaveLength(1);
      }
    });

    it('keeps the counts right when a reply and its thread are deleted at once', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      for (let round = 0; round < ROUNDS; round++) {
        const { post: main } = await post(camille, `Fil ${String(round)}`);
        const { post: first } = await reply(mika, main.id);
        const { post: second } = await reply(mika, main.id, first.id);
        const results = await race<unknown>([
          () => feedPostService.remove({ actor: server(mika), postId: second.id }),
          () => feedPostService.remove({ actor: server(camille), postId: main.id }),
          () => feedPostService.remove({ actor: server(mika), postId: first.id }),
        ]);
        expect(
          results.every((result) => result.ok),
          JSON.stringify(results),
        ).toBe(true);
        const rows = await db.select().from(feedPost).where(eq(feedPost.threadId, main.id));
        expect(rows.every((row) => row.deletedAt !== null)).toBe(true);
        for (const row of [
          ...rows,
          ...(await db.select().from(feedPost).where(eq(feedPost.id, main.id))),
        ]) {
          expect(row.replyCount).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('deleting an account during the replies, likes and deletes it touches', () => {
    // The deletion locks the threads it touches before the account's row; every write in a
    // thread locks its main post first. Without that order a reply (thread, then the account it
    // answers) and the deletion (account, then its threads) deadlocked.
    it('never deadlocks, deletes the account, and leaves counts matching the rows', async () => {
      for (let round = 0; round < 5; round++) {
        await wipe();
        const admin = await person('Admin Lune', { role: 'admin' });
        const lune = await person('Lune Garnier', { role: 'warden-admin' });
        const camille = await person('Camille Roux');
        const mika = await person('Mika Lefort');
        const others = await Promise.all(
          Array.from({ length: 6 }, (_, i) => person(`Joueur ${String(i)}`)),
        );
        const { post: hers } = await post(camille, 'À elle');
        const { post: his } = await post(mika, 'À lui');
        const { post: herReply } = await reply(camille, his.id);
        await feedLikeService.setLiked({ actor: server(camille), postId: his.id, liked: true });
        const results = await race<unknown>([
          () => usersService.remove({ actorId: admin.id, userId: camille.id }),
          () => feedPostService.remove({ actor: server(lune), postId: herReply.id }),
          () => feedLikeService.setLiked({ actor: server(camille), postId: his.id, liked: false }),
          ...others.map((who) => () => reply(who, hers.id)),
          ...others.map((who) => () => reply(who, his.id, herReply.id)),
          ...others.map(
            (who) => () =>
              feedLikeService.setLiked({ actor: server(who), postId: his.id, liked: true }),
          ),
        ]);
        const deadlocks = results.filter(
          (result) => !result.ok && /deadlock/i.test(String(result.error)),
        );
        expect(deadlocks, `round ${String(round)}`).toEqual([]);
        expect(results[0]!.ok, `round ${String(round)}: the account deletion`).toBe(true);
        // Whatever lost to the deletion lost cleanly: not found, or no longer linked.
        for (const result of results) {
          if (!result.ok) expect(result.status, String(result.error)).toBe(404);
        }
        expect(await db.select().from(user).where(eq(user.id, camille.id))).toEqual([]);
        await expectCountsMatchRows();
      }
    }, 120_000);
  });

  describe('rate limits under concurrent calls', () => {
    it('lets exactly 3 of 6 simultaneous posts from one account through', async () => {
      limits.mockRestore();
      const camille = await person('Camille Roux', { accounts: 2 });
      const results = await race(
        Array.from(
          { length: 6 },
          (_, i) => () => post({ uuid: camille.accounts[i % 2]!.uuid }, `Post ${String(i)}`),
        ),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(3);
      for (const result of results.filter((candidate) => !candidate.ok)) {
        expect(result).toMatchObject({ status: 429, problem: 'rateLimited' });
      }
      expect(await problemOf(post(camille, 'Encore'))).toMatchObject({ problem: 'rateLimited' });
    });
  });
});
