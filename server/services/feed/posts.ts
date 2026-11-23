import { and, eq, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { feedLike, feedNotification, feedPost } from '~~/server/db/schema';
import type { FeedDeletedCause } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';

import { feedEvents } from './events';
import type { FeedEventItem } from './events';
import { feedRightsService } from './rights';
import type { FeedViewer, FeedWriter } from './rights';
import { fingerprint } from './rules';
import type { FeedRequester, FeedTarget } from './rules';
import { feedLimits, livePost, refuse } from './shared';
import type { Db, FeedActor, Tx } from './shared';
import { feedViewService } from './views';

import type { FeedCreated, FeedName } from '#shared/schemas/feed';
import { checkFeedText } from '#shared/utils/feed-text';

// Creating, replying and deleting (docs/feed.md, "Writing" and "Deleting"). Creations are
// idempotent by key; the checks run in the order of docs/feed-mod.md 4.5: the flags (in the
// handler), the key, the player, the ban, the right, the text, the rate. Events go out after the
// transaction commits.

function requesterOf(actor: FeedActor): FeedRequester {
  return actor.source === 'server'
    ? { source: 'server', player: actor.player }
    : { source: 'site', userId: actor.userId };
}

function viewerOf(writer: FeedWriter): FeedViewer {
  return { userId: writer.userId, rights: writer.person.rights };
}

/**
 * The post already created with this key, as the actor sees it, or nothing. Another request with
 * the key is 409 `idempotencyMismatch`; a post deleted since is 404 `notFound`.
 */
async function replay(
  dbx: Db,
  actor: FeedActor,
  key: string,
  print: string,
): Promise<FeedCreated | undefined> {
  const [row] = await dbx.select().from(feedPost).where(eq(feedPost.idempotencyKey, key));
  if (!row) return undefined;
  if (row.fingerprint !== print) refuse(409, 'idempotencyMismatch');
  if (row.deletedAt) refuse(404, 'notFound');
  const viewer = await feedRightsService.viewer(
    dbx,
    actor.source === 'server' ? { player: actor.player } : { userId: actor.userId },
  );
  return { replayed: true, post: await feedViewService.viewFor(dbx, row, viewer) };
}

/** Runs a creation, and answers a replay when a concurrent call with the same key won. */
async function idempotent(
  actor: FeedActor,
  key: string,
  print: string,
  create: () => Promise<FeedCreated>,
): Promise<FeedCreated> {
  const previous = await replay(db, actor, key, print);
  if (previous) return previous;
  try {
    return await create();
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await replay(db, actor, key, print);
      if (raced) return raced;
    }
    throw error;
  }
}

function checkedText(raw: string): string {
  const checked = checkFeedText(raw);
  if (!checked.ok) refuse(400, checked.problem);
  return checked.text;
}

/** Creates a main post in a feed. An announcement queues a notification for everyone. */
async function create(input: {
  actor: FeedActor;
  idempotencyKey: string;
  feed: FeedName;
  text: string;
  anonymous: boolean;
}): Promise<FeedCreated> {
  const target: FeedTarget = { kind: 'post', feed: input.feed };
  const print = fingerprint(requesterOf(input.actor), target, input.text, input.anonymous);
  return idempotent(input.actor, input.idempotencyKey, print, async () => {
    const writer = await feedRightsService.writer(db, input.actor, 'posting');
    if (writer.person.banned) refuse(403, 'banned');
    if (input.feed === 'announcements' && !writer.person.rights.announce) {
      refuse(403, 'notAllowed');
    }
    const text = checkedText(input.text);
    await feedLimits.check('post', writer.userId);
    const announcement = input.feed === 'announcements';
    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(feedPost)
        .values({
          feed: input.feed,
          authorUserId: writer.userId,
          minecraftUuid: writer.account!.uuid,
          minecraftUsername: writer.account!.username,
          source: input.actor.source,
          text,
          anonymous: input.anonymous,
          createdAt: now,
          idempotencyKey: input.idempotencyKey,
          fingerprint: print,
        })
        .returning();
      if (announcement) {
        await tx
          .insert(feedNotification)
          .values({ kind: 'announcement', postId: row!.id, recipientUserId: null, createdAt: now });
      }
      return row!;
    });
    await feedEvents.post(created);
    if (announcement) await feedEvents.notification();
    return {
      replayed: false,
      post: await feedViewService.viewFor(db, created, viewerOf(writer)),
    };
  });
}

/**
 * Creates a reply in the thread of main post `threadId`, answering the main post or one of its
 * replies. Notifies the author of what it answers, unless that is the replier.
 */
