import { index, pgTable, primaryKey, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

import { user } from './auth';

// The Minecraft changelog. See docs/changelog.md.

export type ChangelogStatus = 'draft' | 'scheduled' | 'published';
export type ChangelogLang = 'en' | 'fr';

/**
 * A post. The source language's title and body are always filled; the other language's are null
 * until a translation is saved. Deleting is an unpublish (status back to `draft`), never a row
 * delete.
 */
export const changelogPost = pgTable(
  'changelog_post',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // From the source title when created, then never changed, so links stay.
    slug: text('slug').notNull().unique(),
    sourceLang: text('source_lang').$type<ChangelogLang>().notNull(),
    titleEn: text('title_en'),
    titleFr: text('title_fr'),
    summaryEn: text('summary_en'),
    summaryFr: text('summary_fr'),
    bodyEn: text('body_en'),
    bodyFr: text('body_fr'),
    // True while the translation is a machine draft no editor has saved yet.
    translationUnreviewed: boolean('translation_unreviewed').default(false).notNull(),
    versionTag: text('version_tag'),
    // A key in the event-images storage, served from /api/media/<key>.
    coverKey: text('cover_key'),
    status: text('status').$type<ChangelogStatus>().default('draft').notNull(),
    // When published, or when a scheduled post goes out. Null for a draft.
    publishedAt: timestamp('published_at'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('changelog_post_status_published_idx').on(table.status, table.publishedAt)],
);

/**
 * A player has seen a post, by Minecraft UUID. No foreign key: players with no linked site account
 * have seen state too. Deleted with the site account by `changelogService.forgetUsers`.
 */
export const changelogSeen = pgTable(
  'changelog_seen',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => changelogPost.id, { onDelete: 'cascade' }),
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    seenAt: timestamp('seen_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.minecraftUuid] })],
);
