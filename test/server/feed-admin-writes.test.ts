import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { audit, feedPost, user, wardenBan } from '~~/server/db/schema';
import { feedNotificationService } from '~~/server/services/feed/notifications';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';

import { admin, requireTestWardenAdmin } from './feed-admin-helpers';
import { api, plain, problem, refusal, requireTestUser } from './feed-browser-helpers';
import {
  eventsSince,
  latestEvent,
  person,
  post,
  problemOf,
  reply,
  setFlags,
  stubServerUtils,
  viewOf,
  wipe,
} from './feed-helpers';
import type { Person } from './feed-helpers';

import type { AuditAction } from '#shared/utils/audit-actions';

// The admin's writes against the contract (docs/feed.md, "For the admin"): deleting with its
// reason, its audit entry and events, what leaves the browser's and the game's views at once, and
// the announcer role for every kind of person.

const auditOf = (action: AuditAction) =>
  db.select().from(audit).where(eq(audit.action, action)).orderBy(audit.id);

const rowOf = async (id: string) =>
  (await db.select().from(feedPost).where(eq(feedPost.id, id)))[0]!;

const roleOf = async (id: string) =>
  (await db.select({ role: user.role }).from(user).where(eq(user.id, id)))[0]!.role;

describe('the admin’s writes', () => {
  let lune: Person;
  let camille: Person;
  let kael: Person;

  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('requireWardenAdmin', requireTestWardenAdmin);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
    lune = await person('Lune Garnier', { role: 'warden-admin' });
    camille = await person('Camille Roux');
    kael = await person('Kaël Dubois');
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('deleting: the reason', () => {
    it('keeps a reason as typed inside, trimmed at the ends, and audits the same text', async () => {
      const cases: [string, string][] = [
        ['Hors sujet', 'Hors sujet'],
        ['  \n Deux lignes\nici \t', 'Deux lignes\nici'],
        ['Émoji 😀 et accents é', 'Émoji 😀 et accents é'],
        ['<b>pas du html</b> & "guillemets"', '<b>pas du html</b> & "guillemets"'],
      ];
      for (const [typed, kept] of cases) {
        const { post: target } = await post(camille, `Cible ${typed}`);
        expect((await admin.remove(lune, target.id, { reason: typed })).status).toBe(204);
        expect((await rowOf(target.id)).deletedReason).toBe(kept);
      }
      const reasons = (await auditOf('minecraft.feed.delete')).map(
        (entry) => (entry.data as { reason: string }).reason,
      );
      expect(reasons).toEqual(cases.map(([, kept]) => kept));
    });

    it('takes exactly 500 characters, trimmed first, and refuses 501', async () => {
      const { post: a } = await post(camille, 'A');
      const { post: b } = await post(camille, 'B');
      const { post: c } = await post(camille, 'C');
      const { post: d } = await post(camille, 'D');
      expect((await admin.remove(lune, a.id, { reason: 'x'.repeat(500) })).status).toBe(204);
      // Padding does not count: the schema trims before it counts.
      expect((await admin.remove(lune, b.id, { reason: `  ${'y'.repeat(500)}  ` })).status).toBe(
        204,
      );
      expect((await rowOf(b.id)).deletedReason).toBe('y'.repeat(500));
      expect(refusal(await admin.remove(lune, c.id, { reason: 'z'.repeat(501) }))).toEqual(
        plain(400),
      );
      expect(refusal(await admin.remove(lune, d.id, { reason: `${'z'.repeat(501)} ` }))).toEqual(
        plain(400),
      );
      expect((await rowOf(c.id)).deletedAt).toBeNull();
      expect((await rowOf(d.id)).deletedAt).toBeNull();
    });

    it('counts the reason in characters: 300 emoji are 300 characters', async () => {
      const { post: target } = await post(camille, 'F');
      expect((await admin.remove(lune, target.id, { reason: '😀'.repeat(300) })).status).toBe(204);
      const { post: long } = await post(camille, 'G');
      expect(refusal(await admin.remove(lune, long.id, { reason: '😀'.repeat(501) }))).toEqual(
        plain(400),
      );
    });

    it('treats a missing, empty or blank reason as none, in the row and in the audit entry', async () => {
      const bodies = [undefined, {}, { reason: '' }, { reason: ' \n\t ' }];
      for (const body of bodies) {
        const { post: target } = await post(camille, `Cible ${JSON.stringify(body)}`);
        expect((await admin.remove(lune, target.id, body)).status).toBe(204);
        expect((await rowOf(target.id)).deletedReason).toBeNull();
      }
      for (const entry of await auditOf('minecraft.feed.delete')) {
        expect(entry.data).toHaveProperty('reason', null);
      }
    });

    it('refuses a body with the wrong shape, and changes nothing', async () => {
      const { post: target } = await post(camille);
      for (const body of [
        { reason: null },
        { reason: ['x'] },
        { reason: { text: 'x' } },
        { reason: true },
        '"just a string"',
        '[]',
        '42',
        '{"reason":',
      ]) {
        expect(refusal(await admin.remove(lune, target.id, body)), JSON.stringify(body)).toEqual(
          plain(400),
        );
      }
      expect((await rowOf(target.id)).deletedAt).toBeNull();
      expect(await auditOf('minecraft.feed.delete')).toEqual([]);
    });

    it('ignores fields it does not know', async () => {
      const { post: target } = await post(camille);
      const answer = await admin.remove(lune, target.id, {
        reason: 'Ok',
        deletedBy: 'someone-else',
        deletedCause: 'author',
        purgeAt: '2020-01-01T00:00:00Z',
      });
      expect(answer.status).toBe(204);
      expect(await rowOf(target.id)).toMatchObject({
        deletedByUserId: lune.id,
        deletedCause: 'moderator',
        deletedReason: 'Ok',
      });
    });
  });

  describe('deleting: what it does', () => {
    it('audits who, whom and what: the author as target, the row’s facts as data', async () => {
      const { post: main } = await post(camille, 'Fil', { anonymous: true });
      const { post: answer } = await reply(kael, main.id);
      const { post: news } = await post(lune, 'Annonce', { feed: 'announcements' });
      await admin.remove(lune, answer.id, { reason: 'Un' });
      await admin.remove(lune, main.id, { reason: 'Deux' });
      const [mine] = await auditOf('minecraft.feed.delete');
      expect(mine).toMatchObject({
        source: 'site',
        actorUserId: lune.id,
        targetUserId: kael.id,
        data: {
          postId: answer.id,
          threadId: main.id,
          feed: 'global',
          reply: true,
          anonymous: false,
          reason: 'Un',
        },
      });
      const entries = await auditOf('minecraft.feed.delete');
      expect(entries).toHaveLength(2);
      expect(entries[1]).toMatchObject({
        targetUserId: camille.id,
        data: { postId: main.id, threadId: null, reply: false, anonymous: true, reason: 'Deux' },
      });
      expect(Object.keys(entries[1]!.data as object).sort()).toEqual(
        ['anonymous', 'feed', 'postId', 'reason', 'reply', 'threadId'].sort(),
      );
      // The announcement and the author's own post were never touched.
      expect((await rowOf(news.id)).deletedAt).toBeNull();
    });

    it('audits an announcement with its feed, by a site admin as well', async () => {
      const root = await person('Racine', { role: 'admin' });
      const { post: news } = await post(lune, 'Annonce', { feed: 'announcements' });
      await admin.remove(root, news.id);
      const [entry] = await auditOf('minecraft.feed.delete');
      expect(entry).toMatchObject({
        actorUserId: root.id,
        targetUserId: lune.id,
        data: { feed: 'announcements', reply: false, reason: null },
      });
    });

    it('deletes a main post with its replies, its pin and its notifications, at once', async () => {
      const ana = await person('Ana Lopez', { role: 'feed-announcer' });
      const { post: news } = await post(ana, 'Annonce', { feed: 'announcements' });
      await feedPinService.pin({ actor: { source: 'server', player: lune.uuid }, postId: news.id });
      const { post: first } = await reply(camille, news.id);
      const { post: second } = await reply(kael, news.id, first.id);
      expect((await feedNotificationService.list()).items.length).toBeGreaterThan(0);
      const from = await latestEvent();
      expect((await admin.remove(lune, news.id, { reason: 'Périmée' })).status).toBe(204);

      const rows = new Map(
        (await db.select().from(feedPost).where(eq(feedPost.threadId, news.id))).map((row) => [
          row.id,
          row,
        ]),
      );
      for (const id of [first.id, second.id]) {
        expect(rows.get(id), id).toMatchObject({
          deletedCause: 'thread',
          deletedByUserId: lune.id,
          deletedReason: null,
        });
      }
      expect(await rowOf(news.id)).toMatchObject({
        pinnedAt: null,
        pinnedByUserId: null,
        deletedCause: 'moderator',
      });
      // One audit entry: for the post, not for each reply that went with it.
      expect(await auditOf('minecraft.feed.delete')).toHaveLength(1);
      // No notification of the thread is left waiting.
      expect((await feedNotificationService.list()).items).toEqual([]);

      const events = await eventsSince(from);
      const deleted = events.filter((event) => event.type === 'deleted');
      expect(deleted).toHaveLength(1);
      const gone = deleted[0]!.data as { items?: { id: string }[]; posts?: { id: string }[] };
      const goneIds = (gone.items ?? gone.posts ?? []).map((item) => item.id).sort();
      expect(goneIds).toEqual([news.id, first.id, second.id].sort());
      expect(events.map((event) => event.type)).toContain('pins');
    });

    it('drops the notification of a reply deleted alone, and keeps the others', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: mine } = await reply(kael, main.id);
      const { post: other } = await reply(lune, main.id);
      const before = (await feedNotificationService.list()).items;
      expect(before.length).toBeGreaterThanOrEqual(2);
      await admin.remove(lune, mine.id);
      const after = (await feedNotificationService.list()).items;
      expect(after.length).toBe(before.length - 1);
      expect((await rowOf(other.id)).deletedAt).toBeNull();
    });

    it('drops the waiting notification of a deleted announcement', async () => {
      const { post: news } = await post(lune, 'Annonce', { feed: 'announcements' });
      expect((await feedNotificationService.list()).items).toHaveLength(1);
      await admin.remove(lune, news.id);
      expect((await feedNotificationService.list()).items).toEqual([]);
    });

    it('takes the post out of the browser’s and the game’s views at once', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(kael, main.id);
      const { post: news } = await post(lune, 'Annonce', { feed: 'announcements' });
      const asBrowser = async () => ({
        page: (await api.page(kael, 'feed=global')).body as { posts: { id: string }[] },
        thread: await api.thread(kael, main.id),
      });
      expect((await asBrowser()).page.posts.map((view) => view.id)).toEqual([main.id]);
      expect(await viewOf(kael, answer.id)).toBeDefined();

      await admin.remove(lune, answer.id);
      expect(await viewOf(kael, answer.id)).toBeUndefined();
      expect((await asBrowser()).thread.body).toMatchObject({ replies: [] });
      expect((await api.page(kael, 'feed=global')).body).toMatchObject({
        posts: [{ id: main.id, replies: 0 }],
      });

      await admin.remove(lune, main.id);
      await admin.remove(lune, news.id);
      const browser = await asBrowser();
      expect(browser.page.posts).toEqual([]);
      expect(refusal(browser.thread)).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.like(kael, main.id))).toEqual(problem(404, 'notFound'));
      expect(
        refusal(
          await api.reply(kael, main.id, {
            idempotencyKey: crypto.randomUUID(),
            replyTo: null,
            text: 'Encore',
            anonymous: false,
          }),
        ),
      ).toEqual(problem(404, 'notFound'));
      expect(await viewOf(kael, main.id)).toBeUndefined();
      const game = await feedViewService.page({ who: { player: kael.uuid }, feed: 'global' });
      expect(game.posts).toEqual([]);
      const announcements = await feedViewService.page({
        who: { player: kael.uuid },
        feed: 'announcements',
      });
      expect(announcements).toMatchObject({ pinned: [], posts: [] });
      expect(
        await problemOf(feedViewService.thread({ who: { player: kael.uuid }, id: main.id })),
      ).toMatchObject({ status: 404, problem: 'notFound' });
    });

    it('leaves the post gone for its author and for moderators, and a repeat by the author is 204', async () => {
      const { post: mine } = await post(camille, 'À moi');
      await admin.remove(lune, mine.id);
      expect(await viewOf(camille, mine.id)).toBeUndefined();
      expect(refusal(await api.thread(lune, mine.id))).toEqual(problem(404, 'notFound'));
      expect((await api.remove(camille, mine.id)).status).toBe(204);
      expect((await rowOf(mine.id)).deletedCause).toBe('moderator');
    });

    it('fixes the counts of a deleted reply: the thread’s and the reply it answered', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: first } = await reply(kael, main.id);
      const { post: second } = await reply(camille, main.id, first.id);
      const { post: third } = await reply(kael, main.id);
      expect(await rowOf(main.id)).toMatchObject({ replyCount: 3 });
      expect(await rowOf(first.id)).toMatchObject({ replyCount: 1 });
      const from = await latestEvent();
      await admin.remove(lune, second.id);
      expect(await rowOf(main.id)).toMatchObject({ replyCount: 2 });
      expect(await rowOf(first.id)).toMatchObject({ replyCount: 0 });
      expect(await rowOf(third.id)).toMatchObject({ deletedAt: null });
      const counts = (await eventsSince(from)).filter((event) => event.type === 'counts');
      expect(counts).toHaveLength(1);
      // Deleting the same reply again, or the first reply, never takes a count below zero.
      await admin.remove(lune, second.id);
      await admin.remove(lune, first.id);
      expect((await rowOf(main.id)).replyCount).toBe(1);
      expect((await rowOf(first.id)).replyCount).toBeGreaterThanOrEqual(0);
    });

    it('sends one deleted event for a reply, none for an unknown post, none on a repeat', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(kael, main.id);
      const from = await latestEvent();
      await admin.remove(lune, answer.id);
      const types = (await eventsSince(from)).map((event) => event.type);
      expect(types.filter((type) => type === 'deleted')).toHaveLength(1);
      const after = await latestEvent();
      await admin.remove(lune, answer.id);
      await admin.remove(lune, crypto.randomUUID());
      expect(await eventsSince(after)).toEqual([]);
    });

    it('answers 204 for a repeat by another moderator, and for a post its author deleted', async () => {
      const root = await person('Racine', { role: 'admin' });
      const { post: first } = await post(camille, 'Un');
      const { post: second } = await post(camille, 'Deux');
      await admin.remove(lune, first.id, { reason: 'Premier' });
      expect((await admin.remove(root, first.id, { reason: 'Second' })).status).toBe(204);
      expect(await rowOf(first.id)).toMatchObject({
        deletedByUserId: lune.id,
        deletedReason: 'Premier',
      });
      expect((await api.remove(camille, second.id)).status).toBe(204);
      expect((await admin.remove(lune, second.id, { reason: 'Trop tard' })).status).toBe(204);
      expect(await rowOf(second.id)).toMatchObject({
        deletedCause: 'author',
        deletedReason: null,
        deletedByUserId: camille.id,
      });
      expect(await auditOf('minecraft.feed.delete')).toHaveLength(1);
    });

    it('answers 204 for a reply that went with its thread, and leaves its cause', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(kael, main.id);
      await admin.remove(lune, main.id);
      expect((await admin.remove(lune, answer.id, { reason: 'Aussi' })).status).toBe(204);
      expect(await rowOf(answer.id)).toMatchObject({ deletedCause: 'thread', deletedReason: null });
      expect(await auditOf('minecraft.feed.delete')).toHaveLength(1);
    });

    it('deletes once when two moderators delete the same post together', async () => {
      const root = await person('Racine', { role: 'admin' });
      const { post: target } = await post(camille, 'Course');
      await reply(kael, target.id);
      const answers = await Promise.all([
        admin.remove(lune, target.id, { reason: 'A' }),
        admin.remove(root, target.id, { reason: 'B' }),
      ]);
      expect(answers.map((answer) => answer.status)).toEqual([204, 204]);
      expect(await auditOf('minecraft.feed.delete')).toHaveLength(1);
      expect((await rowOf(target.id)).deletedCause).toBe('moderator');
    });

    it('does not touch another thread, another author, or the likes that stay', async () => {
      const { post: keep } = await post(camille, 'Je reste');
      const { post: go } = await post(camille, 'Je pars');
      await api.like(kael, keep.id);
      await admin.remove(lune, go.id);
      expect(await rowOf(keep.id)).toMatchObject({ deletedAt: null, likeCount: 1 });
      expect(await viewOf(kael, keep.id)).toMatchObject({ liked: true, likes: 1 });
    });

    it('lets the author of a deleted post write again', async () => {
      const { post: first } = await post(camille, 'Un');
      await admin.remove(lune, first.id);
      const fresh = await post(camille, 'Un');
      expect(fresh.post.id).not.toBe(first.id);
      expect(await viewOf(kael, fresh.post.id)).toBeDefined();
    });

    it('purges nothing itself: the row, its text and its author stay for 30 days', async () => {
      const { post: target } = await post(camille, 'Gardé un mois');
      await admin.remove(lune, target.id, { reason: 'Test' });
      expect(await rowOf(target.id)).toMatchObject({
        text: 'Gardé un mois',
        authorUserId: camille.id,
      });
    });
  });

  describe('the announcer role', () => {
    it('gives, keeps and takes the role with one audit entry per real change, by this actor', async () => {
      for (const announcer of [false, true, true, false, false]) {
        await admin.setAnnouncer(lune, camille.id, { announcer });
      }
      const entries = await auditOf('minecraft.feed.announcer');
      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry).toMatchObject({
          source: 'site',
          actorUserId: lune.id,
          targetUserId: camille.id,
        });
      }
      expect(entries.map((entry) => entry.data)).toEqual([
        { announcer: true },
        { announcer: false },
      ]);
    });

    it('sends the rights event only for a real change, to every linked account of the person', async () => {
      const twin = await person('Jumeau', { accounts: 2 });
      const from = await latestEvent();
      await admin.setAnnouncer(lune, twin.id, { announcer: false });
      expect(await eventsSince(from)).toEqual([]);
      await admin.setAnnouncer(lune, twin.id, { announcer: true });
      await admin.setAnnouncer(lune, twin.id, { announcer: true });
      const rights = (await eventsSince(from)).filter((event) => event.type === 'rights');
      expect(rights).toHaveLength(1);
      expect((rights[0]!.data as { uuids: string[] }).uuids.sort()).toEqual(
        twin.accounts.map((account) => account.uuid).sort(),
      );
    });

    it('keeps every other role, in order, when it gives and takes the role', async () => {
      const mixed = await person('Mixte', { role: 'events-manager,economy-admin' });
      await admin.setAnnouncer(lune, mixed.id, { announcer: true });
      expect(await roleOf(mixed.id)).toBe('events-manager,economy-admin,feed-announcer');
      await admin.setAnnouncer(lune, mixed.id, { announcer: false });
      expect(await roleOf(mixed.id)).toBe('events-manager,economy-admin');
      const holder = await person('Titulaire', { role: 'feed-announcer,events-manager' });
      await admin.setAnnouncer(lune, holder.id, { announcer: false });
      expect(await roleOf(holder.id)).toBe('events-manager');
    });

    it('lets a person announce after it is given, and not after it is taken', async () => {
      const body = { feed: 'announcements' as const };
      expect(refusal(await api.post(camille, { ...(await postBodyFor(body)) })).data).toMatchObject(
        {
          problem: 'notAllowed',
        },
      );
      await admin.setAnnouncer(lune, camille.id, { announcer: true });
      expect((await api.post(camille, await postBodyFor(body))).status).toBe(201);
      await admin.setAnnouncer(lune, camille.id, { announcer: false });
      expect(refusal(await api.post(camille, await postBodyFor(body))).data).toMatchObject({
        problem: 'notAllowed',
      });
    });

    it('shows the role of a banned announcer and of one with no linked account, and takes it back', async () => {
      const banned = await person('Banni', { role: 'feed-announcer' });
      const unlinked = await person('Sans compte', { role: 'feed-announcer', accounts: 0 });
      await db.insert(wardenBan).values({ userId: banned.id, reason: 'Test', source: 'web' });
      for (const target of [banned, unlinked]) {
        expect((await admin.announcer(lune, target.id)).body).toEqual({
          userId: target.id,
          announcer: true,
          viaRole: false,
        });
        expect(
          (await admin.setAnnouncer(lune, target.id, { announcer: false })).body,
        ).toMatchObject({ announcer: false });
        expect(await roleOf(target.id)).toBeNull();
      }
      expect(await auditOf('minecraft.feed.announcer')).toHaveLength(2);
    });

    it('gives the role to a banned person or to one with no linked account, who then cannot use it', async () => {
      const banned = await person('Banni');
      const unlinked = await person('Sans compte', { accounts: 0 });
      await db.insert(wardenBan).values({ userId: banned.id, reason: 'Test', source: 'web' });
      for (const target of [banned, unlinked]) {
        expect((await admin.setAnnouncer(lune, target.id, { announcer: true })).body).toEqual({
          userId: target.id,
          announcer: true,
          viaRole: false,
        });
        expect(await roleOf(target.id)).toBe('feed-announcer');
      }
      expect(
        refusal(await api.post(banned, await postBodyFor({ feed: 'announcements' }))).status,
      ).toBe(403);
    });

    it('says a moderator announces by role, banned or not, and keeps their role whatever is asked', async () => {
      const both = await person('Les deux', { role: 'warden-admin,feed-announcer' });
      const root = await person('Racine', { role: 'admin' });
      const bannedMod = await person('Modo banni', { role: 'warden-admin' });
      await db.insert(wardenBan).values({ userId: bannedMod.id, reason: 'Test', source: 'web' });
      for (const target of [both, root, bannedMod]) {
        const before = await roleOf(target.id);
        expect((await admin.announcer(lune, target.id)).body).toEqual({
          userId: target.id,
          announcer: true,
          viaRole: true,
        });
        expect(refusal(await admin.setAnnouncer(lune, target.id, { announcer: false }))).toEqual(
          problem(409, 'impliedByRole'),
        );
        expect((await admin.setAnnouncer(lune, target.id, { announcer: true })).status).toBe(200);
        expect(await roleOf(target.id)).toBe(before);
      }
      expect(await auditOf('minecraft.feed.announcer')).toEqual([]);
    });

    it('lets a moderator be asked about themselves, and refuses to take the role from themselves', async () => {
      expect((await admin.announcer(lune, lune.id)).body).toMatchObject({ viaRole: true });
      expect(refusal(await admin.setAnnouncer(lune, lune.id, { announcer: false }))).toEqual(
        problem(409, 'impliedByRole'),
      );
    });

    it('refuses a ghost account both ways, even one that holds the role, and an unknown person', async () => {
      const ghost = await person('Fantôme', { ghost: true, accounts: 0 });
      const ghostHolder = await person('Fantôme titulaire', {
        ghost: true,
        accounts: 0,
        role: 'feed-announcer',
      });
      for (const target of [ghost, ghostHolder]) {
        for (const announcer of [true, false]) {
          expect(
            refusal(await admin.setAnnouncer(lune, target.id, { announcer })),
            target.name,
          ).toEqual(problem(409, 'isGhost'));
        }
      }
      expect(await roleOf(ghostHolder.id)).toBe('feed-announcer');
      expect(await roleOf(ghost.id)).toBeNull();
      expect(refusal(await admin.setAnnouncer(lune, 'nobody', { announcer: true })).data).toEqual({
        problem: 'notFound',
      });
      expect(refusal(await admin.announcer(lune, 'nobody')).data).toEqual({ problem: 'notFound' });
      expect(await auditOf('minecraft.feed.announcer')).toEqual([]);
    });

    it('changes the role once when two moderators set it together', async () => {
      const root = await person('Racine', { role: 'admin' });
      const answers = await Promise.all([
        admin.setAnnouncer(lune, camille.id, { announcer: true }),
        admin.setAnnouncer(root, camille.id, { announcer: true }),
      ]);
      expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
      expect(await roleOf(camille.id)).toBe('feed-announcer');
      expect(await auditOf('minecraft.feed.announcer')).toHaveLength(1);
    });

    it('takes the target from the path, never from the body', async () => {
      const answer = await admin.setAnnouncer(lune, camille.id, {
        announcer: true,
        userId: kael.id,
      });
      expect(answer.body).toMatchObject({ userId: camille.id });
      expect(await roleOf(kael.id)).toBeNull();
    });
  });
});

async function postBodyFor(overrides: Record<string, unknown>) {
  const { postBody } = await import('./feed-browser-helpers');
  return postBody(overrides);
}