async function reply(input: {
  actor: FeedActor;
  idempotencyKey: string;
  threadId: string;
  replyTo: string | null;
  text: string;
  anonymous: boolean;
}): Promise<FeedCreated> {
  const target: FeedTarget = { kind: 'reply', threadId: input.threadId, replyTo: input.replyTo };
  const print = fingerprint(requesterOf(input.actor), target, input.text, input.anonymous);
  return idempotent(input.actor, input.idempotencyKey, print, async () => {
    const writer = await feedRightsService.writer(db, input.actor, 'posting');
    if (writer.person.banned) refuse(403, 'banned');
    const main = await livePost(db, input.threadId);
    if (main.threadId) refuse(404, 'notFound');
    if (input.replyTo) {
      const answered = await livePost(db, input.replyTo);
      if (answered.threadId !== main.id) refuse(404, 'notFound');
    }
    const text = checkedText(input.text);
    await feedLimits.check('reply', writer.userId);
    const { created, notify } = await db.transaction(async (tx) => {
      // Locked, so a deletion of the thread can't slip in between the checks and the insert.
      const thread = await livePost(tx, input.threadId, true);
      const answered = input.replyTo ? await livePost(tx, input.replyTo, true) : thread;
      if (answered.threadId !== null && answered.threadId !== thread.id) refuse(404, 'notFound');
      const now = new Date();
      const [row] = await tx
        .insert(feedPost)
        .values({
          feed: thread.feed,
          threadId: thread.id,
          replyToId: input.replyTo ? answered.id : null,
          replyToUserId: answered.authorUserId,
          replyToAnonymous: answered.anonymous,
          // Only for a reply to a reply: its line keeps a name once that reply is purged.
          replyToMinecraftUsername: input.replyTo ? answered.minecraftUsername : null,
          authorUserId: writer.userId,
          minecraftUuid: writer.account!.uuid,
          minecraftUsername: writer.account!.username,
          source: input.actor.source,
          text,
          anonymous: input.anonymous,
          createdAt: now,
          idempotencyKey: input.idempotencyKey,
          fingerprint: print,
        })
        .returning();
      const counted = input.replyTo ? [thread.id, answered.id] : [thread.id];
      await tx
        .update(feedPost)
        .set({ replyCount: sql`${feedPost.replyCount} + 1` })
        .where(inArray(feedPost.id, counted));
      const notify = answered.authorUserId !== writer.userId;
      if (notify) {
        await tx.insert(feedNotification).values({
          kind: 'reply',
          postId: row!.id,
          recipientUserId: answered.authorUserId,
          createdAt: now,
        });
      }
      return { created: row!, notify };
    });
    await feedEvents.post(created);
    await feedEvents.counts(
      created.replyToId ? [created.threadId!, created.replyToId] : [created.threadId!],
    );
    if (notify) await feedEvents.notification();
    return {
      replayed: false,
      post: await feedViewService.viewFor(db, created, viewerOf(writer)),
    };
  });
}

/** Who deletes: a player, a person in the browser, or a moderator in the admin. */
async function deleter(tx: Tx, actor: FeedActor) {
  return feedRightsService.writer(tx, actor, 'none');
}

/**
 * Deletes a main post (and its whole thread) or a reply. The author deletes their own, banned or
 * not; a moderator any, unless `ownOnly` (the browser, where moderators delete others' from the
 * admin). Deleting what is already deleted answers again when the caller could have deleted it.
 * A moderator deleting someone else's post is audited, with the admin's reason.
 */
async function remove(input: {
  actor: FeedActor;
  postId: string;
  ownOnly?: boolean;
  reason?: string | null;
}): Promise<void> {
  const outcome = await db.transaction(async (tx) => {
    const who = await deleter(tx, input.actor);
    const [post] = await tx
      .select()
      .from(feedPost)
      .where(eq(feedPost.id, input.postId))
      .for('update');
    if (!post) refuse(404, 'notFound');
    const own = post.authorUserId === who.userId;
    const allowed = own || (!input.ownOnly && who.person.rights.moderate);
    if (post.deletedAt) {
      if (allowed) return null;
      refuse(404, 'notFound');
    }
    if (!allowed) refuse(403, 'notAllowed');

    const now = new Date();
    const cause: FeedDeletedCause = own ? 'author' : 'moderator';
    const reason = cause === 'moderator' ? (input.reason ?? null) : null;
    await tx
      .update(feedPost)
      .set({
        deletedAt: now,
        deletedByUserId: who.userId,
        deletedCause: cause,
        deletedReason: reason,
        pinnedAt: null,
        pinnedByUserId: null,
      })
      .where(eq(feedPost.id, post.id));
    const gone: FeedEventItem[] = [{ id: post.id, feed: post.feed, threadId: post.threadId }];
    const counted: string[] = [];
    if (post.threadId === null) {
      const replies = await tx
        .update(feedPost)
        .set({ deletedAt: now, deletedByUserId: who.userId, deletedCause: 'thread' })
        .where(and(eq(feedPost.threadId, post.id), isNull(feedPost.deletedAt)))
        .returning({ id: feedPost.id, feed: feedPost.feed, threadId: feedPost.threadId });
      gone.push(...replies);
    } else {
      counted.push(post.threadId, ...(post.replyToId ? [post.replyToId] : []));
      await tx
        .update(feedPost)
        .set({ replyCount: sql`greatest(${feedPost.replyCount} - 1, 0)` })
        .where(inArray(feedPost.id, counted));
    }
    await tx.delete(feedNotification).where(
      inArray(
        feedNotification.postId,
        gone.map((item) => item.id),
      ),
    );
    if (cause === 'moderator') {
      await auditService.record(tx, {
        action: 'minecraft.feed.delete',
        actor: who.auditActor,
        targetUserId: post.authorUserId,
        data: {
          postId: post.id,
          threadId: post.threadId,
          feed: post.feed,
          reply: post.threadId !== null,
          anonymous: post.anonymous,
          reason,
        },
      });
    }
    return { gone, counted, wasPinned: post.pinnedAt !== null };
  });
  if (!outcome) return;
  await feedEvents.deleted(outcome.gone);
  await feedEvents.counts(outcome.counted);
  if (outcome.wasPinned) await feedEvents.pins();
}

