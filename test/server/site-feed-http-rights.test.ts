import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { db } from '~~/server/db';
import { audit, feedMember, feedPost, user, wardenBan } from '~~/server/db/schema';
import { feedLimits } from '~~/server/services/feed/shared';

import {
  api,
  createdPost,
  plain,
  postBody,
  problem,
  refusal,
  replyBody,
  requireTestUser,
  unlink,
} from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';
import { person, post, reply, setFlags, stubServerUtils, wipe } from './feed-helpers';
import type { Person } from './feed-helpers';

// The browser's Feed routes against the contract, row by row (docs/feed.md: Rights, Writing,
// Pinning, Deleting, "For the browser"): what each kind of person is allowed and refused, the
// posting account, who sees an anonymous author, and what a hostile or broken caller sends.

const banned = (who: { id: string }, extra: { expiresAt?: Date | null } = {}) =>
  db.insert(wardenBan).values({ userId: who.id, reason: 'Test', source: 'web', ...extra });

interface Listed {
  id: string;
  canDelete: boolean;
  canPin: boolean;
}

describe('Feed browser routes against the contract', () => {
  let limits: MockInstance<typeof feedLimits.check>;

  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    limits = vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('the flags, in order', () => {
    it('checks the session, then feed, then feed.writing, then the body', async () => {
      const camille = await person('Camille Roux');
      const malformed = '{';
      setFlags({ feed: false });
      expect(refusal(await api.post(null, malformed))).toEqual(plain(401));
      expect(refusal(await api.post(camille, malformed))).toEqual(
        problem(503, 'disabled', { flag: 'feed' }),
      );
      setFlags({ 'feed.writing': false });
      expect(refusal(await api.post(camille, malformed))).toEqual(
        problem(503, 'disabled', { flag: 'feed.writing' }),
      );
      setFlags();
      expect(refusal(await api.post(camille, malformed))).toEqual(plain(400));
    });

    it('with feed.writing off, replays nothing: the flag comes before the key', async () => {
      const camille = await person('Camille Roux');
      const body = postBody();
      expect((await api.post(camille, body)).status).toBe(201);
      setFlags({ 'feed.writing': false });
      expect(refusal(await api.post(camille, body))).toEqual(
        problem(503, 'disabled', { flag: 'feed.writing' }),
      );
    });

    it('with feed.writing off, a reply is refused before its thread is looked up', async () => {
      const camille = await person('Camille Roux');
      setFlags({ 'feed.writing': false });
      expect(refusal(await api.reply(camille, randomUUID(), replyBody()))).toEqual(
        problem(503, 'disabled', { flag: 'feed.writing' }),
      );
    });

    it('with feed.writing off, GET /me says so and still reports the right to write', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      setFlags({ 'feed.writing': false });
      expect((await api.me(lune)).body).toMatchObject({
        writing: false,
        rights: { write: true, announce: true },
      });
    });

    it('with feed.writing off, a moderator still pins, unpins and deletes, and the pin is audited', async () => {
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const { post: announcement } = await post(ines, 'Annonce', { feed: 'announcements' });
      setFlags({ 'feed.writing': false });
      expect((await api.pin(ines, announcement.id)).status).toBe(200);
      const rows = await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.pin'));
      expect(rows).toHaveLength(1);
      expect((await api.unpin(ines, announcement.id)).status).toBe(200);
      expect((await api.remove(ines, announcement.id)).status).toBe(204);
    });
  });

  describe('the rights, as GET /me gives them', () => {
    const cases: [string, () => Promise<As>, object, Record<string, unknown>][] = [
      [
        'a player',
        () => person('Léa Bernard'),
        { write: true, announce: false, moderate: false },
        { linked: true, banned: false },
      ],
      [
        'a player with no linked account',
        () => person('Noa Petit', { accounts: 0 }),
        { write: false, announce: false, moderate: false },
        { linked: false, banned: false, me: null, accounts: [] },
      ],
      [
        'an announcer',
        () => person('Lune Garnier', { role: 'feed-announcer' }),
        { write: true, announce: true, moderate: false },
        { linked: true },
      ],
      [
        'an announcer with no linked account',
        () => person('Lune Garnier', { role: 'feed-announcer', accounts: 0 }),
        { write: false, announce: false, moderate: false },
        { linked: false },
      ],
      [
        'a Warden admin',
        () => person('Inès Rivière', { role: 'warden-admin' }),
        { write: true, announce: true, moderate: true },
        { linked: true },
      ],
      [
        'a site admin',
        () => person('Adam Admin', { role: 'admin' }),
        { write: true, announce: true, moderate: true },
        { linked: true },
      ],
      [
        'a moderator with no linked account',
        () => person('Inès Rivière', { role: 'warden-admin', accounts: 0 }),
        { write: false, announce: false, moderate: true },
        { linked: false },
      ],
      [
        'an events manager, who has no Feed role',
        () => person('Eve Event', { role: 'events-manager' }),
        { write: true, announce: false, moderate: false },
        { linked: true },
      ],
    ];
    it.each(cases)('%s', async (_name, make, rights, extra) => {
      const who = await make();
      const answer = await api.me(who);
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({ rights, ...extra });
    });

    it('takes every right from a Warden ban, a moderator and an announcer included', async () => {
      for (const role of [undefined, 'feed-announcer', 'warden-admin', 'admin']) {
        const who = await person('Mika Lefort', { role });
        await banned(who);
        expect((await api.me(who)).body, String(role)).toMatchObject({
          banned: true,
          rights: { write: false, announce: false, moderate: false },
        });
      }
    });

    it('treats a site ban like a Warden ban, with no end date to show', async () => {
      const mika = await person('Mika Lefort', { role: 'warden-admin' });
      await db.update(user).set({ banned: true }).where(eq(user.id, mika.id));
      expect((await api.me(mika)).body).toMatchObject({
        banned: true,
        banExpiresAt: null,
        rights: { write: false, moderate: false },
      });
      const future = await person('Nina Futur');
      await db
        .update(user)
        .set({ banned: true, banExpires: new Date(Date.now() + 3_600_000) })
        .where(eq(user.id, future.id));
      expect((await api.me(future)).body).toMatchObject({ banned: true, banExpiresAt: null });
      const over = await person('Omar Passé');
      await db
        .update(user)
        .set({ banned: true, banExpires: new Date(Date.now() - 3_600_000) })
        .where(eq(user.id, over.id));
      expect((await api.me(over)).body).toMatchObject({ banned: false, rights: { write: true } });
    });

    it('ignores a Warden ban that has ended or was revoked, and gives the longest end of several', async () => {
      const ended = await person('Éva Fini');
      await banned(ended, { expiresAt: new Date(Date.now() - 1000) });
      expect((await api.me(ended)).body).toMatchObject({ banned: false });

      const revoked = await person('Rémi Levé');
      await db
        .insert(wardenBan)
        .values({ userId: revoked.id, reason: 'Test', source: 'web', revokedAt: new Date() });
      expect((await api.me(revoked)).body).toMatchObject({ banned: false });

      const twice = await person('Tom Deux');
      const soon = new Date(Date.now() + 3_600_000);
      const later = new Date(Date.now() + 86_400_000);
      await banned(twice, { expiresAt: soon });
      await banned(twice, { expiresAt: later });
      expect((await api.me(twice)).body).toMatchObject({ banExpiresAt: later.toISOString() });
      await banned(twice, { expiresAt: null });
      expect((await api.me(twice)).body).toMatchObject({ banned: true, banExpiresAt: null });
    });

    it('shows a hidden real name as null in the author block, and the first name and initial otherwise', async () => {
      const hidden = await person('Léa Bernard', { showRealName: false });
      const shown = await person('Léa Bernard', { showRealName: true });
      const unknown = await person('Léa Bernard');
      const realName = async (who: Person) =>
        ((await api.me(who)).body as { me: { realName: unknown } }).me.realName;
      expect(await realName(hidden)).toBeNull();
      expect(await realName(shown)).toBe('Léa B.');
      expect(await realName(unknown)).toBe('Léa B.');
    });

    it('lists unread dots from other people’s main posts only', async () => {
      const camille = await person('Camille Roux');
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      await post(camille, 'Le mien');
      await post(lune, 'Annonce', { feed: 'announcements' });
      expect((await api.me(camille)).body).toMatchObject({
        unread: { announcements: true, global: false },
      });
      expect((await api.me(lune)).body).toMatchObject({
        unread: { announcements: false, global: true },
      });
    });
  });

  describe('what each person may do', () => {
    it('refuses a banned player every write with 403 banned, and lets them read, mark seen and delete their own', async () => {
      const mika = await person('Mika Lefort');
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const { post: own } = await post(mika, 'Avant le ban');
      await banned(mika);
      const refused = problem(403, 'banned');
      expect(refusal(await api.post(mika, postBody()))).toEqual(refused);
      expect(refusal(await api.reply(mika, main.id, replyBody()))).toEqual(refused);
      expect(refusal(await api.like(mika, main.id))).toEqual(refused);
      expect(refusal(await api.unlike(mika, main.id))).toEqual(refused);
      // The ban is told before the checks that would fail first for anyone else.
      expect(refusal(await api.post(mika, postBody({ text: '' })))).toEqual(refused);
      expect(refusal(await api.post(mika, postBody({ feed: 'announcements' })))).toEqual(refused);

      expect((await api.page(mika, 'feed=global')).status).toBe(200);
      expect((await api.thread(mika, main.id)).status).toBe(200);
      expect((await api.threadSeen(mika, main.id)).status).toBe(204);
      expect((await api.seen(mika, { feed: 'global', upTo: main.createdAt })).status).toBe(204);
      expect((await api.remove(mika, own.id)).status).toBe(204);
    });

    it('refuses a banned announcer and a banned moderator the pin and the unpin with 403 banned', async () => {
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const { post: announcement } = await post(ines, 'Annonce', { feed: 'announcements' });
      await banned(ines);
      await banned(lune);
      for (const who of [ines, lune]) {
        expect(refusal(await api.pin(who, announcement.id)), who.name).toEqual(
          problem(403, 'banned'),
        );
        expect(refusal(await api.unpin(who, announcement.id)), who.name).toEqual(
          problem(403, 'banned'),
        );
      }
      expect(refusal(await api.post(ines, postBody({ feed: 'announcements' })))).toEqual(
        problem(403, 'banned'),
      );
    });

    it('stops showing anonymous authors to a moderator once they are banned', async () => {
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: secret } = await post(camille, 'Secret', { anonymous: true });
      const authorSeen = async () =>
        ((await api.thread(ines, secret.id)).body as { post: { author: unknown } }).post.author;
      expect(await authorSeen()).not.toBeNull();
      await banned(ines);
      expect(await authorSeen()).toBeNull();
    });

    it('answers a player with no linked account notLinked for every write, and lets them delete what they wrote before unlinking', async () => {
      const noa = await person('Noa Petit');
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const { post: old } = await post(noa, 'Avant');
      await unlink(noa.accounts[0]!);
      const refused = problem(404, 'notLinked');
      expect(refusal(await api.post(noa, postBody()))).toEqual(refused);
      expect(refusal(await api.reply(noa, main.id, replyBody()))).toEqual(refused);
      expect(refusal(await api.like(noa, main.id))).toEqual(refused);
      expect(refusal(await api.unlike(noa, main.id))).toEqual(refused);
      expect(refusal(await api.patchMe(noa, { postingAccount: noa.uuid }))).toEqual(refused);
      expect((await api.page(noa, 'feed=global')).status).toBe(200);
      expect((await api.remove(noa, old.id)).status).toBe(204);
    });

    it('answers an announcer with no linked account notLinked on a pin', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer', accounts: 0 });
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const { post: announcement } = await post(ines, 'Annonce', { feed: 'announcements' });
      expect(refusal(await api.pin(lune, announcement.id))).toEqual(problem(404, 'notLinked'));
    });

    it('lets an announcer post in Announcements and pin, but delete their own posts only', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const camille = await person('Camille Roux');
      const created = await api.post(lune, postBody({ feed: 'announcements' }));
      expect(created.status).toBe(201);
      expect(createdPost(created)).toMatchObject({
        canPin: true,
        canDelete: true,
        author: { announcer: true },
      });
      const { post: global } = await post(camille);
      expect(refusal(await api.remove(lune, global.id))).toEqual(problem(403, 'notAllowed'));
      expect((await api.remove(lune, createdPost(created).id)).status).toBe(204);
    });

    it('gives a moderator canDelete on their own posts only, and refuses their DELETE on others’ without a trace', async () => {
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: theirs } = await post(camille, 'À Camille');
      const { post: hiddenPost } = await post(camille, 'Fil', { anonymous: true });
      const { post: mine } = await post(ines, 'Annonce', { feed: 'announcements' });
      const global = (await api.page(ines, 'feed=global')).body as { posts: Listed[] };
      expect(global.posts.map((p) => [p.id, p.canDelete, p.canPin]).sort()).toEqual(
        [
          [theirs.id, false, false],
          [hiddenPost.id, false, false],
        ].sort(),
      );
      const announcements = (await api.page(ines, 'feed=announcements')).body as {
        posts: Listed[];
      };
      expect(announcements.posts).toMatchObject([{ id: mine.id, canDelete: true, canPin: true }]);
      for (const id of [theirs.id, hiddenPost.id]) {
        expect(refusal(await api.remove(ines, id))).toEqual(problem(403, 'notAllowed'));
      }
      const rows = await db.select().from(feedPost).where(eq(feedPost.id, theirs.id));
      expect(rows[0]?.deletedAt).toBeNull();
      expect(
        await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.delete')),
      ).toEqual([]);
    });

    it('answers a moderator’s DELETE on someone else’s deleted post notFound', async () => {
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: theirs } = await post(camille);
      await api.remove(camille, theirs.id);
      expect(refusal(await api.remove(ines, theirs.id))).toEqual(problem(404, 'notFound'));
    });

    it('refuses a thread’s author the delete of someone else’s reply, deleted or not', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const { post: answer } = await reply(mika, main.id);
      expect(refusal(await api.remove(camille, answer.id))).toEqual(problem(403, 'notAllowed'));
      await api.remove(mika, answer.id);
      expect(refusal(await api.remove(camille, answer.id))).toEqual(problem(404, 'notFound'));
    });

    it('lets a player like their own post, and answers the viewer’s own state', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      expect((await api.like(camille, main.id)).body).toEqual({
        id: main.id,
        likes: 1,
        liked: true,
      });
      const page = (await api.page(camille, 'feed=global')).body as {
        posts: { liked: boolean; likes: number }[];
      };
      expect(page.posts[0]).toMatchObject({ liked: true, likes: 1 });
    });

    it('keeps one like per account, from whichever Minecraft account', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      await api.like(lea, main.id);
      await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      expect((await api.like(lea, main.id)).body).toMatchObject({ likes: 1 });
    });

    it('likes a reply and answers its own count', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const { post: answer } = await reply(mika, main.id);
      expect((await api.like(camille, answer.id)).body).toEqual({
        id: answer.id,
        likes: 1,
        liked: true,
      });
    });
  });

  describe('pins from the browser', () => {
    async function announcements(count: number) {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        ids.push((await post(lune, `A${String(i)}`, { feed: 'announcements' })).post.id);
      }
      return { lune, ids };
    }

    it('takes the empty, the valid and the malformed bodies of PUT /pin', async () => {
      const { lune, ids } = await announcements(6);
      // No body at all, and no content type.
      expect((await api.pin(lune, ids[0]!)).status).toBe(200);
      // Pinning a pinned post changes nothing, whatever it carries.
      expect((await api.pin(lune, ids[0]!, { replace: true })).body).toMatchObject({
        unpinned: null,
      });
      expect((await api.pin(lune, ids[1]!, {})).status).toBe(200);
      expect((await api.pin(lune, ids[2]!, { replace: false })).status).toBe(200);
      for (const body of [
        { replace: 'yes' },
        { replace: 1 },
        { replace: null },
        '[]',
        '{',
        '"x"',
      ]) {
        expect(refusal(await api.pin(lune, ids[3]!, body)), JSON.stringify(body)).toEqual(
          plain(400),
        );
      }
      // The refused bodies pinned nothing.
      const page = (await api.page(lune, 'feed=announcements')).body as { pinned: unknown[] };
      expect(page.pinned).toHaveLength(3);
    });

    it('refuses a JSON null body like any body that is not an object', async () => {
      const { lune, ids } = await announcements(1);
      expect(refusal(await api.pin(lune, ids[0]!, 'null'))).toEqual(plain(400));
    });

    it('names the oldest pin in pinLimit, and replaces exactly that one, audited with both', async () => {
      const { lune, ids } = await announcements(4);
      for (const id of ids.slice(0, 3)) await api.pin(lune, id);
      const refused = await api.pin(lune, ids[3]!);
      expect(refusal(refused)).toEqual(problem(409, 'pinLimit', { oldest: { id: ids[0] } }));
      const replaced = await api.pin(lune, ids[3]!, { replace: true });
      expect(replaced.body).toMatchObject({ unpinned: ids[0] });
      const rows = await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.pin'));
      expect(rows).toHaveLength(4);
      expect(rows.map((row) => (row.data as { replaced: string | null }).replaced).sort()).toEqual(
        [ids[0], null, null, null].sort(),
      );
    });

    it('answers an unpin of a post that is not pinned with the current group and records nothing', async () => {
      const { lune, ids } = await announcements(2);
      await api.pin(lune, ids[0]!);
      const answer = await api.unpin(lune, ids[1]!);
      expect(answer.status).toBe(200);
      expect((answer.body as { pinned: { id: string }[] }).pinned.map((p) => p.id)).toEqual([
        ids[0],
      ]);
      expect(await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.unpin'))).toEqual(
        [],
      );
    });

    it('refuses to pin a reply, answers an unpin of one with the group, and refuses a player', async () => {
      const { lune, ids } = await announcements(1);
      const camille = await person('Camille Roux');
      const { post: answer } = await reply(camille, ids[0]!);
      expect(refusal(await api.pin(lune, answer.id))).toEqual(problem(409, 'notPinnable'));
      expect((await api.unpin(lune, answer.id)).body).toMatchObject({ pinned: [] });
      expect(refusal(await api.unpin(camille, ids[0]!))).toEqual(problem(403, 'notAllowed'));
    });

    it('unpins a post when its author deletes it, and the page shows no pinned group', async () => {
      const { lune, ids } = await announcements(1);
      await api.pin(lune, ids[0]!);
      await api.remove(lune, ids[0]!);
      expect((await api.page(lune, 'feed=announcements')).body).toMatchObject({
        pinned: [],
        posts: [],
      });
      expect(refusal(await api.pin(lune, ids[0]!))).toEqual(problem(404, 'notFound'));
    });

    it('lists the pinned group on the first page only, never again below it', async () => {
      const { lune, ids } = await announcements(4);
      await api.pin(lune, ids[0]!);
      await api.pin(lune, ids[1]!);
      const first = (await api.page(lune, 'feed=announcements&limit=1')).body as {
        pinned: { id: string }[];
        posts: { id: string }[];
        next: string;
      };
      expect(first.pinned.map((p) => p.id)).toEqual([ids[1], ids[0]]);
      expect(first.posts.map((p) => p.id)).toEqual([ids[3]]);
      const second = (
        await api.page(lune, `feed=announcements&limit=5&before=${encodeURIComponent(first.next)}`)
      ).body as { pinned: unknown[]; posts: { id: string }[] };
      expect(second.pinned).toEqual([]);
      expect(second.posts.map((p) => p.id)).toEqual([ids[2]]);
    });

    it('does not show a pinned group on Global, and gives players canPin false', async () => {
      const { lune, ids } = await announcements(1);
      const camille = await person('Camille Roux');
      await api.pin(lune, ids[0]!);
      const global = (await api.page(camille, 'feed=global')).body as { pinned: unknown[] };
      expect(global.pinned).toEqual([]);
      const seen = (await api.page(camille, 'feed=announcements')).body as {
        pinned: { canPin: boolean; pinnedAt: string }[];
      };
      expect(seen.pinned).toMatchObject([{ canPin: false }]);
      expect(seen.pinned[0]!.pinnedAt).toEqual(expect.any(String));
    });
  });

  describe('the posting account', () => {
    it('uses the earliest linked account by default, and the chosen one after', async () => {
      const lea = await person('Léa Bernard', { accounts: 3 });
      expect((await api.me(lea)).body).toMatchObject({
        postingAccount: lea.accounts[0]!.uuid,
        accounts: lea.accounts,
      });
      await api.patchMe(lea, { postingAccount: lea.accounts[2]!.uuid });
      expect((await api.me(lea)).body).toMatchObject({ postingAccount: lea.accounts[2]!.uuid });
    });

    it('accepts the UUID in capitals, and stores it as the account’s', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const answer = await api.patchMe(lea, {
        postingAccount: lea.accounts[1]!.uuid.toUpperCase(),
      });
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({ postingAccount: lea.accounts[1]!.uuid });
    });

    it('falls back to the earliest account still linked when the chosen one is unlinked afterwards', async () => {
      const lea = await person('Léa Bernard', { accounts: 3 });
      await api.patchMe(lea, { postingAccount: lea.accounts[2]!.uuid });
      await unlink(lea.accounts[2]!);
      expect((await api.me(lea)).body).toMatchObject({
        linked: true,
        postingAccount: lea.accounts[0]!.uuid,
        me: { uuid: lea.accounts[0]!.uuid },
        accounts: [lea.accounts[0], lea.accounts[1]],
      });
      const created = await api.post(lea, postBody());
      expect(createdPost(created)).toMatchObject({ author: { uuid: lea.accounts[0]!.uuid } });
      // And the next linked one takes over when that one goes too.
      await unlink(lea.accounts[0]!);
      expect((await api.me(lea)).body).toMatchObject({ postingAccount: lea.accounts[1]!.uuid });
    });

    it('reads only once every account is unlinked, and a post made before keeps its account', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      await api.post(lea, postBody());
      for (const account of lea.accounts) await unlink(account);
      expect((await api.me(lea)).body).toMatchObject({
        linked: false,
        me: null,
        postingAccount: null,
        accounts: [],
        rights: { write: false },
      });
      expect(refusal(await api.post(lea, postBody()))).toEqual(problem(404, 'notLinked'));
      const page = (await api.page(lea, 'feed=global')).body as {
        posts: { author: { uuid: string } }[];
      };
      expect(page.posts[0]!.author.uuid).toBe(lea.accounts[0]!.uuid);
    });

    it('refuses an unlinked account of one’s own, and another person’s, with notLinked', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const mika = await person('Mika Lefort');
      await unlink(lea.accounts[1]!);
      for (const uuid of [lea.accounts[1]!.uuid, mika.uuid]) {
        expect(refusal(await api.patchMe(lea, { postingAccount: uuid }))).toEqual(
          problem(404, 'notLinked'),
        );
      }
      const rows = await db.select().from(feedMember).where(eq(feedMember.userId, lea.id));
      expect(rows[0]?.postingMinecraftUuid ?? null).toBeNull();
    });

    it('does not let PATCH /me move another person’s posting account', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const mika = await person('Mika Lefort', { accounts: 2 });
      await api.patchMe(mika, { postingAccount: mika.accounts[1]!.uuid });
      await api.patchMe(lea, { postingAccount: mika.accounts[0]!.uuid });
      expect((await api.me(mika)).body).toMatchObject({ postingAccount: mika.accounts[1]!.uuid });
      expect((await api.me(lea)).body).toMatchObject({ postingAccount: lea.accounts[0]!.uuid });
    });

    it('answers PATCH /me for the same account again with the same state', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const first = await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      const again = await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      expect(again.body).toEqual(first.body);
    });

    it('makes the author block follow the chosen account, and keeps older posts on theirs', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const first = createdPost(await api.post(lea, postBody()));
      await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      const second = createdPost(await api.post(lea, postBody()));
      expect(first.author).toMatchObject({ uuid: lea.accounts[0]!.uuid });
      expect(second.author).toMatchObject({ uuid: lea.accounts[1]!.uuid });
      const page = (await api.page(lea, 'feed=global')).body as {
        posts: { id: string; author: { uuid: string } }[];
      };
      expect(page.posts.find((p) => p.id === first.id)?.author.uuid).toBe(lea.accounts[0]!.uuid);
    });

    it('replays an earlier post when the key is sent again after Change account, as the contract says', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const body = postBody();
      const first = await api.post(lea, body);
      await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      const again = await api.post(lea, body);
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({
        replayed: true,
        post: { id: createdPost(first).id, author: { uuid: lea.accounts[0]!.uuid } },
      });
      expect(await db.select().from(feedPost)).toHaveLength(1);
    });

    it('replays a reply across Change account the same way, and a new key posts from the new account', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const body = replyBody();
      const first = await api.reply(lea, main.id, body);
      await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      expect((await api.reply(lea, main.id, body)).body).toMatchObject({
        replayed: true,
        post: { id: createdPost(first).id },
      });
      const fresh = await api.reply(lea, main.id, replyBody({ text: body.text }));
      expect(createdPost(fresh)).toMatchObject({ author: { uuid: lea.accounts[1]!.uuid } });
    });
  });

  describe('idempotency from the browser', () => {
    it('refuses the same key for another feed, text, anonymity or requester with 409', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const mika = await person('Mika Lefort');
      const body = postBody();
      await api.post(lune, body);
      const mismatch = problem(409, 'idempotencyMismatch');
      for (const change of [{ feed: 'announcements' }, { text: 'Autre' }, { anonymous: true }]) {
        expect(
          refusal(await api.post(lune, { ...body, ...change })),
          JSON.stringify(change),
        ).toEqual(mismatch);
      }
      expect(refusal(await api.post(mika, body))).toEqual(mismatch);
    });

    it('counts a different spelling of the same cleaned text as the same request', async () => {
      const camille = await person('Camille Roux');
      const body = postBody({ text: 'Salut' });
      await api.post(camille, body);
      const again = await api.post(camille, { ...body, text: '  Salut\r\n' });
      expect(again.body).toMatchObject({ replayed: true });
    });

    it('replays with the key in capitals', async () => {
      const camille = await person('Camille Roux');
      const body = postBody();
      await api.post(camille, body);
      const again = await api.post(camille, {
        ...body,
        idempotencyKey: body.idempotencyKey.toUpperCase(),
      });
      expect(again.body).toMatchObject({ replayed: true });
      expect(await db.select().from(feedPost)).toHaveLength(1);
    });

    it('replays through a ban, a lost right and a rate limit, since the key is read first', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const body = postBody({ feed: 'announcements' });
      await api.post(lune, body);
      await banned(lune);
      limits.mockRejectedValue(new Error('the limit must not be reached'));
      expect((await api.post(lune, body)).body).toMatchObject({ replayed: true });
    });

    it('answers notFound for the key of a post since deleted, whatever the request', async () => {
      const camille = await person('Camille Roux');
      const body = postBody();
      const first = await api.post(camille, body);
      await api.remove(camille, createdPost(first).id);
      expect(refusal(await api.post(camille, body))).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.post(camille, { ...body, text: 'Autre' }))).toEqual(
        problem(404, 'notFound'),
      );
    });

    it('replays a reply, and refuses its key on another thread or target', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: one } = await post(camille, 'Un');
      const { post: two } = await post(camille, 'Deux');
      const { post: first } = await reply(camille, one.id);
      const body = replyBody();
      await api.reply(mika, one.id, body);
      expect((await api.reply(mika, one.id, body)).body).toMatchObject({ replayed: true });
      expect(refusal(await api.reply(mika, two.id, body))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
      expect(refusal(await api.reply(mika, one.id, { ...body, replyTo: first.id }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
    });

    it('does not let a post key be used for a reply', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const body = postBody();
      await api.post(camille, body);
      expect(
        refusal(
          await api.reply(camille, main.id, replyBody({ idempotencyKey: body.idempotencyKey })),
        ),
      ).toEqual(problem(409, 'idempotencyMismatch'));
    });
  });

  describe('rate limits through the real limiter', () => {
    beforeEach(() => {
      limits.mockRestore();
    });

    it('refuses the fourth post of a minute with 429, Retry-After, and still replays an earlier key', async () => {
      const camille = await person('Camille Roux');
      const first = postBody();
      for (const body of [first, postBody(), postBody()]) {
        expect((await api.post(camille, body)).status).toBe(201);
      }
      const fourth = await api.post(camille, postBody());
      expect(fourth.status).toBe(429);
      expect(fourth.error?.data).toMatchObject({ problem: 'rateLimited' });
      const retry = Number(fourth.headers.get('Retry-After'));
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(60);
      expect(fourth.error?.data?.retryAfter).toBe(retry);
      expect((await api.post(camille, first)).body).toMatchObject({ replayed: true });
      expect(await db.select().from(feedPost)).toHaveLength(3);
    });

    it('counts posts in game and in the browser together, and replies apart', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille, 'Du jeu 1');
      await post(camille, 'Du jeu 2');
      await post(camille, 'Du jeu 3');
      expect(refusal(await api.post(camille, postBody()))).toEqual(
        problem(429, 'rateLimited', { retryAfter: expect.any(Number) as unknown }),
      );
      expect((await api.reply(camille, main.id, replyBody())).status).toBe(201);
    });

    it('refuses the seventh reply of a minute', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      for (let i = 0; i < 6; i++) {
        expect((await api.reply(mika, main.id, replyBody())).status).toBe(201);
      }
      const seventh = await api.reply(mika, main.id, replyBody());
      expect(seventh.status).toBe(429);
      expect(Number(seventh.headers.get('Retry-After'))).toBeGreaterThan(0);
    });

    it('does not spend the limit on a refused post', async () => {
      const camille = await person('Camille Roux');
      for (let i = 0; i < 5; i++) {
        expect(refusal(await api.post(camille, postBody({ text: '' }))).status).toBe(400);
      }
      expect((await api.post(camille, postBody())).status).toBe(201);
    });

    it('limits each account on its own', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      for (let i = 0; i < 3; i++) await api.post(camille, postBody());
      expect((await api.post(mika, postBody())).status).toBe(201);
    });
  });

  describe('anonymity by viewer, in every answer', () => {
    async function scene() {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const { post: secret } = await post(camille, 'Un secret', { anonymous: true });
      const { post: first } = await reply(mika, secret.id, null, { text: 'Je réponds' });
      const { post: hidden } = await reply(camille, secret.id, first.id, {
        anonymous: true,
        text: 'Anonyme répond',
      });
      const { post: announcement } = await post(lune, 'Annonce anonyme', {
        feed: 'announcements',
        anonymous: true,
      });
      return { camille, mika, ines, lune, secret, first, hidden, announcement };
    }

    function leaks(answer: unknown, who: Person) {
      const text = JSON.stringify(answer);
      return [who.username, who.uuid, who.id, who.name.split(' ')[0]!].filter((needle) =>
        text.includes(needle),
      );
    }

    it('shows the author of an anonymous post to its author and to moderators only', async () => {
      const s = await scene();
      const authorOf = async (viewer: Person) =>
        (
          (await api.thread(viewer, s.secret.id)).body as {
            post: { author: { uuid: string } | null; mine: boolean };
          }
        ).post;
      expect(await authorOf(s.camille)).toMatchObject({
        author: { uuid: s.camille.uuid },
        mine: true,
      });
      expect(await authorOf(s.ines)).toMatchObject({
        author: { uuid: s.camille.uuid },
        mine: false,
      });
      for (const stranger of [s.mika, s.lune]) {
        expect(await authorOf(stranger)).toMatchObject({ author: null, mine: false });
      }
    });

    it('leaks neither the name, the handle, the UUID nor the account to a stranger, in a page, a thread or a pin answer', async () => {
      const s = await scene();
      await api.pin(s.lune, s.announcement.id);
      const answers = [
        await api.page(s.mika, 'feed=global'),
        await api.page(s.mika, 'feed=announcements'),
        await api.thread(s.mika, s.secret.id),
      ].map((answer) => answer.body);
      expect(leaks(answers, s.camille)).toEqual([]);
      expect(leaks(answers, s.lune)).toEqual([]);
      // The pin answer lists IDs and times only.
      const pinned = await api.pin(s.lune, s.announcement.id);
      expect(Object.keys((pinned.body as { pinned: object[] }).pinned[0]!).sort()).toEqual([
        'id',
        'pinnedAt',
      ]);
    });

    it('gives an anonymous reply its author to the author and moderators, and a reply to an anonymous one no name even to a moderator', async () => {
      const s = await scene();
      for (const viewer of [s.camille, s.ines, s.mika]) {
        const thread = (await api.thread(viewer, s.secret.id)).body as {
          replies: { id: string; replyTo: unknown; author: { uuid: string } | null }[];
        };
        const found = thread.replies.find((r) => r.id === s.hidden.id)!;
        expect(found.replyTo, viewer.name).toEqual({
          id: s.first.id,
          anonymous: false,
          name: 'Mika L.',
        });
        const seesIt = viewer === s.camille || viewer === s.ines;
        expect(found.author === null, viewer.name).toBe(!seesIt);
      }
      const answer = await api.reply(s.mika, s.secret.id, replyBody({ replyTo: s.hidden.id }));
      expect(createdPost(answer).replyTo).toEqual({
        id: s.hidden.id,
        anonymous: true,
        name: null,
      });
      const asModerator = (await api.thread(s.ines, s.secret.id)).body as {
        replies: { id: string; replyTo: unknown }[];
      };
      expect(asModerator.replies.find((r) => r.id === createdPost(answer).id)!.replyTo).toEqual({
        id: s.hidden.id,
        anonymous: true,
        name: null,
      });
    });

    it('does not leak the author of an anonymous post in the answer to a replier, nor in its replay', async () => {
      const s = await scene();
      const body = replyBody({ anonymous: true });
      const answer = await api.reply(s.mika, s.secret.id, body);
      expect(createdPost(answer)).toMatchObject({ mine: true, anonymous: true });
      expect(leaks(answer.body, s.camille)).toEqual([]);
      const replay = await api.reply(s.mika, s.secret.id, body);
      expect(replay.body).toMatchObject({ replayed: true });
      expect(leaks(replay.body, s.camille)).toEqual([]);
    });

    it('shows an anonymous announcement as an anonymous post: no author, no badge, but the author and a moderator know', async () => {
      const s = await scene();
      const first = async (viewer: Person) =>
        (
          (await api.page(viewer, 'feed=announcements')).body as {
            posts: {
              author: { uuid: string; announcer: boolean } | null;
              mine: boolean;
            }[];
          }
        ).posts[0]!;
      expect(await first(s.mika)).toMatchObject({ author: null });
      expect(await first(s.lune)).toMatchObject({
        mine: true,
        author: { uuid: s.lune.uuid, announcer: true },
      });
      expect(await first(s.ines)).toMatchObject({ mine: false, author: { uuid: s.lune.uuid } });
    });

    it('answers the creator of an anonymous post with the author block, and a replay the same', async () => {
      const camille = await person('Camille Roux');
      const body = postBody({ anonymous: true });
      const first = await api.post(camille, body);
      const again = await api.post(camille, body);
      for (const answer of [first, again]) {
        expect(createdPost(answer)).toMatchObject({
          anonymous: true,
          mine: true,
          author: { uuid: camille.uuid },
        });
      }
    });

    it('keeps the post on its first account for its author after the posting account changed', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      await api.post(lea, postBody({ anonymous: true }));
      await api.patchMe(lea, { postingAccount: lea.accounts[1]!.uuid });
      const page = (await api.page(lea, 'feed=global')).body as {
        posts: { author: { uuid: string } }[];
      };
      expect(page.posts[0]!.author.uuid).toBe(lea.accounts[0]!.uuid);
    });

    it('lets a moderator like an anonymous post without the answer naming its author', async () => {
      const s = await scene();
      const like = await api.like(s.ines, s.secret.id);
      expect(like.body).toEqual({ id: s.secret.id, likes: 1, liked: true });
    });
  });

  describe('hostile input', () => {
    const NOT_UUIDS = [
      'nope',
      '123',
      'null',
      'undefined',
      '0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e7',
      ' ',
      '%00',
    ];

    it('answers a plain 404 for an ID that is not a UUID, on every route with an ID', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      for (const id of NOT_UUIDS) {
        const answers = {
          thread: await api.thread(lune, id),
          reply: await api.reply(lune, id, replyBody()),
          like: await api.like(lune, id),
          unlike: await api.unlike(lune, id),
          pin: await api.pin(lune, id),
          unpin: await api.unpin(lune, id),
          remove: await api.remove(lune, id),
          seen: await api.threadSeen(lune, id),
        };
        for (const [name, answer] of Object.entries(answers)) {
          expect(refusal(answer), `${name} ${id}`).toEqual(plain(404));
        }
      }
    });

    it('answers 404 notFound for a UUID that names nothing, and for a reply’s ID where a main post is wanted', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const { post: answer } = await reply(mika, main.id);
      const unknown = randomUUID();
      const gone = problem(404, 'notFound');
      expect(refusal(await api.thread(camille, unknown))).toEqual(gone);
      expect(refusal(await api.thread(camille, answer.id))).toEqual(gone);
      expect(refusal(await api.threadSeen(camille, answer.id))).toEqual(gone);
      expect(refusal(await api.reply(camille, answer.id, replyBody()))).toEqual(gone);
      expect(refusal(await api.reply(camille, unknown, replyBody()))).toEqual(gone);
    });

    it('takes a UUID in capitals as the same post', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const answer = await api.thread(camille, main.id.toUpperCase());
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({ post: { id: main.id } });
    });

    it('answers notFound for a deleted post on every route, and for its replies', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const { post: answer } = await reply(mika, main.id);
      await api.remove(camille, main.id);
      const gone = problem(404, 'notFound');
      expect(refusal(await api.thread(mika, main.id))).toEqual(gone);
      expect(refusal(await api.threadSeen(mika, main.id))).toEqual(gone);
      expect(refusal(await api.like(mika, main.id))).toEqual(gone);
      expect(refusal(await api.like(mika, answer.id))).toEqual(gone);
      expect(refusal(await api.reply(mika, main.id, replyBody()))).toEqual(gone);
      // Its author could have deleted it, so deleting again answers 204; anyone else, notFound.
      expect((await api.remove(mika, answer.id)).status).toBe(204);
      expect(refusal(await api.remove(camille, answer.id))).toEqual(gone);
      expect((await api.page(mika, 'feed=global')).body).toMatchObject({ posts: [] });
    });

    const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const FORGED = [
      'x',
      '!!!',
      '%%%',
      b64([]),
      b64([1]),
      b64({ a: 1 }),
      b64([-1, randomUUID()]),
      b64([1.5, randomUUID()]),
      b64([1e17, randomUUID()]),
      b64([Number.MAX_SAFE_INTEGER + 2, randomUUID()]),
      b64(['1', randomUUID()]),
      b64([1, 'not-a-uuid']),
      b64([1, `${randomUUID()}'; drop table feed_post;--`]),
      b64([1, randomUUID(), 'extra']),
      'A'.repeat(129),
      '',
      Buffer.from('not json').toString('base64url'),
    ];

    it('answers a plain 400 for a forged cursor, as before and as after', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      for (const cursor of FORGED) {
        const q = encodeURIComponent(cursor);
        expect(refusal(await api.page(camille, `feed=global&before=${q}`)), cursor).toEqual(
          plain(400),
        );
        expect(refusal(await api.thread(camille, main.id, `after=${q}`)), cursor).toEqual(
          plain(400),
        );
      }
    });

    it('takes a well-formed cursor that names nothing', async () => {
      const camille = await person('Camille Roux');
      await post(camille, 'Un');
      const early = b64([0, randomUUID()]);
      expect((await api.page(camille, `feed=global&before=${early}`)).body).toMatchObject({
        posts: [],
        next: null,
      });
      const late = b64([Date.parse('9999-12-31T23:59:59.999Z'), randomUUID()]);
      const answer = await api.page(camille, `feed=global&before=${late}`);
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({ posts: [{ text: 'Un' }] });
    });

    // A Date after the year 9999 reaches PostgreSQL as "+YYYYYY-...", which it refuses ("time
    // zone displacement out of range"): decodeCursor stops at the end of 9999, so such a cursor
    // is a forged one and gets the plain 400, in a feed and in a thread.
    const FAR = [Date.parse('+010000-01-01T00:00:00.000Z'), 8.64e15];

    it('answers a plain 400 for a cursor dated after the year 9999 (feed)', async () => {
      const camille = await person('Camille Roux');
      for (const at of FAR) {
        const answer = await api.page(camille, `feed=global&before=${b64([at, randomUUID()])}`);
        expect(refusal(answer), String(at)).toEqual(plain(400));
      }
    });

    it('answers a plain 400 for a cursor dated after the year 9999 (thread)', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      for (const at of FAR) {
        const answer = await api.thread(camille, main.id, `after=${b64([at, randomUUID()])}`);
        expect(refusal(answer), String(at)).toEqual(plain(400));
      }
    });

    it('answers a plain 400 for a bad limit, a bad feed, a repeated or odd query', async () => {
      const camille = await person('Camille Roux');
      for (const query of [
        'feed=global&limit=0',
        'feed=global&limit=51',
        'feed=global&limit=-1',
        'feed=global&limit=1.5',
        'feed=global&limit=abc',
        'feed=global&limit=',
        'feed=GLOBAL',
        'feed=global&feed=announcements',
        'feed[]=global',
        'feed=',
        '',
      ]) {
        expect(refusal(await api.page(camille, query)), query).toEqual(plain(400));
      }
      const { post: main } = await post(camille);
      for (const query of ['limit=0', 'limit=51', 'limit=x']) {
        expect(refusal(await api.thread(camille, main.id, query)), query).toEqual(plain(400));
      }
    });

    it('answers a plain 400 for a malformed or oddly shaped body', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const bad: unknown[] = [
        undefined,
        '',
        '{',
        'null',
        '[]',
        '"text"',
        {},
        postBody({ idempotencyKey: undefined }),
        postBody({ idempotencyKey: 'not-a-uuid' }),
        postBody({ idempotencyKey: 12 }),
        postBody({ feed: undefined }),
        postBody({ feed: 'Global' }),
        postBody({ feed: 'all' }),
        postBody({ text: undefined }),
        postBody({ text: 12 }),
        postBody({ text: null }),
        postBody({ text: ['a'] }),
        postBody({ anonymous: undefined }),
        postBody({ anonymous: 'true' }),
        postBody({ anonymous: 1 }),
        postBody({ text: 'a'.repeat(4001) }),
      ];
      for (const body of bad) {
        expect(refusal(await api.post(camille, body)), JSON.stringify(body)).toEqual(plain(400));
      }
      for (const body of [
        replyBody({ replyTo: 'not-a-uuid' }),
        replyBody({ replyTo: undefined }),
        replyBody({ replyTo: 12 }),
        replyBody({ text: 'a'.repeat(4001) }),
        replyBody({ anonymous: null }),
      ]) {
        expect(refusal(await api.reply(camille, main.id, body)), JSON.stringify(body)).toEqual(
          plain(400),
        );
      }
      expect(await db.select().from(feedPost)).toHaveLength(1);
    });

    it('ignores fields it does not know, so a caller cannot post as someone else', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const answer = await api.post(
        camille,
        postBody({
          player: mika.uuid,
          userId: mika.id,
          authorUserId: mika.id,
          author: { uuid: mika.uuid },
          source: 'server',
          pinnedAt: new Date().toISOString(),
        }),
      );
      expect(createdPost(answer)).toMatchObject({
        mine: true,
        author: { uuid: camille.uuid },
        pinnedAt: null,
      });
      const [row] = await db.select().from(feedPost);
      expect(row).toMatchObject({ authorUserId: camille.id, source: 'site', pinnedAt: null });
    });

    it('takes 4,000 characters raw and refuses the next with a plain 400, a long text with tooLong', async () => {
      const camille = await person('Camille Roux');
      expect(refusal(await api.post(camille, postBody({ text: 'a'.repeat(4000) })))).toEqual(
        problem(400, 'tooLong'),
      );
      expect(refusal(await api.post(camille, postBody({ text: 'a'.repeat(4001) })))).toEqual(
        plain(400),
      );
      // Mostly whitespace around a short text is fine: the cleaned text is what counts.
      const padded = await api.post(
        camille,
        postBody({ text: `${' '.repeat(2000)}ok${' '.repeat(1990)}` }),
      );
      expect(createdPost(padded).text).toBe('ok');
    });

    it('cleans odd text with the site’s rule, and stores and answers the cleaned text', async () => {
      const camille = await person('Camille Roux');
      const stored = async (text: string) => {
        const answer = await api.post(camille, postBody({ text }));
        return answer.status === 201 ? createdPost(answer).text : refusal(answer);
      };
      expect(await stored('a\u0000b\u0007c\u007Fd\u0085e')).toBe('abcde');
      expect(await stored('§6Gras§r')).toBe('6Grasr');
      expect(await stored('a\r\nb\rc\td')).toBe('a\nb\nc d');
      expect(await stored('x\n\n\n\n\ny\n\n\nz')).toBe('x\n\ny\n\nz');
      expect(await stored('\n   salut  \n')).toBe('salut');
      expect(await stored('café')).toBe('café');
      expect(await stored('a\uD800b')).toBe('ab');
      expect(await stored('﻿x')).toBe('﻿x');
      expect(await stored('日本語 😀 العربية')).toBe('日本語 😀 العربية');
      expect(await stored('\u0000\u0001\u0002')).toEqual(problem(400, 'emptyText'));
    });

    it('refuses texts that clean to nothing with emptyText, and the count of cleaned code points with tooLong', async () => {
      const camille = await person('Camille Roux');
      for (const text of ['', ' ', '\n\n', '\t', '\u0000\u0001', '§', '   ', '\uD800']) {
        expect(refusal(await api.post(camille, postBody({ text }))), JSON.stringify(text)).toEqual(
          problem(400, 'emptyText'),
        );
      }
      expect((await api.post(camille, postBody({ text: '😀'.repeat(280) }))).status).toBe(201);
      expect(refusal(await api.post(camille, postBody({ text: '😀'.repeat(281) })))).toEqual(
        problem(400, 'tooLong'),
      );
      // Controls and the section sign do not count: 280 letters among them pass.
      expect(
        (await api.post(camille, postBody({ text: `${'a'.repeat(140)}§\u0000${'b'.repeat(140)}` })))
          .status,
      ).toBe(201);
      // A letter and a combining mark with no composed form are two code points, as the phone
      // counts them.
      expect(refusal(await api.post(camille, postBody({ text: `${'a'.repeat(279)}q́` })))).toEqual(
        problem(400, 'tooLong'),
      );
    });

    it('checks replies’ text with the same rule', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      expect(refusal(await api.reply(camille, main.id, replyBody({ text: ' \n ' })))).toEqual(
        problem(400, 'emptyText'),
      );
      expect(
        refusal(await api.reply(camille, main.id, replyBody({ text: 'a'.repeat(281) }))),
      ).toEqual(problem(400, 'tooLong'));
      const cleaned = await api.reply(camille, main.id, replyBody({ text: '  a\r\n\r\n\r\nb ' }));
      expect(createdPost(cleaned).text).toBe('a\n\nb');
    });

    it('refuses a replyTo from another thread, a deleted reply, an unknown ID and a main post, with notFound', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: one } = await post(camille, 'Un');
      const { post: two } = await post(camille, 'Deux');
      const { post: elsewhere } = await reply(mika, two.id);
      const { post: deleted } = await reply(mika, one.id);
      await api.remove(mika, deleted.id);
      const gone = problem(404, 'notFound');
      for (const replyTo of [elsewhere.id, deleted.id, randomUUID(), two.id, one.id]) {
        expect(refusal(await api.reply(camille, one.id, replyBody({ replyTo }))), replyTo).toEqual(
          gone,
        );
      }
      // Nothing of the refused replies was counted.
      const rows = await db.select().from(feedPost).where(eq(feedPost.id, one.id));
      expect(rows[0]?.replyCount).toBe(0);
    });

    it('answers a reply to a reply with the line, and counts it on both posts', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort', { showRealName: false });
      const { post: main } = await post(camille);
      const { post: first } = await reply(mika, main.id);
      const created = createdPost(
        await api.reply(camille, main.id, replyBody({ replyTo: first.id })),
      );
      expect(created.replyTo).toEqual({ id: first.id, anonymous: false, name: mika.username });
      const thread = (await api.thread(camille, main.id)).body as {
        post: { replies: number };
        replies: { id: string; replies: number }[];
      };
      expect(thread.post.replies).toBe(2);
      expect(thread.replies.find((r) => r.id === first.id)?.replies).toBe(1);
    });

    it('lets replies be read in pieces without repeats or gaps', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((await reply(mika, main.id, null, { text: `R${String(i)}` })).post.id);
      }
      const seen: string[] = [];
      let after = '';
      for (let guard = 0; guard < 10; guard++) {
        const answer = (await api.thread(camille, main.id, `limit=2${after}`)).body as {
          replies: { id: string }[];
          next: string | null;
        };
        seen.push(...answer.replies.map((r) => r.id));
        if (!answer.next) break;
        after = `&after=${encodeURIComponent(answer.next)}`;
      }
      expect(seen).toEqual(ids);
    });

    it('pages a feed in pieces newest first without repeats, even when posts share a time', async () => {
      const camille = await person('Camille Roux');
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) {
        ids.push((await post(camille, `P${String(i)}`)).post.id);
      }
      await db.update(feedPost).set({ createdAt: new Date('2026-11-23T20:00:00.000Z') });
      const seen: string[] = [];
      let before = '';
      for (let guard = 0; guard < 10; guard++) {
        const answer = (await api.page(camille, `feed=global&limit=3${before}`)).body as {
          posts: { id: string }[];
          next: string | null;
        };
        seen.push(...answer.posts.map((p) => p.id));
        if (!answer.next) break;
        before = `&before=${encodeURIComponent(answer.next)}`;
      }
      expect(new Set(seen).size).toBe(7);
      expect(seen).toEqual([...ids].sort().reverse());
    });
  });

  describe('the seen marks', () => {
    it('keeps the later time, ignores an earlier one, and never goes past now', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: first } = await post(mika, 'Un');
      const forever = { feed: 'global', upTo: '2099-01-01T00:00:00.000Z' };
      expect((await api.seen(camille, forever)).status).toBe(204);
      expect((await api.me(camille)).body).toMatchObject({ unread: { global: false } });
      // A post made after the clamped time is unread again, which a stored 2099 would hide.
      await new Promise((done) => setTimeout(done, 15));
      await post(mika, 'Deux');
      expect((await api.me(camille)).body).toMatchObject({ unread: { global: true } });
      await api.seen(camille, { feed: 'global', upTo: first.createdAt });
      expect((await api.me(camille)).body).toMatchObject({ unread: { global: true } });
    });

    it('takes the ISO form with a Z, and refuses offsets and odd values', async () => {
      const camille = await person('Camille Roux');
      for (const upTo of ['2026-11-23T20:14:05.000Z', '2026-11-23T20:14:05Z']) {
        expect((await api.seen(camille, { feed: 'global', upTo })).status, upTo).toBe(204);
      }
      for (const upTo of [
        '2026-11-23T21:14:05+01:00',
        '2026-11-23',
        '2026-13-45T00:00:00.000Z',
        '',
        0,
        null,
        ['2026-11-23T20:14:05.000Z'],
      ]) {
        expect(refusal(await api.seen(camille, { feed: 'global', upTo })), String(upTo)).toEqual(
          plain(400),
        );
      }
      expect(refusal(await api.seen(camille, { feed: 'global' }))).toEqual(plain(400));
      expect(refusal(await api.seen(camille, { upTo: '2026-11-23T20:14:05.000Z' }))).toEqual(
        plain(400),
      );
    });

    it('marks each feed apart', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const camille = await person('Camille Roux');
      const { post: announcement } = await post(lune, 'Annonce', { feed: 'announcements' });
      await post(lune, 'Global');
      await api.seen(camille, { feed: 'announcements', upTo: announcement.createdAt });
      expect((await api.me(camille)).body).toMatchObject({
        unread: { announcements: false, global: true },
      });
    });

    it('marks a thread seen twice without error, clearing the markers for its author only', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      await reply(mika, main.id);
      const count = async (viewer: Person) =>
        (
          (await api.page(viewer, 'feed=global')).body as {
            posts: { unseenReplies: number }[];
          }
        ).posts[0]!.unseenReplies;
      expect(await count(camille)).toBe(1);
      expect(await count(mika)).toBe(0);
      expect((await api.threadSeen(camille, main.id)).status).toBe(204);
      expect((await api.threadSeen(camille, main.id)).status).toBe(204);
      expect(await count(camille)).toBe(0);
      await reply(mika, main.id);
      expect(await count(camille)).toBe(1);
    });

    it('counts replies to one’s own reply as unseen, not one’s own and not a deleted one', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const lune = await person('Lune Garnier');
      const { post: main } = await post(camille);
      const { post: mine } = await reply(mika, main.id);
      await reply(mika, main.id, mine.id);
      const { post: answer } = await reply(lune, main.id, mine.id);
      const unseen = async () =>
        (
          (await api.thread(mika, main.id)).body as {
            replies: { id: string; unseenReplies: number }[];
          }
        ).replies.find((r) => r.id === mine.id)!.unseenReplies;
      expect(await unseen()).toBe(1);
      await api.remove(lune, answer.id);
      expect(await unseen()).toBe(0);
    });

    it('does not let a moderator or another person clear someone else’s markers', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const { post: main } = await post(camille);
      await reply(mika, main.id);
      await api.threadSeen(ines, main.id);
      await api.threadSeen(mika, main.id);
      const page = (await api.page(camille, 'feed=global')).body as {
        posts: { unseenReplies: number }[];
      };
      expect(page.posts[0]!.unseenReplies).toBe(1);
    });

    it('marks seen with no linked account without failing', async () => {
      const noa = await person('Noa Petit', { accounts: 0 });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      expect((await api.seen(noa, { feed: 'global', upTo: main.createdAt })).status).toBe(204);
      expect((await api.threadSeen(noa, main.id)).status).toBe(204);
    });
  });

  describe('deleting', () => {
    it('hides a deleted main post and its replies at once, and fixes the counts', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const { post: one } = await reply(mika, main.id);
      const { post: two } = await reply(camille, main.id, one.id);
      expect((await api.remove(mika, two.id)).status).toBe(403);
      await api.remove(camille, two.id);
      const afterReply = (await api.thread(camille, main.id)).body as {
        post: { replies: number };
        replies: { id: string; replies: number }[];
      };
      expect(afterReply.post.replies).toBe(1);
      expect(afterReply.replies).toMatchObject([{ id: one.id, replies: 0 }]);
      expect((await api.remove(camille, main.id)).status).toBe(204);
      for (const id of [main.id, one.id]) {
        expect(refusal(await api.like(mika, id))).toEqual(problem(404, 'notFound'));
      }
      expect((await api.page(mika, 'feed=global')).body).toMatchObject({ posts: [] });
    });

    it('lets an author delete their own anonymous reply, and answers 204 again', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const { post: secret } = await reply(mika, main.id, null, { anonymous: true });
      expect((await api.remove(mika, secret.id)).status).toBe(204);
      expect((await api.remove(mika, secret.id)).status).toBe(204);
      expect(refusal(await api.remove(camille, secret.id))).toEqual(problem(404, 'notFound'));
    });

    it('does not audit an author’s own delete, a moderator’s own included', async () => {
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const { post: mine } = await post(ines);
      await api.remove(ines, mine.id);
      expect(
        await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.delete')),
      ).toEqual([]);
    });

    it('keeps the row for moderators, with the cause and the deleter', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      await api.remove(camille, main.id);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(row).toMatchObject({ deletedCause: 'author', deletedByUserId: camille.id });
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });

    it('answers notFound for the thread of a deleted account', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      await db.delete(user).where(eq(user.id, camille.id));
      expect(refusal(await api.thread(mika, main.id))).toEqual(problem(404, 'notFound'));
    });
  });
});
