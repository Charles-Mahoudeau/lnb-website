import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { minecraftAccount } from './warden';

// Feed, the short-post feed of the Minecraft server, read and written in game on the LNB Phone
// and in the browser. See docs/feed.md (the feature) and docs/feed-mod.md (the mod's contract).

export type FeedName = 'announcements' | 'global';
export type FeedSource = 'server' | 'site';
export type FeedDeletedCause = 'author' | 'moderator' | 'thread';
export type FeedNotificationKind = 'announcement' | 'reply';

/**
 * A main post (`thread_id` null) or a reply in its thread. Deleting sets `deleted_at` and hides the
 * row from everyone; the nightly purge removes it 30 days later. The author's names are read at
 * answer time, from Warden, except the Minecraft account it was posted from, which is history.
 */
export const feedPost = pgTable(
  'feed_post',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feed: text('feed').$type<FeedName>().notNull(),
    threadId: uuid('thread_id').references((): AnyPgColumn => feedPost.id, {
      onDelete: 'cascade',
    }),
    // The reply this reply answers; null when it answers the main post.
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => feedPost.id, {
      onDelete: 'set null',
    }),
    // The author of what it answers, for notifications and markers. Never sent to clients.
    replyToUserId: text('reply_to_user_id').references(() => user.id, { onDelete: 'set null' }),
    replyToAnonymous: boolean('reply_to_anonymous').default(false).notNull(),
    // For the reply-to line once the answered reply is purged.
    replyToMinecraftUsername: text('reply_to_minecraft_username'),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // No foreign key: unlinking the account, or a takeover, keeps the post as it was.
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    minecraftUsername: text('minecraft_username').notNull(),
    source: text('source').$type<FeedSource>().notNull(),
    text: text('text').notNull(),
    anonymous: boolean('anonymous').default(false).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    replyCount: integer('reply_count').default(0).notNull(),
    pinnedAt: timestamp('pinned_at'),
    pinnedByUserId: text('pinned_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    deletedByUserId: text('deleted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    deletedCause: text('deleted_cause').$type<FeedDeletedCause>(),
    deletedReason: text('deleted_reason'),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    fingerprint: text('fingerprint').notNull(),
  },
  (table) => [
    check('feed_post_text_length', sql`char_length(${table.text}) between 1 and 280`),
    check('feed_post_feed_check', sql`${table.feed} in ('announcements', 'global')`),
    check('feed_post_source_check', sql`${table.source} in ('server', 'site')`),
    check(
      'feed_post_pinned_check',
      sql`${table.pinnedAt} is null or (${table.threadId} is null and ${table.feed} = 'announcements')`,
    ),
    check(
      'feed_post_reply_to_check',
      sql`${table.replyToId} is null or ${table.threadId} is not null`,
    ),
    check(
      'feed_post_deleted_cause_check',
      sql`${table.deletedCause} is null or ${table.deletedCause} in ('author', 'moderator', 'thread')`,
    ),
    index('feed_post_feed_idx')
      .on(table.feed, table.createdAt.desc(), table.id.desc())
      .where(
        sql`${table.threadId} is null and ${table.deletedAt} is null and ${table.pinnedAt} is null`,
      ),
    index('feed_post_thread_idx')
      .on(table.threadId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    index('feed_post_pinned_idx')
      .on(table.pinnedAt)
      .where(sql`${table.pinnedAt} is not null`),
    index('feed_post_author_idx').on(table.authorUserId, table.createdAt),
    index('feed_post_reply_to_user_idx')
      .on(table.replyToUserId, table.threadId)
      .where(sql`${table.deletedAt} is null`),
    index('feed_post_reply_to_idx').on(table.replyToId),
    index('feed_post_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} is not null`),
  ],
);

/** One like per LNB account and post, whatever Minecraft account gave it. */
export const feedLike = pgTable(
  'feed_like',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPost.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index('feed_like_user_idx').on(table.userId),
  ],
);

/**
 * An LNB account that used Feed: the browser's posting account and when it last viewed each feed
 * (the unread dots). Created on first need.
 */
export const feedMember = pgTable('feed_member', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  postingMinecraftUuid: uuid('posting_minecraft_uuid').references(() => minecraftAccount.uuid, {
    onDelete: 'set null',
  }),
  announcementsSeenAt: timestamp('announcements_seen_at'),
  globalSeenAt: timestamp('global_seen_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** When an LNB account last opened a thread, for the unseen-replies markers. */
export const feedThreadSeen = pgTable(
  'feed_thread_seen',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => feedPost.id, { onDelete: 'cascade' }),
    seenAt: timestamp('seen_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.threadId] })],
);

/**
 * A notification waiting for the Minecraft server, which delivers it with the phone's
 * notifications and acknowledges it (the row is then deleted). Null recipient: everyone, for an
 * announcement.
 */
export const feedNotification = pgTable(
  'feed_notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<FeedNotificationKind>().notNull(),
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPost.id, { onDelete: 'cascade' }),
    recipientUserId: text('recipient_user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check('feed_notification_kind_check', sql`${table.kind} in ('announcement', 'reply')`),
    index('feed_notification_created_at_idx').on(table.createdAt),
  ],
);
