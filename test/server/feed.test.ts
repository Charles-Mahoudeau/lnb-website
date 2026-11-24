import { randomUUID } from 'node:crypto';

import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { db } from '~~/server/db';
import {
  audit,
  feedLike,
  feedMember,
  feedNotification,
  feedPost,
  minecraftAccount,
  minecraftServerEvent,
  user,
  wardenBan,
  wardenPlayer,
} from '~~/server/db/schema';
import { feedAnnouncerService } from '~~/server/services/feed/announcers';
import { feedLikeService } from '~~/server/services/feed/likes';
import { feedNotificationService } from '~~/server/services/feed/notifications';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedPurgeService } from '~~/server/services/feed/purge';
import { feedReadStateService } from '~~/server/services/feed/read-state';
import { feedRightsService } from '~~/server/services/feed/rights';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';
import { flagService } from '~~/server/services/flags';
import { minecraftEventService } from '~~/server/services/minecraft-events';
import { usersService } from '~~/server/services/users';
import { wardenModerationService } from '~~/server/services/warden/moderation';
import { wardenPlayerService } from '~~/server/services/warden/players';

// The Feed services against PostgreSQL: the paths docs/feed-mod.md's test vectors cover (13.2 to
// 13.6), and deletion with its cascade. The routes are thin; their flags are checked there.

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const PREFIX = 'feed-test-';
let counter = 0;

interface Player {
  id: string;
  uuid: string;
  username: string;
}

async function person(
  name: string,
  options: { role?: string; showRealName?: boolean; accounts?: number } = {},
): Promise<Player & { accounts: { uuid: string; username: string }[] }> {
  const n = ++counter;
  const id = `${PREFIX}${String(n)}`;
  await db.insert(user).values({
    id,
    name,
    email: `${id}@epitech.eu`,
    tenantId: EPITECH,
    role: options.role ?? null,
  } as typeof user.$inferInsert);
  if (options.showRealName !== undefined) {
    await db.insert(wardenPlayer).values({ userId: id, showRealName: options.showRealName });
  }
  const accounts = Array.from({ length: options.accounts ?? 1 }, (_, i) => ({
    uuid: randomUUID(),
    username: `Feed${String(n)}x${String(i)}`,
  }));
  for (const [i, account] of accounts.entries()) {
    await db.insert(minecraftAccount).values({
      ...account,
      userId: id,
      linkedAt: new Date(Date.now() - (accounts.length - i) * 1000),
    });
  }
  return { id, uuid: accounts[0]!.uuid, username: accounts[0]!.username, accounts };
}

const server = (player: { uuid: string }) => ({ source: 'server' as const, player: player.uuid });

function post(
  author: { uuid: string },
  text = 'Salut',
  options: { feed?: 'announcements' | 'global'; anonymous?: boolean; key?: string } = {},
) {
  return feedPostService.create({
    actor: server(author),
    idempotencyKey: options.key ?? randomUUID(),
    feed: options.feed ?? 'global',
    text,
    anonymous: options.anonymous ?? false,
  });
}

function reply(
  author: { uuid: string },
  threadId: string,
  replyTo: string | null = null,
  options: { anonymous?: boolean } = {},
) {
  return feedPostService.reply({
    actor: server(author),
    idempotencyKey: randomUUID(),
    threadId,
    replyTo,
    text: 'Moi !',
    anonymous: options.anonymous ?? false,
  });
}

async function viewOf(viewer: { uuid: string }, id: string) {
  const { views } = await feedViewService.views({ viewers: [viewer.uuid], ids: [id] });
  return views[0]!.posts[0];
}

async function problemOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const data = (error as { data?: { problem?: string } }).data;
    return { status: (error as { statusCode?: number }).statusCode, ...data };
  }
  return null;
}

async function eventsSince(from: number) {
  return (await minecraftEventService.since('feed', from)).map((row) => ({
    type: row.type,
    data: row.data,
  }));
}

async function wipe() {
  await db.delete(feedPost);
  await db.delete(feedMember);
  await db.delete(audit).where(like(audit.action, 'minecraft.feed.%'));
  await db.delete(user).where(like(user.id, `${PREFIX}%`));
  await db.delete(minecraftServerEvent).where(eq(minecraftServerEvent.topic, 'feed'));
}

