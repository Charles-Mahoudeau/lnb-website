import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '~~/server/db';
import { feedLike, feedPost, feedThreadSeen } from '~~/server/db/schema';

import { authorBlock, feedRightsService } from './rights';
import type { FeedPerson, FeedViewer } from './rights';
import {
  PAGE_DEFAULT,
  PIN_LIMIT,
  THREAD_DEFAULT,
  decodeCursor,
  displayName,
  encodeCursor,
  realNameOf,
} from './rules';
import type { FeedCursor } from './rules';
import { badRequest, livePost, refuse } from './shared';
import type { Db, FeedPostRow, FeedWho } from './shared';

import type {
  FeedName,
  FeedPage,
  FeedPostView,
  FeedReplyTo,
  FeedThread,
  FeedViewsResult,
} from '#shared/schemas/feed';

// Posts as one viewer sees them (docs/feed-mod.md, section 3): the same rows give each viewer
// their own `liked`, `mine`, rights and markers, and the author of an anonymous post only to its
// author and to moderators. Pages and threads are keyset pages on (createdAt, id).

/** What every view of a set of posts needs, read once for all viewers. */
interface ViewContext {
  people: Map<string, FeedPerson>;
  /** `postId:userId` of the viewers' likes. */
  liked: Set<string>;
  /** Unseen replies by post, for its author. */
  unseen: Map<string, number>;
}

async function context(
  dbx: Db,
  posts: readonly FeedPostRow[],
  viewers: readonly FeedViewer[],
): Promise<ViewContext> {
  const ids = posts.map((post) => post.id);
  const viewerIds = [...new Set(viewers.flatMap((viewer) => viewer.userId ?? []))];
  // Markers only show on the viewer's own posts, so only those are counted.
  const viewersSet = new Set(viewerIds);
  const ownIds = posts.filter((post) => viewersSet.has(post.authorUserId)).map((post) => post.id);
  // One after the other: `dbx` may be a transaction, which runs one query at a time.
  const people = await feedRightsService.people(dbx, [
    ...posts.map((post) => post.authorUserId),
    ...posts.flatMap((post) => post.replyToUserId ?? []),
  ]);
  const likes =
    ids.length && viewerIds.length
      ? await dbx
          .select({ postId: feedLike.postId, userId: feedLike.userId })
          .from(feedLike)
          .where(and(inArray(feedLike.postId, ids), inArray(feedLike.userId, viewerIds)))
      : [];
  const unseen = await unseenCounts(dbx, ownIds);
  return {
    people,
    liked: new Set(likes.map((like) => `${like.postId}:${like.userId}`)),
    unseen,
  };
}

/**
 * The replies its author hasn't seen, by post: on a main post, the replies in its thread that
 * answer the author; on a reply, the replies that answer it. Not by the author, not deleted,
 * newer than the author's last opening of the thread.
 */
async function unseenCounts(dbx: Db, ids: readonly string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const reply = alias(feedPost, 'reply');
  const rows = await dbx
    .select({ id: feedPost.id, count: count(reply.id) })
    .from(feedPost)
    .innerJoin(
      reply,
      and(
        isNull(reply.deletedAt),
        ne(reply.authorUserId, feedPost.authorUserId),
        or(
          and(
            isNull(feedPost.threadId),
            eq(reply.threadId, feedPost.id),
            eq(reply.replyToUserId, feedPost.authorUserId),
          ),
          eq(reply.replyToId, feedPost.id),
        ),
      ),
    )
    .leftJoin(
      feedThreadSeen,
      and(
        eq(feedThreadSeen.userId, feedPost.authorUserId),
        eq(feedThreadSeen.threadId, sql`coalesce(${feedPost.threadId}, ${feedPost.id})`),
      ),
    )
    .where(
      and(
        inArray(feedPost.id, [...ids]),
        or(isNull(feedThreadSeen.seenAt), gt(reply.createdAt, feedThreadSeen.seenAt)),
      ),
    )
    .groupBy(feedPost.id);
  return new Map(rows.map((row) => [row.id, row.count]));
}

/**
 * The reply-to line: only on a reply that answers another reply, and only while the account that
 * wrote it exists. The name is never given for an anonymous target, to moderators either.
 */
export function replyToOf(post: FeedPostRow, people: Map<string, FeedPerson>): FeedReplyTo | null {
  if (!post.threadId || post.replyToMinecraftUsername === null || !post.replyToUserId) return null;
  const target = people.get(post.replyToUserId);
  if (!target) return null;
  return {
    id: post.replyToId,
    anonymous: post.replyToAnonymous,
    name: post.replyToAnonymous
      ? null
      : displayName(realNameOf(target.name, target.showRealName), post.replyToMinecraftUsername),
  };
}

/** The author block of a post: the account it came from, the person's names and badge now. */
export function authorOf(post: FeedPostRow, people: Map<string, FeedPerson>) {
  const author = people.get(post.authorUserId);
  if (!author) return null;
  return authorBlock(author, { uuid: post.minecraftUuid, username: post.minecraftUsername });
}

function viewOf(post: FeedPostRow, viewer: FeedViewer, ctx: ViewContext): FeedPostView {
  const mine = viewer.userId !== null && post.authorUserId === viewer.userId;
  const seesAuthor = !post.anonymous || mine || viewer.rights.moderate;
  return {
    id: post.id,
    feed: post.feed,
    threadId: post.threadId,
    replyTo: replyToOf(post, ctx.people),
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    anonymous: post.anonymous,
    author: seesAuthor ? authorOf(post, ctx.people) : null,
    likes: post.likeCount,
    replies: post.replyCount,
    pinnedAt: post.pinnedAt?.toISOString() ?? null,
    liked: viewer.userId !== null && ctx.liked.has(`${post.id}:${viewer.userId}`),
    mine,
    canDelete: mine || viewer.deletesOthers,
    canPin: post.feed === 'announcements' && post.threadId === null && viewer.rights.announce,
    unseenReplies: mine ? (ctx.unseen.get(post.id) ?? 0) : 0,
    // A reply of one's own to oneself raises no marker, as markers never count one's own replies.
    answersMe:
      post.threadId !== null &&
      viewer.userId !== null &&
      post.replyToUserId === viewer.userId &&
      !mine,
  };
}

