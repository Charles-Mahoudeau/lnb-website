import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { feedMember, feedPost, minecraftAccount, wardenBan } from '~~/server/db/schema';
import { feedAdminService } from '~~/server/services/feed/admin';
import { feedLikeService } from '~~/server/services/feed/likes';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedReadStateService } from '~~/server/services/feed/read-state';
import { feedRightsService } from '~~/server/services/feed/rights';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';

import { person, post, problemOf, reply, server, setFlags, site, wipe } from './feed-helpers';
import type { Person } from './feed-helpers';

import type { FeedAdminListQuery } from '#shared/schemas/feed';

// The browser's and the admin's service paths, which have no handlers yet (docs/feed.md, "For
// the browser" and "For the admin"): the person's state and posting account, writing from the
// site, deleting one's own only, and the moderation table with its search, filters and summary.

const DAY = 86_400_000;

function sitePost(
  who: { id: string },
  text = 'Depuis le site',
  options: { feed?: 'announcements' | 'global'; anonymous?: boolean; key?: string } = {},
) {
  return feedPostService.create({
    actor: site(who),
    idempotencyKey: options.key ?? randomUUID(),
    feed: options.feed ?? 'global',
    text,
    anonymous: options.anonymous ?? false,
  });
}

async function unlink(uuid: string) {
  await db
    .update(minecraftAccount)
    .set({ unlinkedAt: new Date() })
    .where(eq(minecraftAccount.uuid, uuid));
}

function query(overrides: Partial<FeedAdminListQuery> = {}): FeedAdminListQuery {
  return { feeds: ['announcements', 'global'], ...overrides };
}

