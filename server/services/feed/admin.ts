import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedPost, user } from '~~/server/db/schema';

import { feedRightsService } from './rights';
import type { FeedPerson } from './rights';
import { ADMIN_PAGE, DAY_MS, KEEP_DAYS, decodeCursor, encodeCursor } from './rules';
import { badRequest, refuse } from './shared';
import type { FeedPostRow } from './shared';
import { authorOf, replyToOf } from './views';

import type {
  FeedAdminDetail,
  FeedAdminList,
  FeedAdminListQuery,
  FeedAdminPost,
} from '#shared/schemas/feed';

// The admin's Feed table (docs/feed.md, "For the admin"), for moderators: live and deleted rows
// together, authors always shown, anonymous ones too. Reading leaves no trace.

/** `%` and `_` typed in a search match themselves. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function filters(query: FeedAdminListQuery): SQL | undefined {
  const pattern = query.q ? likePattern(query.q) : null;
  return and(
    inArray(feedPost.feed, query.feeds),
    query.replies ? isNotNull(feedPost.threadId) : undefined,
    query.anonymous ? eq(feedPost.anonymous, true) : undefined,
    query.deleted ? isNotNull(feedPost.deletedAt) : undefined,
    query.user ? eq(feedPost.authorUserId, query.user) : undefined,
    pattern
      ? or(
          ilike(feedPost.text, pattern),
          ilike(feedPost.minecraftUsername, pattern),
          ilike(user.name, pattern),
        )
      : undefined,
  );
}

async function adminViews(rows: readonly FeedPostRow[]): Promise<FeedAdminPost[]> {
  const people = await feedRightsService.people(db, [
    ...rows.map((row) => row.authorUserId),
    ...rows.flatMap((row) => row.replyToUserId ?? []),
  ]);
  const deleters = await feedRightsService.people(
    db,
    rows.flatMap((row) =>
      row.deletedCause === 'moderator' && row.deletedByUserId ? [row.deletedByUserId] : [],
    ),
  );
  return rows.map((row) => adminView(row, people, deleters));
}

function adminView(
  row: FeedPostRow,
  people: Map<string, FeedPerson>,
  deleters: Map<string, FeedPerson>,
): FeedAdminPost {
  const author = authorOf(row, people) ?? {
    uuid: row.minecraftUuid,
    username: row.minecraftUsername,
    realName: null,
    announcer: false,
  };
  const deleter =
    row.deletedCause === 'moderator' && row.deletedByUserId
      ? deleters.get(row.deletedByUserId)
      : undefined;
  return {
    id: row.id,
    feed: row.feed,
    threadId: row.threadId,
    replyTo: replyToOf(row, people),
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    anonymous: row.anonymous,
    author,
    likes: row.likeCount,
    replies: row.replyCount,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    authorUserId: row.authorUserId,
    source: row.source,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    deletedBy: deleter ? { userId: deleter.userId, name: deleter.name } : null,
    deletedCause: row.deletedCause,
    deletedReason: row.deletedReason,
    purgeAt: row.deletedAt
      ? new Date(row.deletedAt.getTime() + KEEP_DAYS * DAY_MS).toISOString()
      : null,
  };
}

/** The table: main posts and replies, newest first, 50 per page, with the filters' summary. */
async function list(query: FeedAdminListQuery, now = new Date()): Promise<FeedAdminList> {
  const cursor = query.cursor ? (decodeCursor(query.cursor) ?? badRequest()) : null;
  const where = filters(query);
  const [rows, [summary]] = await Promise.all([
    db
      .select({ post: feedPost })
      .from(feedPost)
      .innerJoin(user, eq(user.id, feedPost.authorUserId))
      .where(
        and(
          where,
          cursor
            ? or(
                lt(feedPost.createdAt, cursor.at),
                and(eq(feedPost.createdAt, cursor.at), lt(feedPost.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(feedPost.createdAt), desc(feedPost.id))
      .limit(ADMIN_PAGE + 1),
    db
      .select({
        last30Days: count(),
        deleted: sql<number>`count(${feedPost.deletedAt})::int`,
      })
      .from(feedPost)
      .innerJoin(user, eq(user.id, feedPost.authorUserId))
      .where(and(where, gte(feedPost.createdAt, new Date(now.getTime() - KEEP_DAYS * DAY_MS)))),
  ]);
  const page = rows.slice(0, ADMIN_PAGE).map((row) => row.post);
  const last = page.at(-1);
  return {
    items: await adminViews(page),
    nextCursor: rows.length > ADMIN_PAGE && last ? encodeCursor(last.createdAt, last.id) : null,
    summary: { last30Days: summary?.last30Days ?? 0, deleted: summary?.deleted ?? 0 },
  };
}

/** One row for the drawer, and its whole thread, deleted replies included. */
async function detail(id: string): Promise<FeedAdminDetail> {
  const [row] = await db.select().from(feedPost).where(eq(feedPost.id, id));
  if (!row) refuse(404, 'notFound');
  const mainId = row.threadId ?? row.id;
  const [main] = row.threadId
    ? await db.select().from(feedPost).where(eq(feedPost.id, mainId))
    : [row];
  const replies = await db
    .select()
    .from(feedPost)
    .where(eq(feedPost.threadId, mainId))
    .orderBy(asc(feedPost.createdAt), asc(feedPost.id));
  const views = await adminViews([row, main!, ...replies]);
  return { post: views[0]!, thread: { post: views[1]!, replies: views.slice(2) } };
}

export const feedAdminService = { list, detail };