/** The posts as each viewer sees them, in the order given. */
async function viewsFor(
  dbx: Db,
  posts: readonly FeedPostRow[],
  viewers: readonly FeedViewer[],
): Promise<FeedPostView[][]> {
  const ctx = await context(dbx, posts, viewers);
  return viewers.map((viewer) => posts.map((post) => viewOf(post, viewer, ctx)));
}

/** One post as one viewer sees it. */
async function viewFor(dbx: Db, post: FeedPostRow, viewer: FeedViewer): Promise<FeedPostView> {
  const [views] = await viewsFor(dbx, [post], [viewer]);
  return views![0]!;
}

function cursorOf(value: string | undefined): FeedCursor | null {
  if (value === undefined) return null;
  return decodeCursor(value) ?? badRequest();
}

/**
 * A page of a feed, newest first, with the pinned group on the first page of Announcements.
 * Pinned posts are never in `posts`.
 */
async function page(input: {
  who: FeedWho;
  feed: FeedName;
  limit?: number;
  before?: string;
}): Promise<FeedPage> {
  const viewer = await feedRightsService.viewer(db, input.who);
  const limit = input.limit ?? PAGE_DEFAULT;
  const before = cursorOf(input.before);
  const rows = await db
    .select()
    .from(feedPost)
    .where(
      and(
        eq(feedPost.feed, input.feed),
        isNull(feedPost.threadId),
        isNull(feedPost.deletedAt),
        isNull(feedPost.pinnedAt),
        before
          ? or(
              lt(feedPost.createdAt, before.at),
              and(eq(feedPost.createdAt, before.at), lt(feedPost.id, before.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(feedPost.createdAt), desc(feedPost.id))
    .limit(limit + 1);
  const posts = rows.slice(0, limit);
  const last = posts.at(-1);
  const pinned =
    input.feed === 'announcements' && !before
      ? await db
          .select()
          .from(feedPost)
          .where(and(isNotNull(feedPost.pinnedAt), isNull(feedPost.deletedAt)))
          .orderBy(desc(feedPost.pinnedAt), desc(feedPost.id))
          .limit(PIN_LIMIT)
      : [];
  const [views] = await viewsFor(db, [...pinned, ...posts], [viewer]);
  return {
    feed: input.feed,
    pinned: views!.slice(0, pinned.length),
    posts: views!.slice(pinned.length),
    next: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

/** A thread: its main post and a page of replies, oldest first. 404 for a reply's ID. */
async function thread(input: {
  who: FeedWho;
  id: string;
  limit?: number;
  after?: string;
}): Promise<FeedThread> {
  const viewer = await feedRightsService.viewer(db, input.who);
  const limit = input.limit ?? THREAD_DEFAULT;
  const after = cursorOf(input.after);
  const main = await livePost(db, input.id);
  if (main.threadId) refuse(404, 'notFound');
  const rows = await db
    .select()
    .from(feedPost)
    .where(
      and(
        eq(feedPost.threadId, main.id),
        isNull(feedPost.deletedAt),
        after
          ? or(
              gt(feedPost.createdAt, after.at),
              and(eq(feedPost.createdAt, after.at), gt(feedPost.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(feedPost.createdAt), asc(feedPost.id))
    .limit(limit + 1);
  const replies = rows.slice(0, limit);
  const last = replies.at(-1);
  const [views] = await viewsFor(db, [main, ...replies], [viewer]);
  return {
    post: views![0]!,
    replies: views!.slice(1),
    next: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

/** Live posts by ID, in the order given; deleted and unknown ones are left out. */
async function liveByIds(dbx: Db, ids: readonly string[]): Promise<FeedPostRow[]> {
  if (!ids.length) return [];
  const rows = await dbx
    .select()
    .from(feedPost)
    .where(and(inArray(feedPost.id, [...ids]), isNull(feedPost.deletedAt)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  // PostgreSQL finds a uuid whatever its case; the rows come back lowercased.
  return ids.flatMap((id) => byId.get(id.toLowerCase()) ?? []);
}

/** Many players' views of a few posts, for what the stream announces (`POST /views`). */
async function views(input: { viewers: string[]; ids: string[] }): Promise<FeedViewsResult> {
  const [viewers, posts] = await Promise.all([
    feedRightsService.viewersOfPlayers(db, input.viewers),
    liveByIds(db, input.ids),
  ]);
  const ordered = input.viewers.map((uuid) => viewers.get(uuid)!);
  const all = await viewsFor(db, posts, ordered);
  return { views: input.viewers.map((viewer, index) => ({ viewer, posts: all[index]! })) };
}

/** One reader's views of a few posts (the browser's `GET /api/feed/views`). */
async function viewsOf(who: FeedWho, ids: string[]): Promise<{ posts: FeedPostView[] }> {
  const [viewer, posts] = await Promise.all([
    feedRightsService.viewer(db, who),
    liveByIds(db, ids),
  ]);
  const [mine] = await viewsFor(db, posts, [viewer]);
  return { posts: mine! };
}

export const feedViewService = { viewsFor, viewFor, page, thread, views, viewsOf };