describe('Feed services', () => {
  // The per-account limits are in memory; one test checks them, the rest create freely.
  let limits: MockInstance<typeof feedLimits.check>;
  beforeEach(async () => {
    await wipe();
    limits = vi.spyOn(feedLimits, 'check').mockResolvedValue();
    // Feed ships off: these tests switch it on.
    vi.spyOn(flagService, 'isEnabled').mockResolvedValue(true);
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  describe('anonymity by viewer (13.3)', () => {
    it('shows an anonymous post’s author to its author and moderators only', async () => {
      const camille = await person('Camille Roux', { accounts: 2 });
      const mika = await person('Mika Lefort');
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer', showRealName: false });
      const guest = { uuid: randomUUID() };
      const { post: created } = await post(camille, 'Qui vient ?', { anonymous: true });

      const second = { uuid: camille.accounts[1]!.uuid };
      const rows = await Promise.all(
        [camille, second, lune, kael, mika, guest].map((viewer) => viewOf(viewer, created.id)),
      );
      const summary = rows.map((row) => ({
        author: row!.author !== null,
        mine: row!.mine,
        canDelete: row!.canDelete,
        canPin: row!.canPin,
      }));
      expect(summary).toEqual([
        { author: true, mine: true, canDelete: true, canPin: false },
        { author: true, mine: true, canDelete: true, canPin: false },
        { author: true, mine: false, canDelete: true, canPin: false },
        { author: false, mine: false, canDelete: false, canPin: false },
        { author: false, mine: false, canDelete: false, canPin: false },
        { author: false, mine: false, canDelete: false, canPin: false },
      ]);
      expect(rows[2]!.author).toEqual({
        uuid: camille.uuid,
        username: camille.username,
        realName: 'Camille R.',
        announcer: false,
      });

      // Mika replies to the post; Lune answers Mika, anonymously.
      const { post: mikaReply } = await reply(mika, created.id);
      expect(mikaReply.replyTo).toBeNull();
      const { post: luneReply } = await reply(lune, created.id, mikaReply.id, { anonymous: true });
      const forKael = await viewOf(kael, luneReply.id);
      expect(forKael).toMatchObject({
        author: null,
        replyTo: { id: mikaReply.id, anonymous: false, name: 'Mika L.' },
      });

      const { items } = await feedNotificationService.list();
      expect(
        items.map((item) => [item.kind, item.players, item.post.author?.username ?? null]),
      ).toEqual([
        ['reply', camille.accounts.map((a) => a.uuid), mika.username],
        ['reply', [mika.uuid], null],
      ]);
    });

    it('hides an anonymous announcement’s author, badge and handle from players', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer', showRealName: false });
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const from = await minecraftEventService.latestId('feed');
      const { post: created } = await post(kael, 'Événement PvP', {
        feed: 'announcements',
        anonymous: true,
      });
      expect(created).toMatchObject({ mine: true, canPin: true, canDelete: true });
      expect(created.author).toEqual({
        uuid: kael.uuid,
        username: kael.username,
        realName: null,
        announcer: true,
      });
      expect(await viewOf(lune, created.id)).toMatchObject({ mine: false, canPin: true });
      expect(await viewOf(camille, created.id)).toMatchObject({
        author: null,
        canPin: false,
        canDelete: false,
      });

      const { items } = await feedNotificationService.list();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        kind: 'announcement',
        players: null,
        except: [kael.uuid],
        post: { author: null, anonymous: true },
      });
      const events = await eventsSince(from);
      expect(events.map((event) => event.type)).toEqual(['post', 'notification']);
      expect(Object.keys(events[0]!.data).sort()).toEqual(['createdAt', 'feed', 'id', 'threadId']);
    });
  });

  describe('idempotency (13.2)', () => {
    it('replays the same request and refuses another with the same key', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const key = randomUUID();
      const first = await post(camille, 'Salut', { key });
      expect(first.replayed).toBe(false);
      const again = await post(camille, 'Salut', { key });
      expect(again).toMatchObject({ replayed: true, post: { id: first.post.id } });
      expect(await db.select().from(feedPost)).toHaveLength(1);

      expect(await problemOf(post(camille, 'Salut !', { key }))).toMatchObject({
        status: 409,
        problem: 'idempotencyMismatch',
      });
      expect(await problemOf(post(mika, 'Salut', { key }))).toMatchObject({
        problem: 'idempotencyMismatch',
      });
      expect(await post(camille, '  Salut  ', { key })).toMatchObject({ replayed: true });

      await feedPostService.remove({ actor: server(camille), postId: first.post.id });
      expect(await problemOf(post(camille, 'Salut', { key }))).toMatchObject({
        status: 404,
        problem: 'notFound',
      });
      // Whatever the request: the post existed, so the client stops retrying.
      expect(await problemOf(post(mika, 'Autre', { key }))).toMatchObject({
        status: 404,
        problem: 'notFound',
      });
    });

    it('checks the key before the player, so a replay works after an unlink', async () => {
      const camille = await person('Camille Roux');
      const key = randomUUID();
      const first = await post(camille, 'Salut', { key });
      await db
        .update(minecraftAccount)
        .set({ unlinkedAt: new Date() })
        .where(eq(minecraftAccount.uuid, camille.uuid));
      expect(await post(camille, 'Salut', { key })).toMatchObject({
        replayed: true,
        post: { id: first.post.id },
      });
      expect(await problemOf(post(camille, 'Autre'))).toMatchObject({ problem: 'notLinked' });
    });
  });

  describe('checks', () => {
    it('refuses guests, bans, missing rights, bad texts and the rate, in that order', async () => {
      const camille = await person('Camille Roux');
      expect(await problemOf(post({ uuid: randomUUID() }))).toMatchObject({
        status: 404,
        problem: 'notLinked',
      });
      expect(await problemOf(post(camille, 'x', { feed: 'announcements' }))).toMatchObject({
        status: 403,
        problem: 'notAllowed',
      });
      expect(await problemOf(post(camille, ' \n '))).toMatchObject({
        status: 400,
        problem: 'emptyText',
      });
      expect(await problemOf(post(camille, 'a'.repeat(281)))).toMatchObject({
        problem: 'tooLong',
      });
      await db.insert(wardenBan).values({ userId: camille.id, reason: 'Spam', source: 'web' });
      expect(await problemOf(post(camille, ''))).toMatchObject({ status: 403, problem: 'banned' });
    });

    it('limits main posts to 3 a minute per LNB account, whatever the Minecraft account', async () => {
      limits.mockRestore();
      const camille = await person('Camille Roux', { accounts: 2 });
      await post(camille, 'Un');
      await post(camille, 'Deux');
      await post({ uuid: camille.accounts[1]!.uuid }, 'Trois');
      const refused = (await problemOf(post(camille, 'Quatre'))) as { retryAfter?: unknown };
      expect(refused).toMatchObject({ status: 429, problem: 'rateLimited' });
      expect(refused.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('pins (13.5)', () => {
    it('keeps 3 pins, replaces the oldest on request, and checks rights', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      const mika = await person('Mika Lefort');
      const ids: string[] = [];
      for (const text of ['A', 'B', 'C', 'D']) {
        ids.push((await post(lune, text, { feed: 'announcements' })).post.id);
      }
      const [A, B, C, D] = ids as [string, string, string, string];
      for (const id of [A, B, C]) await feedPinService.pin({ actor: server(lune), postId: id });

      expect(await problemOf(feedPinService.pin({ actor: server(lune), postId: D }))).toMatchObject(
        { status: 409, problem: 'pinLimit', oldest: { id: A } },
      );
      const from = await minecraftEventService.latestId('feed');
      const replaced = await feedPinService.pin({ actor: server(lune), postId: D, replace: true });
      expect(replaced.pinned.map((pin) => pin.id)).toEqual([D, C, B]);
      expect(replaced.unpinned).toBe(A);
      const again = await feedPinService.pin({ actor: server(lune), postId: D });
      expect(again).toEqual({ pinned: replaced.pinned, unpinned: null });
      expect((await eventsSince(from)).map((event) => event.type)).toEqual(['pins']);

      const unpinned = await feedPinService.unpin({ actor: server(kael), postId: C });
      expect(unpinned.pinned.map((pin) => pin.id)).toEqual([D, B]);
      expect(await problemOf(feedPinService.pin({ actor: server(mika), postId: B }))).toMatchObject(
        { status: 403, problem: 'notAllowed' },
      );
      const global = await post(lune, 'Global');
      expect(
        await problemOf(feedPinService.pin({ actor: server(lune), postId: global.post.id })),
      ).toMatchObject({ status: 409, problem: 'notPinnable' });

      const page = await feedViewService.page({
        who: { player: mika.uuid },
        feed: 'announcements',
      });
      expect(page.pinned.map((row) => row.id)).toEqual([D, B]);
      expect(page.posts.map((row) => row.id)).toEqual([C, A]);

      const pinActions = await db
        .select({ action: audit.action, data: audit.data })
        .from(audit)
        .where(like(audit.action, 'minecraft.feed.%'));
      expect(pinActions.filter((row) => row.action === 'minecraft.feed.pin')).toHaveLength(4);
      expect(pinActions).toContainEqual({
        action: 'minecraft.feed.pin',
        data: { postId: D, replaced: A },
      });

      // Deleting a pinned post unpins it and sends the group again.
      const before = await minecraftEventService.latestId('feed');
      await feedPostService.remove({ actor: server(lune), postId: D });
      const events = await eventsSince(before);
      expect(events.map((event) => event.type)).toEqual(['deleted', 'pins']);
      expect(events[1]!.data).toEqual({ pinned: [expect.objectContaining({ id: B })] });
    });
  });

  describe('deleting', () => {
    it('deletes a thread with its replies, drops their notifications, and tells everyone', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const lune = await person('Lune Garnier', { role: 'admin' });
      const { post: main } = await post(camille, 'Fil');
      const { post: r1 } = await reply(mika, main.id);
      const { post: r2 } = await reply(camille, main.id, r1.id);
      expect((await viewOf(camille, main.id))!.replies).toBe(2);
      expect((await viewOf(camille, r1.id))!.replies).toBe(1);
      expect(await db.select().from(feedNotification)).toHaveLength(2);

      // Mika can't delete Camille's post.
      expect(
        await problemOf(feedPostService.remove({ actor: server(mika), postId: main.id })),
      ).toMatchObject({ status: 403, problem: 'notAllowed' });

      // A moderator deleting someone's reply in the browser is refused; in game it works.
      expect(
        await problemOf(
          feedPostService.remove({
            actor: { source: 'site', userId: lune.id },
            postId: r1.id,
            ownOnly: true,
          }),
        ),
      ).toMatchObject({ problem: 'notAllowed' });

      const from = await minecraftEventService.latestId('feed');
      await feedPostService.remove({ actor: server(mika), postId: r1.id });
      expect((await viewOf(camille, main.id))!.replies).toBe(1);
      expect(await viewOf(camille, r1.id)).toBeUndefined();
      // The reply that answered it stays, with its line.
      expect((await viewOf(camille, r2.id))!.replyTo).toMatchObject({ id: r1.id, name: 'Mika L.' });
      expect(await eventsSince(from)).toEqual([
        { type: 'deleted', data: { items: [{ id: r1.id, feed: 'global', threadId: main.id }] } },
        { type: 'counts', data: { items: [{ id: main.id, likes: 0, replies: 1 }] } },
      ]);
      // Retrying is harmless; someone else's retry on a deleted post is notFound.
      await feedPostService.remove({ actor: server(mika), postId: r1.id });
      expect(
        await problemOf(feedPostService.remove({ actor: server(camille), postId: r1.id })),
      ).toMatchObject({ status: 404, problem: 'notFound' });

      await feedPostService.remove({ actor: server(lune), postId: main.id });
      const rows = await db.select().from(feedPost);
      expect(rows.every((row) => row.deletedAt !== null)).toBe(true);
      expect(rows.find((row) => row.id === r2.id)?.deletedCause).toBe('thread');
      expect(await db.select().from(feedNotification)).toHaveLength(0);
      expect(
        await problemOf(feedViewService.thread({ who: { player: camille.uuid }, id: main.id })),
      ).toMatchObject({ problem: 'notFound' });
      expect(await problemOf(reply(mika, main.id))).toMatchObject({ problem: 'notFound' });

      const actions = await db
        .select({ action: audit.action, target: audit.targetUserId, data: audit.data })
        .from(audit)
        .where(like(audit.action, 'minecraft.feed.%'));
      expect(actions).toEqual([
        {
          action: 'minecraft.feed.delete',
          target: camille.id,
          data: {
            postId: main.id,
            threadId: null,
            feed: 'global',
            reply: false,
            anonymous: false,
            reason: null,
          },
        },
      ]);
    });

    it('forgets a deleted account: its threads go and the counts it touched are fixed', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: camillePost } = await post(camille, 'À moi');
      const { post: mikaPost } = await post(mika, 'Mon fil');
      await reply(mika, camillePost.id);
      const { post: camilleReply } = await reply(camille, mikaPost.id);
      const { post: answer } = await reply(mika, mikaPost.id, camilleReply.id);
      await feedLikeService.setLiked({ actor: server(camille), postId: mikaPost.id, liked: true });

      const from = await minecraftEventService.latestId('feed');
      const after = await db.transaction(async (tx) => {
        const notify = await feedPostService.forgetUsers(tx, [camille.id]);
        await tx.delete(user).where(eq(user.id, camille.id));
        await notify.afterDelete(tx);
        return notify;
      });
      await after.afterCommit();

      const left = await db.select().from(feedPost);
      expect(left.map((row) => row.id).sort()).toEqual([mikaPost.id, answer.id].sort());
      expect(left.find((row) => row.id === mikaPost.id)).toMatchObject({
        likeCount: 0,
        replyCount: 1,
      });
      expect((await viewOf(mika, answer.id))!.replyTo).toBeNull();
      const events = await eventsSince(from);
      expect(events.map((event) => event.type)).toEqual(['deleted', 'counts']);
      expect(events[1]!.data).toEqual({ items: [{ id: mikaPost.id, likes: 0, replies: 1 }] });
      expect(await db.select().from(feedLike)).toHaveLength(0);
    });
  });

  describe('pagination (13.4)', () => {
    it('pages by (createdAt, id), unshifted by new posts and skipping deleted ones', async () => {
      const mika = await person('Mika Lefort');
      const camille = await person('Camille Roux');
      const ids: string[] = [];
      for (let i = 1; i <= 25; i++) ids.push((await post(mika, `G${String(i)}`)).post.id);
      const first = await feedViewService.page({ who: { player: camille.uuid }, feed: 'global' });
      expect(first.posts.map((row) => row.text)).toEqual(
        Array.from({ length: 20 }, (_, i) => `G${String(25 - i)}`),
      );
      expect(first.next).not.toBeNull();
      expect(first.next!.length).toBeLessThanOrEqual(128);
      await post(mika, 'G26');
      await feedPostService.remove({ actor: server(mika), postId: ids[2]! });
      const second = await feedViewService.page({
        who: { player: camille.uuid },
        feed: 'global',
        before: first.next!,
      });
      expect(second.posts.map((row) => row.text)).toEqual(['G5', 'G4', 'G2', 'G1']);
      expect(second.next).toBeNull();
      expect(second.pinned).toEqual([]);
      expect(
        await problemOf(
          feedViewService.page({ who: { player: camille.uuid }, feed: 'global', before: 'nope' }),
        ),
      ).toMatchObject({ status: 400 });
    });
  });

  describe('unread and markers (13.6)', () => {
    it('follows the dots and the unseen replies', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const unread = async () => (await feedRightsService.playerState(camille.uuid)).unread;
      const { post: g1 } = await post(mika, 'G1');
      expect((await unread()).global).toBe(true);
      await feedReadStateService.markFeedSeen(
        { player: camille.uuid },
        'global',
        new Date(g1.createdAt),
      );
      expect((await unread()).global).toBe(false);
      const { post: g2 } = await post(camille, 'G2');
      expect((await unread()).global).toBe(false);
      await post(mika, 'G3');
      expect((await unread()).global).toBe(true);

      const { post: answer } = await reply(mika, g2.id);
      expect((await viewOf(camille, g2.id))!.unseenReplies).toBe(1);
      expect((await viewOf(camille, answer.id))!.answersMe).toBe(true);
      expect((await viewOf(mika, g2.id))!.unseenReplies).toBe(0);
      const thread = await feedViewService.thread({ who: { player: camille.uuid }, id: g2.id });
      expect(thread.post.unseenReplies).toBe(1);
      await feedReadStateService.markThreadSeen({ player: camille.uuid }, g2.id);
      expect((await viewOf(camille, g2.id))!.unseenReplies).toBe(0);

      // A guest has no state.
      const guest = randomUUID();
      await feedReadStateService.markFeedSeen({ player: guest }, 'global', new Date());
      expect((await feedRightsService.playerState(guest)).unread).toEqual({
        announcements: false,
        global: false,
      });
    });
  });

  describe('the nightly purge', () => {
    it('erases rows deleted over 30 days ago and old notifications, keeping reply lines', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      const { post: mikaReply } = await reply(mika, main.id);
      const { post: answer } = await reply(camille, main.id, mikaReply.id);
      await feedPostService.remove({ actor: server(mika), postId: mikaReply.id });
      const { post: fresh } = await post(mika, 'Récent');
      await feedPostService.remove({ actor: server(mika), postId: fresh.id });

      const now = new Date();
      const old = new Date(now.getTime() - 31 * 86_400_000);
      await db.update(feedPost).set({ deletedAt: old }).where(eq(feedPost.id, mikaReply.id));
      await db.update(feedNotification).set({ createdAt: old });

      expect(await feedPurgeService.purge(now)).toEqual({ posts: 1, notifications: 1 });
      const left = (await db.select({ id: feedPost.id }).from(feedPost)).map((row) => row.id);
      expect(left.sort()).toEqual([main.id, answer.id, fresh.id].sort());
      expect((await viewOf(camille, answer.id))!.replyTo).toEqual({
        id: null,
        anonymous: false,
        name: 'Mika L.',
      });
      expect(await feedPurgeService.purge(now)).toEqual({ posts: 0, notifications: 0 });
    });
  });

  describe('announcers (4.14, 4.15)', () => {
    it('lets moderators give and take the role in game, never from a moderator', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { showRealName: false });
      const mika = await person('Mika Lefort');
      const issuer = (who: Player) => ({ uuid: who.uuid, username: who.username });

      expect(
        await problemOf(
          feedAnnouncerService.setFromServer({
            uuid: kael.uuid,
            announcer: true,
            issuer: issuer(mika),
          }),
        ),
      ).toMatchObject({ status: 403, problem: 'issuerNotAllowed' });
      expect(
        await problemOf(
          feedAnnouncerService.setFromServer({ uuid: randomUUID(), announcer: true }),
        ),
      ).toMatchObject({ status: 404, problem: 'notLinked' });

      const from = await minecraftEventService.latestId('feed');
      const given = await feedAnnouncerService.setFromServer({
        uuid: kael.uuid,
        announcer: true,
        issuer: issuer(lune),
      });
      expect(given).toEqual({
        uuid: kael.uuid,
        username: kael.username,
        announcer: true,
        viaRole: false,
      });
      // Giving it again changes nothing, and sends nothing more.
      await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: true });
      expect((await eventsSince(from)).map((event) => event.type)).toEqual(['rights']);
      expect(await feedAnnouncerService.list()).toEqual({
        items: [{ realName: null, accounts: [{ uuid: kael.uuid, username: kael.username }] }],
      });

      expect(
        await problemOf(feedAnnouncerService.setFromServer({ uuid: lune.uuid, announcer: false })),
      ).toMatchObject({ status: 409, problem: 'impliedByRole' });
      expect(
        await feedAnnouncerService.setFromServer({ uuid: lune.uuid, announcer: true }),
      ).toMatchObject({ announcer: true, viaRole: true });

      const actions = await db
        .select({ actor: audit.actorUserId, target: audit.targetUserId, data: audit.data })
        .from(audit)
        .where(eq(audit.action, 'minecraft.feed.announcer'));
      expect(actions).toEqual([{ actor: lune.id, target: kael.id, data: { announcer: true } }]);
    });
  });

  describe('outside Feed', () => {
    it('sends rights events from bans, moderator roles, the announcer role and unlinks', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux', { accounts: 2 });
      const rights = async (from: number) =>
        (await eventsSince(from))
          .filter((event) => event.type === 'rights')
          .map((event) => [...(event.data.uuids as string[])].sort());
      const accounts = camille.accounts.map((account) => account.uuid).sort();

      let from = await minecraftEventService.latestId('feed');
      const web = { source: 'web' as const, userId: admin.id };
      const ban = await wardenModerationService.ban({
        userId: camille.id,
        body: { reason: 'Spam', durationSeconds: 3600 },
        actor: web,
      });
      await wardenModerationService.updateBan({ banId: ban.id, expiresAt: null, actor: web });
      await wardenModerationService.unban({ userId: camille.id, actor: web });
      await usersService.ban({
        actorId: admin.id,
        userId: camille.id,
        ban: { reason: 'Spam', durationSeconds: null },
      });
      await usersService.unban({ actorId: admin.id, userId: camille.id });
      expect(await rights(from)).toEqual([accounts, accounts, accounts, accounts, accounts]);

      from = await minecraftEventService.latestId('feed');
      const roles = { admin: false, wardenAdmin: false, eventsManager: true, economyAdmin: false };
      await usersService.setRoles({ actorId: admin.id, userId: camille.id, roles });
      expect(await rights(from)).toEqual([]);
      await usersService.setRoles({
        actorId: admin.id,
        userId: camille.id,
        roles: { ...roles, wardenAdmin: true },
      });
      expect(await rights(from)).toEqual([accounts]);

      from = await minecraftEventService.latestId('feed');
      await wardenPlayerService.unlink({ userId: camille.id, uuid: camille.uuid, actor: web });
      expect(await rights(from)).toEqual([[camille.uuid]]);
    });

    it('takes an account’s posts with it when the account is deleted', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: created } = await post(camille, 'Bientôt parti', {
        feed: 'global',
      });
      await reply(mika, created.id);
      const from = await minecraftEventService.latestId('feed');
      await usersService.remove({ actorId: admin.id, userId: camille.id });
      expect(await db.select().from(feedPost)).toEqual([]);
      const events = await eventsSince(from);
      expect(events.map((event) => event.type)).toEqual(['deleted']);
      expect((events[0]!.data.items as unknown[]).length).toBe(2);
    });
  });

  describe('likes and notifications', () => {
    it('likes once per LNB account and keeps the count', async () => {
      const camille = await person('Camille Roux', { accounts: 2 });
      const mika = await person('Mika Lefort');
      const { post: created } = await post(mika, 'Like');
      const like = (uuid: string, liked: boolean) =>
        feedLikeService.setLiked({
          actor: { source: 'server', player: uuid },
          postId: created.id,
          liked,
        });
      expect(await like(camille.uuid, true)).toEqual({ id: created.id, likes: 1, liked: true });
      expect(await like(camille.accounts[1]!.uuid, true)).toMatchObject({ likes: 1 });
      expect(await like(mika.uuid, true)).toMatchObject({ likes: 2 });
      expect((await viewOf({ uuid: camille.accounts[1]!.uuid }, created.id))!.liked).toBe(true);
      expect(await like(camille.uuid, false)).toMatchObject({ likes: 1, liked: false });
      expect(await like(camille.uuid, false)).toMatchObject({ likes: 1, liked: false });
    });

    it('queues one notification per reply to someone else, and acknowledges them', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: created } = await post(camille, 'Fil');
      await reply(camille, created.id);
      const { post: answer } = await reply(mika, created.id);
      const { items, more } = await feedNotificationService.list();
      expect(more).toBe(false);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        kind: 'reply',
        players: [camille.uuid],
        except: [],
        post: { id: answer.id, threadId: created.id },
      });
      await feedNotificationService.ack([items[0]!.id, randomUUID()]);
      expect((await feedNotificationService.list()).items).toEqual([]);
      const left = await db
        .select()
        .from(feedNotification)
        .where(inArray(feedNotification.postId, [answer.id]));
      expect(left).toEqual([]);
    });
  });
});