/**
 * Before LNB accounts are deleted, in their transaction: their posts, replies and likes go with
 * them by cascade, and with their main posts the whole threads. This fixes the counts of the posts
 * that stay, and returns what to tell the Minecraft server once the deletion has committed
 * (`deleted`, `counts` and, when a pinned post went, `pins`).
 */
async function forgetUsers(tx: Tx, userIds: string[]): Promise<() => Promise<void>> {
  if (!userIds.length) return async () => {};
  const going = (column: typeof feedPost.authorUserId) => inArray(column, userIds);
  // Live rows that go: theirs, and every reply in the threads of their main posts.
  const mains = tx
    .select({ id: feedPost.id })
    .from(feedPost)
    .where(and(going(feedPost.authorUserId), isNull(feedPost.threadId)));
  const gone = await tx
    .select({
      id: feedPost.id,
      feed: feedPost.feed,
      threadId: feedPost.threadId,
      pinnedAt: feedPost.pinnedAt,
    })
    .from(feedPost)
    .where(
      and(
        isNull(feedPost.deletedAt),
        or(going(feedPost.authorUserId), inArray(feedPost.threadId, mains)),
      ),
    );
  const goneIds = gone.map((row) => row.id);
  // Their live replies in threads that stay: the main post and the reply answered lose one.
  const theirReplies = await tx
    .select({ threadId: feedPost.threadId, replyToId: feedPost.replyToId })
    .from(feedPost)
    .where(
      and(
        going(feedPost.authorUserId),
        isNotNull(feedPost.threadId),
        isNull(feedPost.deletedAt),
        goneIds.length ? notInArray(feedPost.threadId, goneIds) : undefined,
      ),
    );
  const lost = new Map<string, number>();
  for (const row of theirReplies) {
    for (const id of [row.threadId, row.replyToId]) {
      if (id && !goneIds.includes(id)) lost.set(id, (lost.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of lost) {
    await tx
      .update(feedPost)
      .set({ replyCount: sql`greatest(${feedPost.replyCount} - ${n}, 0)` })
      .where(eq(feedPost.id, id));
  }
  // Their likes on posts that stay.
  const liked = await tx
    .select({ postId: feedLike.postId, n: sql<number>`count(*)::int` })
    .from(feedLike)
    .innerJoin(feedPost, eq(feedPost.id, feedLike.postId))
    .where(
      and(
        inArray(feedLike.userId, userIds),
        isNull(feedPost.deletedAt),
        notInArray(feedPost.authorUserId, userIds),
      ),
    )
    .groupBy(feedLike.postId);
  const likedStaying = liked.filter((row) => !goneIds.includes(row.postId));
  for (const row of likedStaying) {
    await tx
      .update(feedPost)
      .set({ likeCount: sql`greatest(${feedPost.likeCount} - ${row.n}, 0)` })
      .where(eq(feedPost.id, row.postId));
  }
  const items = gone.map((row) => ({ id: row.id, feed: row.feed, threadId: row.threadId }));
  const counted = [...lost.keys(), ...likedStaying.map((row) => row.postId)];
  const pinned = gone.some((row) => row.pinnedAt !== null);
  return async () => {
    await feedEvents.deleted(items);
    await feedEvents.counts(counted);
    if (pinned) await feedEvents.pins();
  };
}

export const feedPostService = { create, reply, remove, forgetUsers };
