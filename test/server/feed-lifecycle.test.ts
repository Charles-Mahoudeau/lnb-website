import { randomUUID } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  audit,
  feedLike,
  feedMember,
  feedNotification,
  feedPost,
  feedThreadSeen,
  minecraftAccount,
  user,
} from '~~/server/db/schema';
import { feedLikeService } from '~~/server/services/feed/likes';
import { feedNotificationService } from '~~/server/services/feed/notifications';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedPurgeService } from '~~/server/services/feed/purge';
import { feedReadStateService } from '~~/server/services/feed/read-state';
import { feedRightsService } from '~~/server/services/feed/rights';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';
import { usersService } from '~~/server/services/users';

import {
  eventsSince,
  latestEvent,
  person,
  post,
  reply,
  server,
  setFlags,
  viewOf,
  wipe,
} from './feed-helpers';

// What happens to Feed rows over time: keyset pages with equal times, the read marks at the
// millisecond, the notification queue (feed-mod.md 4.12, 9), the nightly purge at exactly 30 days,
// and accounts deleted one or several at once (docs/feed.md, "Account deletion").

vi.mock('nitropack/runtime', () => ({ defineTask: <T>(task: T) => task }));

const DAY = 86_400_000;
const KEEP = 30 * DAY;

describe('Feed over time', () => {
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  describe('time precision and keyset pages', () => {
    it('stores createdAt at the millisecond, as the answers and cursors carry it', async () => {
      const camille = await person('Camille Roux');
      const { post: created } = await post(camille);
      const { rows } = await db.execute<{ micros: string; iso: string }>(sql`
        select extract(microseconds from created_at)::bigint % 1000 as micros,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as iso
        from feed_post where id = ${created.id}`);
      expect(Number(rows[0]!.micros)).toBe(0);
      expect(rows[0]!.iso).toBe(created.createdAt);
    });

    it('pages posts with equal times without losing or repeating any', async () => {
      const mika = await person('Mika Lefort');
      const ids: string[] = [];
      for (let i = 0; i < 9; i++) ids.push((await post(mika, `G${String(i)}`)).post.id);
      // Three groups of three posts sharing one millisecond each.
      const base = Date.parse('2026-11-23T20:14:05.123Z');
      for (const [i, id] of ids.entries()) {
        await db
          .update(feedPost)
          .set({ createdAt: new Date(base + Math.floor(i / 3)) })
          .where(eq(feedPost.id, id));
      }
      for (const limit of [1, 2, 3, 4]) {
        const seen: string[] = [];
        let before: string | undefined;
        for (let guard = 0; guard < 20; guard++) {
          const page = await feedViewService.page({
            who: { player: mika.uuid },
            feed: 'global',
            limit,
            before,
          });
          seen.push(...page.posts.map((row) => row.id));
          if (!page.next) break;
          before = page.next;
        }
        expect(seen, `limit ${String(limit)}`).toHaveLength(9);
        expect(new Set(seen).size).toBe(9);
        // Newest first, then by ID descending within one millisecond.
        const expected = [...ids].sort((a, b) => {
          const ta = Math.floor(ids.indexOf(a) / 3);
          const tb = Math.floor(ids.indexOf(b) / 3);
          return tb - ta || (a < b ? 1 : -1);
        });
        expect(seen).toEqual(expected);
      }
    });

    it('pages replies with equal times without losing or repeating any', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) ids.push((await reply(mika, main.id)).post.id);
      const at = new Date('2026-11-23T20:14:05.500Z');
      await db.update(feedPost).set({ createdAt: at }).where(inArray(feedPost.id, ids));
      const seen: string[] = [];
      let after: string | undefined;
      for (let guard = 0; guard < 20; guard++) {
        const thread = await feedViewService.thread({
          who: { player: camille.uuid },
          id: main.id,
          limit: 2,
          after,
        });
        seen.push(...thread.replies.map((row) => row.id));
        if (!thread.next) break;
        after = thread.next;
      }
      expect(seen).toEqual([...ids].sort());
    });

    it('marks a feed seen at the exact millisecond of the newest post shown', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: g1 } = await post(mika, 'G1');
      const at = new Date(g1.createdAt);
      const unread = async () => (await feedRightsService.playerState(camille.uuid)).unread;
      await feedReadStateService.markFeedSeen(
        { player: camille.uuid },
        'global',
        new Date(at.getTime() - 1),
      );
      expect((await unread()).global).toBe(true);
      await feedReadStateService.markFeedSeen({ player: camille.uuid }, 'global', at);
      expect((await unread()).global).toBe(false);
      // A post in the same millisecond as the one seen doesn't raise the dot; one later does.
      const { post: g2 } = await post(mika, 'G2');
      await db.update(feedPost).set({ createdAt: at }).where(eq(feedPost.id, g2.id));
      expect((await unread()).global).toBe(false);
      await db
        .update(feedPost)
        .set({ createdAt: new Date(at.getTime() + 1) })
        .where(eq(feedPost.id, g2.id));
      expect((await unread()).global).toBe(true);
      // Replies, deleted posts and one's own posts never raise it.
      await db.update(feedPost).set({ createdAt: at }).where(eq(feedPost.id, g2.id));
      await reply(mika, g1.id);
      const { post: gone } = await post(mika, 'Parti');
      await feedPostService.remove({ actor: server(mika), postId: gone.id });
      await post(camille, 'À moi');
      expect((await unread()).global).toBe(false);
      // Announcements have their own dot.
      expect((await unread()).announcements).toBe(false);
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      await post(lune, 'Annonce', { feed: 'announcements' });
      expect(await unread()).toEqual({ announcements: true, global: false });
    });

    it('clears unseen replies at the thread mark, and counts only answers to the viewer', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const nina = await person('Nina Petit');
      const { post: main } = await post(camille, 'Fil');
      const { post: mikaReply } = await reply(mika, main.id);
      const { post: camilleReply } = await reply(camille, main.id, mikaReply.id);
      // Nina answers Camille's reply: counted on the main post (in its thread, to Camille) and on
      // Camille's reply. Mika answering Mika is never Camille's marker.
      const { post: ninaAnswer } = await reply(nina, main.id, camilleReply.id);
      await reply(mika, main.id, mikaReply.id);
      expect((await viewOf(camille, main.id))!.unseenReplies).toBe(2);
      expect((await viewOf(camille, camilleReply.id))!.unseenReplies).toBe(1);
      expect((await viewOf(mika, mikaReply.id))!.unseenReplies).toBe(1);
      expect((await viewOf(camille, ninaAnswer.id))!.answersMe).toBe(true);
      expect((await viewOf(mika, ninaAnswer.id))!.answersMe).toBe(false);
      // Camille's own answer to herself raises nothing.
      const { post: self } = await reply(camille, main.id, camilleReply.id);
      expect(self.answersMe).toBe(false);
      expect((await viewOf(camille, camilleReply.id))!.unseenReplies).toBe(1);

      await feedReadStateService.markThreadSeen({ player: camille.uuid }, main.id);
      expect((await viewOf(camille, main.id))!.unseenReplies).toBe(0);
      expect((await viewOf(camille, camilleReply.id))!.unseenReplies).toBe(0);
      // A deleted answer stops counting.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const { post: late } = await reply(nina, main.id);
      expect((await viewOf(camille, main.id))!.unseenReplies).toBe(1);
      await feedPostService.remove({ actor: server(nina), postId: late.id });
      expect((await viewOf(camille, main.id))!.unseenReplies).toBe(0);
      // From her second account, in the browser, the same marks.
      const [member] = await db
        .select()
        .from(feedThreadSeen)
        .where(eq(feedThreadSeen.userId, camille.id));
      expect(member!.threadId).toBe(main.id);
    });
  });

  describe('the notification queue', () => {
    it('gives players [] once every account of the recipient is unlinked', async () => {
      const camille = await person('Camille Roux', { accounts: 2 });
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      await reply(mika, main.id);
      await db
        .update(minecraftAccount)
        .set({ unlinkedAt: new Date() })
        .where(eq(minecraftAccount.uuid, camille.accounts[0]!.uuid));
      expect((await feedNotificationService.list()).items[0]!.players).toEqual([
        camille.accounts[1]!.uuid,
      ]);
      await db
        .update(minecraftAccount)
        .set({ unlinkedAt: new Date() })
        .where(eq(minecraftAccount.userId, camille.id));
      const [item] = (await feedNotificationService.list()).items;
      expect(item).toMatchObject({ kind: 'reply', players: [], except: [] });
    });

    it('leaves the author’s unlinked accounts out of an announcement’s except list', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer', accounts: 2 });
      await post(kael, 'Annonce', { feed: 'announcements' });
      await db
        .update(minecraftAccount)
        .set({ unlinkedAt: new Date() })
        .where(eq(minecraftAccount.uuid, kael.accounts[1]!.uuid));
      expect((await feedNotificationService.list()).items[0]!.except).toEqual([kael.uuid]);
    });

    it('notifies the author of the reply answered, not of the main post, and nobody for themself', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const nina = await person('Nina Petit');
      const { post: main } = await post(camille, 'Fil');
      const { post: mikaReply } = await reply(mika, main.id);
      await reply(nina, main.id, mikaReply.id);
      await reply(mika, main.id, mikaReply.id);
      await reply(camille, main.id);
      const { items } = await feedNotificationService.list();
      expect(items.map((item) => item.players)).toEqual([[camille.uuid], [mika.uuid]]);
      // Likes and Global posts notify nobody.
      await feedLikeService.setLiked({ actor: server(mika), postId: main.id, liked: true });
      await post(mika, 'Global');
      expect((await feedNotificationService.list()).items).toHaveLength(2);
    });

    it('pages 100 at a time, oldest first, with more while some are left', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      for (let i = 0; i < 101; i++) await reply(mika, main.id, null, { text: `R${String(i)}` });
      const first = await feedNotificationService.list();
      expect(first.items).toHaveLength(100);
      expect(first.more).toBe(true);
      expect(first.items[0]!.post.text).toBe('R0');
      const times = first.items.map((item) => item.createdAt);
      expect([...times].sort()).toEqual(times);
      await feedNotificationService.ack(first.items.map((item) => item.id));
      const second = await feedNotificationService.list();
      expect(second).toMatchObject({ more: false, items: [{ post: { text: 'R100' } }] });
    });

    it('returns rows up to exactly 30 days old, and the purge keeps exactly those', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      const { post: kept } = await reply(mika, main.id, null, { text: 'Gardée' });
      const { post: dropped } = await reply(mika, main.id, null, { text: 'Trop vieille' });
      const now = new Date();
      const at = (postId: string, createdAt: Date) =>
        db.update(feedNotification).set({ createdAt }).where(eq(feedNotification.postId, postId));
      await at(kept.id, new Date(now.getTime() - KEEP));
      await at(dropped.id, new Date(now.getTime() - KEEP - 1));
      const listed = await feedNotificationService.list(now);
      expect(listed.items.map((item) => item.post.id)).toEqual([kept.id]);
      expect(await feedPurgeService.purge(now)).toEqual({ posts: 0, notifications: 1 });
      expect((await db.select().from(feedNotification)).map((row) => row.postId)).toEqual([
        kept.id,
      ]);
    });

    it('drops the waiting notifications of a deleted thread, its replies included', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      const camille = await person('Camille Roux');
      const { post: announcement } = await post(kael, 'Annonce', { feed: 'announcements' });
      const { post: answer } = await reply(camille, announcement.id);
      await reply(kael, announcement.id, answer.id);
      expect(await db.select().from(feedNotification)).toHaveLength(3);
      await feedPostService.remove({ actor: server(kael), postId: announcement.id });
      expect(await db.select().from(feedNotification)).toEqual([]);
      expect((await feedNotificationService.list()).items).toEqual([]);
    });
  });

  describe('the nightly purge', () => {
    it('erases rows deleted more than 30 days ago, never at exactly 30 days', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: exact } = await post(camille, 'Juste 30 jours');
      const { post: older } = await post(camille, 'Un peu plus');
      const { post: answer } = await reply(mika, older.id);
      await feedLikeService.setLiked({ actor: server(mika), postId: older.id, liked: true });
      await feedReadStateService.markThreadSeen({ player: mika.uuid }, older.id);
      await feedPostService.remove({ actor: server(camille), postId: exact.id });
      await feedPostService.remove({ actor: server(camille), postId: older.id });
      const now = new Date();
      await db
        .update(feedPost)
        .set({ deletedAt: new Date(now.getTime() - KEEP) })
        .where(eq(feedPost.id, exact.id));
      await db
        .update(feedPost)
        .set({ deletedAt: new Date(now.getTime() - KEEP - 1) })
        .where(inArray(feedPost.id, [older.id, answer.id]));

      expect(await feedPurgeService.purge(now)).toEqual({ posts: 2, notifications: 0 });
      const left = await db.select({ id: feedPost.id }).from(feedPost);
      expect(left.map((row) => row.id)).toEqual([exact.id]);
      // Their likes and thread marks went by cascade.
      expect(await db.select().from(feedLike)).toEqual([]);
      expect(await db.select().from(feedThreadSeen)).toEqual([]);
      // A millisecond later, the one at exactly 30 days goes too.
      expect(await feedPurgeService.purge(new Date(now.getTime() + 1))).toEqual({
        posts: 1,
        notifications: 0,
      });
    });

    it('erases a whole thread with its main post, even replies deleted later', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(mika, main.id);
      await feedPostService.remove({ actor: server(camille), postId: main.id });
      const now = new Date();
      await db
        .update(feedPost)
        .set({ deletedAt: new Date(now.getTime() - KEEP - 1) })
        .where(eq(feedPost.id, main.id));
      // The reply's own deletion time is recent, but it can't outlive its thread.
      await db
        .update(feedPost)
        .set({ deletedAt: new Date(now.getTime() - DAY) })
        .where(eq(feedPost.id, answer.id));
      expect(await feedPurgeService.purge(now)).toEqual({ posts: 1, notifications: 0 });
      expect(await db.select().from(feedPost)).toEqual([]);
    });

    it('runs as feed:purge behind jobs.feedPurge, and audits only what it removed', async () => {
      const { default: task } = (await import('~~/server/tasks/feed/purge')) as unknown as {
        default: { run: () => Promise<{ result: Record<string, unknown> }> };
      };
      const camille = await person('Camille Roux');
      const { post: created } = await post(camille);
      await feedPostService.remove({ actor: server(camille), postId: created.id });
      await db
        .update(feedPost)
        .set({ deletedAt: new Date(Date.now() - KEEP - DAY) })
        .where(eq(feedPost.id, created.id));
      const purges = () => db.select().from(audit).where(eq(audit.action, 'minecraft.feed.purge'));

      setFlags({ 'jobs.feedPurge': false });
      expect(await task.run()).toEqual({ result: { skipped: true } });
      expect(await db.select().from(feedPost)).toHaveLength(1);
      setFlags({ jobs: false });
      expect(await task.run()).toEqual({ result: { skipped: true } });

      setFlags();
      expect(await task.run()).toEqual({
        result: { posts: 1, notifications: 0, skipped: false },
      });
      expect((await purges()).map((row) => row.data)).toEqual([{ posts: 1, notifications: 0 }]);
      expect(await task.run()).toEqual({
        result: { posts: 0, notifications: 0, skipped: false },
      });
      expect(await purges()).toHaveLength(1);
      await db.delete(audit).where(eq(audit.action, 'minecraft.feed.purge'));
    });

    it('keeps the reply-to line of a reply whose target was purged', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort', { showRealName: false });
      const { post: main } = await post(camille, 'Fil');
      const { post: target } = await reply(mika, main.id);
      const { post: answer } = await reply(camille, main.id, target.id);
      await feedPostService.remove({ actor: server(mika), postId: target.id });
      await db
        .update(feedPost)
        .set({ deletedAt: new Date(Date.now() - KEEP - DAY) })
        .where(eq(feedPost.id, target.id));
      await feedPurgeService.purge();
      expect((await viewOf(camille, answer.id))!.replyTo).toEqual({
        id: null,
        anonymous: false,
        name: mika.username,
      });
    });
  });

  describe('account deletion', () => {
    it('forgets several accounts at once, fixing every count and pin they touched', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const ana = await person('Ana Morel', { role: 'feed-announcer' });
      const ben = await person('Ben Roche');
      const cleo = await person('Cléo Faure');
      const dan = await person('Dan Vidal', { role: 'feed-announcer' });

      const { post: anaPost } = await post(ana, 'Ana');
      const { post: benPost } = await post(ben, 'Ben');
      const { post: cleoPost } = await post(cleo, 'Cléo');
      const { post: anaAnnouncement } = await post(ana, 'Annonce', { feed: 'announcements' });
      const { post: danAnnouncement } = await post(dan, 'Annonce de Dan', {
        feed: 'announcements',
      });
      await feedPinService.pin({ actor: server(ana), postId: anaAnnouncement.id });
      await feedPinService.pin({ actor: server(ana), postId: danAnnouncement.id });

      // In Ana's thread: Ben and Cléo. In Ben's thread: Ana and Cléo, Ana answering Cléo.
      const { post: inAna1 } = await reply(ben, anaPost.id);
      await reply(cleo, anaPost.id, inAna1.id);
      await reply(ana, benPost.id);
      const { post: cleoInBen } = await reply(cleo, benPost.id);
      await reply(ana, benPost.id, cleoInBen.id);
      // In Cléo's thread: Ana, Ben answering Ana, Dan answering Ben, Cléo's own.
      const { post: anaInCleo } = await reply(ana, cleoPost.id);
      const { post: benInCleo } = await reply(ben, cleoPost.id, anaInCleo.id);
      const { post: danInCleo } = await reply(dan, cleoPost.id, benInCleo.id);
      const { post: cleoOwn } = await reply(cleo, cleoPost.id);
      // An already deleted reply of Ana's in Cléo's thread is not told again.
      const { post: anaGone } = await reply(ana, cleoPost.id);
      await feedPostService.remove({ actor: server(ana), postId: anaGone.id });
      // Likes from Ana and Ben on what stays and on what goes. (Not on Dan's reply, which
      // answers Ben's: see the known failure below.)
      for (const who of [ana, ben]) {
        for (const id of [cleoPost.id, cleoOwn.id, anaPost.id, benPost.id]) {
          await feedLikeService.setLiked({ actor: server(who), postId: id, liked: true });
        }
      }
      await feedLikeService.setLiked({ actor: server(dan), postId: cleoPost.id, liked: true });
      // Ana reads Cléo's thread; Ben has a posting account.
      await feedReadStateService.markThreadSeen({ player: ana.uuid }, cleoPost.id);
      await db.insert(feedMember).values({ userId: ben.id, postingMinecraftUuid: ben.uuid });

      const goneIds = (
        await db
          .select({
            id: feedPost.id,
            deletedAt: feedPost.deletedAt,
            author: feedPost.authorUserId,
            thread: feedPost.threadId,
          })
          .from(feedPost)
      )
        .filter(
          (row) =>
            row.deletedAt === null &&
            ([ana.id, ben.id].includes(row.author) ||
              [anaPost.id, benPost.id, anaAnnouncement.id].includes(row.thread ?? '')),
        )
        .map((row) => row.id);

      const from = await latestEvent();
      const after = await db.transaction(async (tx) => {
        const notify = await feedPostService.forgetUsers(tx, [ana.id, ben.id]);
        await tx.delete(user).where(inArray(user.id, [ana.id, ben.id]));
        await notify.afterDelete(tx);
        return notify;
      });
      // Nothing is told before the commit.
      expect(await eventsSince(from)).toEqual([]);
      await after.afterCommit();

      const left = await db.select().from(feedPost);
      const live = left.filter((row) => row.deletedAt === null);
      expect(live.map((row) => row.id).sort()).toEqual(
        [cleoPost.id, danAnnouncement.id, danInCleo.id, cleoOwn.id].sort(),
      );
      // Counts match what stays: Cléo's post has Dan's and her own replies, and Dan's like.
      const byId = new Map(left.map((row) => [row.id, row]));
      expect(byId.get(cleoPost.id)).toMatchObject({ replyCount: 2, likeCount: 1 });
      expect(byId.get(cleoOwn.id)).toMatchObject({ replyCount: 0, likeCount: 0 });
      expect(byId.get(danInCleo.id)).toMatchObject({ likeCount: 0 });
      // Dan's reply answered Ben's: no line any more.
      expect((await viewOf(dan, danInCleo.id))!.replyTo).toBeNull();
      expect(await db.select().from(feedThreadSeen)).toEqual([]);
      expect(await db.select().from(feedMember)).toEqual([]);

      const events = await eventsSince(from);
      expect(events.map((event) => event.type)).toEqual(['deleted', 'counts', 'pins']);
      const deleted = (events[0]!.data.items as { id: string }[]).map((item) => item.id);
      expect(deleted.sort()).toEqual(goneIds.sort());
      expect(deleted).not.toContain(anaGone.id);
      const counts = events[1]!.data.items as { id: string; likes: number; replies: number }[];
      expect(counts).toEqual(
        expect.arrayContaining([
          { id: cleoPost.id, likes: 1, replies: 2 },
          { id: cleoOwn.id, likes: 0, replies: 0 },
        ]),
      );
      expect(counts.every((item) => !deleted.includes(item.id))).toBe(true);
      expect(events[2]!.data).toMatchObject({ pinned: [{ id: danAnnouncement.id }] });
      expect((events[2]!.data.pinned as unknown[]).length).toBe(1);
      // The admin still exists: nothing of theirs went.
      expect(await db.select().from(user).where(eq(user.id, admin.id))).toHaveLength(1);
    });

    // A row that answered one of the account's replies has two ON DELETE SET NULL actions to take
    // (reply_to_id and reply_to_user_id). Had forgetUsers updated it before the delete, in the same
    // transaction, PostgreSQL would check its keys mid-way and the deletion would fail with 23503;
    // the counts are recomputed after the delete instead. A conversation is enough: Camille
    // replies, Mika answers her, Camille answers Mika.
    it('deletes an account that answered a reply answering its own reply', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(mika, 'Fil');
      const { post: hers } = await reply(camille, main.id);
      const { post: his } = await reply(mika, main.id, hers.id);
      await reply(camille, main.id, his.id);
      await usersService.remove({ actorId: admin.id, userId: camille.id });
      expect((await viewOf(mika, his.id))!).toMatchObject({ replyTo: null, replies: 0 });
    });

    it('deletes an account that liked a reply answering its own reply', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(mika, 'Fil');
      const { post: hers } = await reply(camille, main.id);
      const { post: his } = await reply(mika, main.id, hers.id);
      await feedLikeService.setLiked({ actor: server(camille), postId: his.id, liked: true });
      await usersService.remove({ actorId: admin.id, userId: camille.id });
      expect((await viewOf(mika, his.id))!).toMatchObject({ replyTo: null, likes: 0 });
    });

    // The same in the nightly job: one such account would make the whole run fail.
    it('deletes inactive accounts even when one of them was in a conversation', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(mika, 'Fil');
      const { post: hers } = await reply(camille, main.id);
      const { post: his } = await reply(mika, main.id, hers.id);
      await reply(camille, main.id, his.id);
      await db
        .update(user)
        .set({ createdAt: new Date(Date.now() - 800 * DAY), lastSignInAt: null })
        .where(eq(user.id, camille.id));
      expect(await usersService.deleteInactive(new Date())).toBeGreaterThanOrEqual(1);
    });

    it('drops the notifications waiting for and about a deleted account', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: camillePost } = await post(camille, 'Fil');
      const { post: mikaPost } = await post(mika, 'Autre');
      await reply(mika, camillePost.id);
      await reply(camille, mikaPost.id);
      expect(await db.select().from(feedNotification)).toHaveLength(2);
      await usersService.remove({ actorId: admin.id, userId: camille.id });
      expect(await db.select().from(feedNotification)).toEqual([]);
      expect((await viewOf(mika, mikaPost.id))!.replies).toBe(0);
    });

    it('deletes inactive accounts with their Feed rows and tells the Minecraft server', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: created } = await post(camille, 'Bientôt parti');
      const { post: answer } = await reply(camille, (await post(mika, 'Reste')).post.id);
      await db
        .update(user)
        .set({ createdAt: new Date(Date.now() - 800 * DAY), lastSignInAt: null })
        .where(eq(user.id, camille.id));
      const from = await latestEvent();
      expect(await usersService.deleteInactive(new Date())).toBeGreaterThanOrEqual(1);
      expect(await db.select().from(user).where(eq(user.id, camille.id))).toEqual([]);
      const deleted = (await eventsSince(from)).find((event) => event.type === 'deleted');
      expect((deleted!.data.items as { id: string }[]).map((item) => item.id).sort()).toEqual(
        [created.id, answer.id].sort(),
      );
    });
  });

  describe('guests and unknown viewers', () => {
    it('answers views for unknown viewers as guests, in the order sent', async () => {
      const camille = await person('Camille Roux');
      const { post: created } = await post(camille, 'Salut', { anonymous: true });
      const guests = [randomUUID(), randomUUID()];
      const { views } = await feedViewService.views({ viewers: guests, ids: [created.id] });
      expect(views.map((view) => view.viewer)).toEqual(guests);
      expect(views.every((view) => view.posts[0]!.author === null)).toBe(true);
    });
  });
});