describe('Feed in the browser and the admin', () => {
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  describe('the person’s state and posting account (GET and PATCH /me)', () => {
    let camille: Person;
    beforeEach(async () => {
      camille = await person('Camille Roux', { accounts: 3 });
    });

    it('lists the linked accounts, earliest first, and posts from the earliest by default', async () => {
      const me = await feedRightsService.me(camille.id);
      expect(me).toMatchObject({
        linked: true,
        banned: false,
        banExpiresAt: null,
        writing: true,
        rights: { write: true, announce: false, moderate: false },
        me: { uuid: camille.uuid, username: camille.username, realName: 'Camille R.' },
        unread: { announcements: false, global: false },
        accounts: camille.accounts,
        postingAccount: camille.uuid,
      });
      const { post: created } = await sitePost(camille);
      expect(created.author).toMatchObject({ uuid: camille.uuid });
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, created.id));
      expect(row).toMatchObject({ source: 'site', minecraftUuid: camille.uuid });
    });

    it('remembers the chosen account for posts and replies, until it is unlinked', async () => {
      const [, second, third] = camille.accounts as [
        Person['accounts'][0],
        Person['accounts'][0],
        Person['accounts'][0],
      ];
      expect(
        await feedRightsService.setPostingAccount(camille.id, second.uuid.toUpperCase()),
      ).toMatchObject({
        postingAccount: second.uuid,
        me: { uuid: second.uuid, username: second.username },
      });
      const { post: main } = await sitePost(camille);
      expect(main.author!.uuid).toBe(second.uuid);
      const { post: answer } = await feedPostService.reply({
        actor: site(camille),
        idempotencyKey: randomUUID(),
        threadId: main.id,
        replyTo: null,
        text: 'Réponse',
        anonymous: false,
      });
      expect(answer.author!.uuid).toBe(second.uuid);
      // Picking another account later changes nothing on what was posted.
      await feedRightsService.setPostingAccount(camille.id, third.uuid);
      expect((await feedRightsService.me(camille.id)).postingAccount).toBe(third.uuid);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(row!.minecraftUuid).toBe(second.uuid);
      // Unlinked, the earliest linked account still linked takes over.
      await unlink(third.uuid);
      expect((await feedRightsService.me(camille.id)).postingAccount).toBe(camille.uuid);
      await unlink(camille.uuid);
      expect((await feedRightsService.me(camille.id)).postingAccount).toBe(second.uuid);
      // The choice is kept, but no longer used.
      const [member] = await db.select().from(feedMember).where(eq(feedMember.userId, camille.id));
      expect(member!.postingMinecraftUuid).toBe(third.uuid);
    });

    it('reads only once every account is unlinked', async () => {
      for (const account of camille.accounts) await unlink(account.uuid);
      expect(await feedRightsService.me(camille.id)).toMatchObject({
        linked: false,
        rights: { write: false, announce: false, moderate: false },
        me: null,
        accounts: [],
        postingAccount: null,
      });
      expect(await problemOf(sitePost(camille))).toMatchObject({
        status: 404,
        problem: 'notLinked',
      });
      // Reading still works, and the person's own old posts are still theirs.
      const page = await feedViewService.page({ who: { userId: camille.id }, feed: 'global' });
      expect(page.posts).toEqual([]);
    });

    it('refuses a posting account that is not one of the person’s linked accounts', async () => {
      const mika = await person('Mika Lefort');
      for (const uuid of [mika.uuid, randomUUID()]) {
        expect(
          await problemOf(feedRightsService.setPostingAccount(camille.id, uuid)),
        ).toMatchObject({
          status: 404,
          problem: 'notLinked',
        });
      }
      await unlink(camille.accounts[2]!.uuid);
      expect(
        await problemOf(feedRightsService.setPostingAccount(camille.id, camille.accounts[2]!.uuid)),
      ).toMatchObject({ status: 404, problem: 'notLinked' });
      expect(await db.select().from(feedMember)).toEqual([]);
    });

    it('gives the end of the Warden ban in force, the latest, or null when permanent', async () => {
      const soon = new Date(Date.now() + DAY);
      const later = new Date(Date.now() + 3 * DAY);
      await db.insert(wardenBan).values([
        { userId: camille.id, reason: 'A', source: 'web', expiresAt: soon },
        { userId: camille.id, reason: 'B', source: 'web', expiresAt: later },
        { userId: camille.id, reason: 'C', source: 'web', expiresAt: new Date(Date.now() - DAY) },
      ] as (typeof wardenBan.$inferInsert)[]);
      expect(await feedRightsService.me(camille.id)).toMatchObject({
        banned: true,
        banExpiresAt: later.toISOString(),
        rights: { write: false },
      });
      await db.insert(wardenBan).values({ userId: camille.id, reason: 'D', source: 'web' });
      expect((await feedRightsService.me(camille.id)).banExpiresAt).toBeNull();
    });

    it('answers notFound for an unknown person', async () => {
      expect(await problemOf(feedRightsService.me('nobody'))).toMatchObject({
        status: 404,
        problem: 'notFound',
      });
    });
  });

  describe('writing from the browser', () => {
    it('fingerprints browser requests by the LNB account: the same key from the game is another request', async () => {
      const camille = await person('Camille Roux', { accounts: 2 });
      const key = randomUUID();
      const first = await sitePost(camille, 'Salut', { key });
      expect((await sitePost(camille, '  Salut ', { key })).replayed).toBe(true);
      expect(await problemOf(post(camille, 'Salut', { key }))).toMatchObject({
        status: 409,
        problem: 'idempotencyMismatch',
      });
      const mika = await person('Mika Lefort');
      expect(await problemOf(sitePost(mika, 'Salut', { key }))).toMatchObject({
        problem: 'idempotencyMismatch',
      });
      expect(first.post.mine).toBe(true);
    });

    it('lets a person delete their own posts only, whatever their role', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: theirs } = await post(camille, 'À Camille');
      const { post: own } = await sitePost(lune, 'À Lune');
      expect(
        await problemOf(
          feedPostService.remove({ actor: site(lune), postId: theirs.id, ownOnly: true }),
        ),
      ).toMatchObject({ status: 403, problem: 'notAllowed' });
      await feedPostService.remove({ actor: site(lune), postId: own.id, ownOnly: true });
      // Again: 204 for the author, notFound for anyone else.
      await feedPostService.remove({ actor: site(lune), postId: own.id, ownOnly: true });
      expect(
        await problemOf(
          feedPostService.remove({ actor: site(camille), postId: own.id, ownOnly: true }),
        ),
      ).toMatchObject({ status: 404, problem: 'notFound' });
      // A person with no linked account still deletes what they posted.
      const { post: mine } = await post(camille, 'Encore');
      await unlink(camille.uuid);
      await feedPostService.remove({ actor: site(camille), postId: mine.id, ownOnly: true });
    });

    it('likes and pins from the browser need a linked account, not the posting account', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer', accounts: 2 });
      const { post: announcement } = await post(kael, 'Annonce', { feed: 'announcements' });
      await feedRightsService.setPostingAccount(kael.id, kael.accounts[1]!.uuid);
      expect(
        await feedLikeService.setLiked({ actor: site(kael), postId: announcement.id, liked: true }),
      ).toMatchObject({ likes: 1, liked: true });
      expect(
        (await feedPinService.pin({ actor: site(kael), postId: announcement.id })).pinned,
      ).toHaveLength(1);
      for (const account of kael.accounts) await unlink(account.uuid);
      expect(
        await problemOf(
          feedLikeService.setLiked({ actor: site(kael), postId: announcement.id, liked: false }),
        ),
      ).toMatchObject({ status: 404, problem: 'notLinked' });
      expect(
        await problemOf(feedPinService.unpin({ actor: site(kael), postId: announcement.id })),
      ).toMatchObject({ status: 404, problem: 'notLinked' });
    });

    it('shows the browser reader the same views as the game, for its whole account', async () => {
      const camille = await person('Camille Roux', { accounts: 2 });
      const mika = await person('Mika Lefort');
      const { post: fromGame } = await post({ uuid: camille.accounts[1]!.uuid }, 'Du jeu', {
        anonymous: true,
      });
      await reply(mika, fromGame.id);
      const { posts } = await feedViewService.viewsOf({ userId: camille.id }, [fromGame.id]);
      expect(posts[0]).toMatchObject({ mine: true, canDelete: true, unseenReplies: 1 });
      expect(posts[0]!.author).toMatchObject({ uuid: camille.accounts[1]!.uuid });
      const forMika = await feedViewService.viewsOf({ userId: mika.id }, [
        fromGame.id,
        randomUUID(),
      ]);
      expect(forMika.posts).toHaveLength(1);
      expect(forMika.posts[0]!.author).toBeNull();
      // The thread mark from the browser clears the marker in game.
      await feedReadStateService.markThreadSeen({ userId: camille.id }, fromGame.id);
      const { views } = await feedViewService.views({
        viewers: [camille.uuid],
        ids: [fromGame.id],
      });
      expect(views[0]!.posts[0]!.unseenReplies).toBe(0);
    });
  });

  describe('the moderation table (GET /api/feed/admin/posts)', () => {
    it('searches the text, the name and the username, with % and _ matching themselves', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika_Lefort');
      const { post: percent } = await post(camille, 'Sûr à 100% !');
      const { post: underscore } = await post(camille, 'mot_clé');
      await post(camille, 'motXclé et 100 fois');
      const { post: backslash } = await post(camille, 'chemin\\dossier');
      const { post: byMika } = await post(mika, 'Rien à voir');

      const ids = async (q: string) =>
        (await feedAdminService.list(query({ q }))).items.map((item) => item.id);
      expect(await ids('0%')).toEqual([percent.id]);
      expect(await ids('t_c')).toEqual([underscore.id]);
      expect(await ids('n\\d')).toEqual([backslash.id]);
      expect(await ids('%%')).toEqual([]);
      expect(await ids('__')).toEqual([]);
      // The person's name, case-insensitively, and the Minecraft username.
      expect(await ids('a_l')).toEqual([byMika.id]);
      expect(await ids('mika_')).toEqual([byMika.id]);
      expect(await ids(mika.username.toLowerCase())).toEqual([byMika.id]);
      expect((await ids('CAMILLE')).length).toBe(4);
    });

    it('shows anonymous authors, deleted rows with who, when and the purge date', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: anonymous } = await post(camille, 'Secret', { anonymous: true });
      const { post: byModerator } = await post(mika, 'Hors sujet');
      const { post: byAuthor } = await post(mika, 'Oups');
      const { post: thread } = await post(camille, 'Fil');
      const { post: inThread } = await reply(mika, thread.id);
      await feedPostService.remove({
        actor: server(lune),
        postId: byModerator.id,
        reason: 'Hors sujet',
      });
      await feedPostService.remove({ actor: server(mika), postId: byAuthor.id });
      await feedPostService.remove({ actor: server(lune), postId: thread.id, reason: 'Spam' });

      const { items, summary } = await feedAdminService.list(query());
      const byId = new Map(items.map((item) => [item.id, item]));
      expect(byId.get(anonymous.id)).toMatchObject({
        anonymous: true,
        author: { uuid: camille.uuid, username: camille.username, realName: 'Camille R.' },
        authorUserId: camille.id,
        source: 'server',
        deletedAt: null,
        deletedBy: null,
        purgeAt: null,
      });
      const moderated = byId.get(byModerator.id)!;
      expect(moderated).toMatchObject({
        deletedBy: { userId: lune.id, name: 'Lune Garnier' },
        deletedCause: 'moderator',
        deletedReason: 'Hors sujet',
      });
      expect(Date.parse(moderated.purgeAt!) - Date.parse(moderated.deletedAt!)).toBe(30 * DAY);
      expect(byId.get(byAuthor.id)).toMatchObject({
        deletedBy: null,
        deletedCause: 'author',
        deletedReason: null,
      });
      expect(byId.get(inThread.id)).toMatchObject({
        deletedBy: null,
        deletedCause: 'thread',
        deletedReason: null,
      });
      expect(byId.get(thread.id)).toMatchObject({
        deletedCause: 'moderator',
        deletedReason: 'Spam',
      });
      expect(summary).toEqual({ last30Days: 5, deleted: 4 });
    });

    it('filters by feed, replies, anonymity, deletion and author, and sums what matches', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: announcement } = await post(lune, 'Annonce', { feed: 'announcements' });
      const { post: global } = await post(camille, 'Global', { anonymous: true });
      const { post: answer } = await reply(camille, announcement.id, null, { anonymous: true });
      const { post: old } = await post(camille, 'Vieux');
      await feedPostService.remove({ actor: server(camille), postId: global.id });
      await db
        .update(feedPost)
        .set({ createdAt: new Date(Date.now() - 31 * DAY) })
        .where(eq(feedPost.id, old.id));

      const list = async (overrides: Partial<FeedAdminListQuery>) => {
        const result = await feedAdminService.list(query(overrides));
        return { ids: result.items.map((item) => item.id).sort(), summary: result.summary };
      };
      expect(await list({ feeds: ['announcements'] })).toEqual({
        ids: [announcement.id, answer.id].sort(),
        summary: { last30Days: 2, deleted: 0 },
      });
      expect((await list({ replies: 'true' })).ids).toEqual([answer.id]);
      expect((await list({ anonymous: 'true' })).ids).toEqual([global.id, answer.id].sort());
      expect(await list({ deleted: 'true' })).toEqual({
        ids: [global.id],
        summary: { last30Days: 1, deleted: 1 },
      });
      // A row older than 30 days is listed, but not counted in the summary.
      expect(await list({ user: camille.id })).toEqual({
        ids: [global.id, answer.id, old.id].sort(),
        summary: { last30Days: 2, deleted: 1 },
      });
      expect(await list({ user: 'nobody' })).toEqual({
        ids: [],
        summary: { last30Days: 0, deleted: 0 },
      });
    });

    it('pages 50 at a time with a cursor, and refuses a forged one with a 400', async () => {
      const camille = await person('Camille Roux');
      for (let i = 0; i < 53; i++) await post(camille, `P${String(i)}`);
      const first = await feedAdminService.list(query());
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();
      const second = await feedAdminService.list(query({ cursor: first.nextCursor! }));
      expect(second.items).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      const all = [...first.items, ...second.items].map((item) => item.id);
      expect(new Set(all).size).toBe(53);
      expect(await problemOf(feedAdminService.list(query({ cursor: 'nope' })))).toMatchObject({
        status: 400,
      });
    });

    // See the HTTP test of the same name: a time past the largest Date throws a RangeError.
    it.fails('refuses a cursor whose time is past the largest date with a 400', async () => {
      const huge = Buffer.from(`[9007199254740991,"${randomUUID()}"]`).toString('base64url');
      expect(await problemOf(feedAdminService.list(query({ cursor: huge })))).toMatchObject({
        status: 400,
      });
    });

    it('opens a row with its whole thread, deleted replies included', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      const { post: first } = await reply(mika, main.id, null, { anonymous: true });
      const { post: second } = await reply(camille, main.id, first.id);
      await feedPostService.remove({ actor: server(lune), postId: first.id, reason: 'Non' });
      const detail = await feedAdminService.detail(second.id);
      expect(detail.post.id).toBe(second.id);
      expect(detail.thread.post.id).toBe(main.id);
      expect(detail.thread.replies.map((row) => [row.id, row.deletedCause])).toEqual([
        [first.id, 'moderator'],
        [second.id, null],
      ]);
      expect(detail.thread.replies[0]!.author).toMatchObject({ uuid: mika.uuid });
      // The line of the reply that answered an anonymous one names nobody, here too.
      expect(detail.post.replyTo).toEqual({ id: first.id, anonymous: true, name: null });
      expect(await problemOf(feedAdminService.detail(randomUUID()))).toMatchObject({
        status: 404,
        problem: 'notFound',
      });
    });
  });
});
