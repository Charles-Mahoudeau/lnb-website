import { and, desc, eq, lt, lte, notExists, or, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { changelogPost, changelogSeen, minecraftAccount } from '~~/server/db/schema';
import type { ChangelogLang } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';
import type { AuditActor } from '~~/server/services/audit';
import { renderChangelog } from '~~/server/services/events/markdown';

// The Minecraft changelog (docs/changelog.md): posts in one source language with an optional
// translation, published by hand or by the scheduled job, and which post a player has seen.

type Post = typeof changelogPost.$inferSelect;

/** A post not seen is offered to a player for this long after it is published. */
export const UNSEEN_DAYS = 14;
const MAX_PAGE = 50;

export interface ChangelogText {
  title: string;
  summary?: string | null;
  body: string;
}

export interface ChangelogInput {
  sourceLang: ChangelogLang;
  source: ChangelogText;
  versionTag?: string | null;
  coverKey?: string | null;
}

export type ChangelogUpdate = Partial<Omit<ChangelogInput, 'sourceLang' | 'source'>> & {
  /** Replaces the source text. */
  source?: Partial<ChangelogText>;
  /** Replaces the other language's text. An editor saving it marks it reviewed. */
  translation?: ChangelogText;
};

/** A post in one language: the one asked for, or the source when that one has no text. */
export interface ChangelogView {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  versionTag: string | null;
  coverKey: string | null;
  status: Post['status'];
  publishedAt: Date | null;
  /** The language actually returned. */
  lang: ChangelogLang;
  sourceLang: ChangelogLang;
  hasTranslation: boolean;
  translationUnreviewed: boolean;
}

function refuse(status: number, problem: string): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

const other = (lang: ChangelogLang): ChangelogLang => (lang === 'en' ? 'fr' : 'en');
const cap = (lang: ChangelogLang) => (lang === 'en' ? 'En' : 'Fr');

function textOf(post: Post, lang: ChangelogLang) {
  const key = cap(lang);
  return {
    title: post[`title${key}`],
    summary: post[`summary${key}`],
    body: post[`body${key}`],
  };
}

function textColumns(lang: ChangelogLang, text: ChangelogText) {
  const key = cap(lang);
  return {
    [`title${key}`]: text.title.trim(),
    [`summary${key}`]: text.summary?.trim() || null,
    [`body${key}`]: text.body,
  };
}

/** The post in `lang`, or in its source language when it has no text in `lang`. */
function view(post: Post, lang: ChangelogLang): ChangelogView {
  const returned = textOf(post, lang).title ? lang : post.sourceLang;
  const text = textOf(post, returned);
  return {
    id: post.id,
    slug: post.slug,
    title: text.title ?? '',
    summary: text.summary,
    body: text.body ?? '',
    versionTag: post.versionTag,
    coverKey: post.coverKey,
    status: post.status,
    publishedAt: post.publishedAt,
    lang: returned,
    sourceLang: post.sourceLang,
    hasTranslation: Boolean(textOf(post, other(post.sourceLang)).title),
    translationUnreviewed: post.translationUnreviewed,
  };
}

/** The body as safe HTML. */
export function renderBody(markdown: string): string {
  return renderChangelog(markdown);
}

function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'post'
  );
}

async function freeSlug(tx: Tx, title: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : base + '-' + String(n);
    const [taken] = await tx
      .select({ id: changelogPost.id })
      .from(changelogPost)
      .where(eq(changelogPost.slug, slug));
    if (!taken) return slug;
  }
}

async function load(tx: Tx, id: string, lock = true): Promise<Post> {
  const query = tx.select().from(changelogPost).where(eq(changelogPost.id, id));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) refuse(404, 'notFound');
  return row;
}

function audited(
  tx: Tx,
  action: Parameters<typeof auditService.record>[1]['action'],
  actor: AuditActor,
  post: Post,
) {
  return auditService.record(tx, { action, actor, data: { postId: post.id, name: titleOf(post) } });
}

const titleOf = (post: Post) => textOf(post, post.sourceLang).title ?? '';

const webActor = (userId: string): AuditActor => ({ source: 'web', userId });

async function create(input: ChangelogInput, actorId: string): Promise<Post> {
  if (!input.source.title.trim() || !input.source.body.trim()) refuse(400, 'invalid');
  return db.transaction(async (tx) => {
    const [post] = await tx
      .insert(changelogPost)
      .values({
        slug: await freeSlug(tx, input.source.title),
        sourceLang: input.sourceLang,
        ...textColumns(input.sourceLang, input.source),
        versionTag: input.versionTag?.trim() || null,
        coverKey: input.coverKey ?? null,
        createdBy: actorId,
      })
      .returning();
    await audited(tx, 'minecraft.changelog.create', webActor(actorId), post!);
    return post!;
  });
}

async function update(id: string, patch: ChangelogUpdate, actorId: string): Promise<Post> {
  return db.transaction(async (tx) => {
    const post = await load(tx, id);
    const values: Partial<Post> = { updatedAt: new Date() };
    if (patch.source) {
      const merged = { ...textOf(post, post.sourceLang), ...patch.source };
      if (!merged.title?.trim() || !merged.body?.trim()) refuse(400, 'invalid');
      Object.assign(values, textColumns(post.sourceLang, merged as ChangelogText));
    }
    if (patch.translation) {
      Object.assign(values, textColumns(other(post.sourceLang), patch.translation));
      values.translationUnreviewed = false;
    }
    if (patch.versionTag !== undefined) values.versionTag = patch.versionTag?.trim() || null;
    if (patch.coverKey !== undefined) values.coverKey = patch.coverKey;
    const [updated] = await tx
      .update(changelogPost)
      .set(values)
      .where(eq(changelogPost.id, id))
      .returning();
    await audited(tx, 'minecraft.changelog.update', webActor(actorId), updated!);
    return updated!;
  });
}

/** Stores a machine translation as a draft: it stays "not reviewed" until an editor saves it. */
async function saveTranslation(id: string, text: ChangelogText, actorId: string): Promise<Post> {
  return db.transaction(async (tx) => {
    const post = await load(tx, id);
    const [updated] = await tx
      .update(changelogPost)
      .set({
        ...textColumns(other(post.sourceLang), text),
        translationUnreviewed: true,
        updatedAt: new Date(),
      })
      .where(eq(changelogPost.id, id))
      .returning();
    await audited(tx, 'minecraft.changelog.translate', webActor(actorId), updated!);
    return updated!;
  });
}

/** Publishes a draft or scheduled post now. Publishing a published post changes nothing. */
async function publish(id: string, actor: AuditActor, now = new Date()): Promise<Post> {
  return db.transaction(async (tx) => {
    const post = await load(tx, id);
    if (post.status === 'published') return post;
    const [updated] = await tx
      .update(changelogPost)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(changelogPost.id, id))
      .returning();
    await audited(tx, 'minecraft.changelog.publish', actor, updated!);
    return updated!;
  });
}

/** Puts a post back to draft. It leaves the site and the API; the seen rows stay. */
async function unpublish(id: string, actorId: string): Promise<Post> {
  return db.transaction(async (tx) => {
    const post = await load(tx, id);
    if (post.status === 'draft') return post;
    const [updated] = await tx
      .update(changelogPost)
      .set({ status: 'draft', publishedAt: null, updatedAt: new Date() })
      .where(eq(changelogPost.id, id))
      .returning();
    await audited(tx, 'minecraft.changelog.unpublish', webActor(actorId), updated!);
    return updated!;
  });
}

/** Schedules a post for a later date. A date that has passed is refused: publish instead. */
async function schedule(id: string, at: Date, actorId: string, now = new Date()): Promise<Post> {
  if (at <= now) refuse(400, 'invalid');
  return db.transaction(async (tx) => {
    const post = await load(tx, id);
    if (post.status === 'published') refuse(409, 'alreadyPublished');
    const [updated] = await tx
      .update(changelogPost)
      .set({ status: 'scheduled', publishedAt: at, updatedAt: now })
      .where(eq(changelogPost.id, id))
      .returning();
    return updated!;
  });
}

/** Publishes the scheduled posts whose date has passed. Returns how many. */
async function publishDue(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: changelogPost.id })
    .from(changelogPost)
    .where(and(eq(changelogPost.status, 'scheduled'), lte(changelogPost.publishedAt, now)));
  let count = 0;
  for (const { id } of due) {
    // The post keeps its scheduled date as its publish date, not the minute the job ran.
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(changelogPost)
        .set({ status: 'published', updatedAt: now })
        .where(and(eq(changelogPost.id, id), eq(changelogPost.status, 'scheduled')))
        .returning();
      if (!row) return;
      await audited(tx, 'minecraft.changelog.publish', { source: 'system' }, row);
      count++;
    });
  }
  return count;
}

/** Every post for the admin list, drafts and scheduled first by date. */
async function listAdmin(): Promise<Post[]> {
  return db
    .select()
    .from(changelogPost)
    .orderBy(desc(sql`coalesce(${changelogPost.publishedAt}, ${changelogPost.createdAt})`));
}

function encodeCursor(post: Post): string {
  return Buffer.from(`${post.publishedAt!.toISOString()}|${post.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  if (!id || Number.isNaN(at.getTime())) refuse(400, 'invalid');
  return { at, id };
}

/** Published posts, newest first. `next` is the cursor of the following page, or null. */
async function listPublished(input: {
  lang: ChangelogLang;
  limit?: number;
  before?: string;
}): Promise<{ posts: ChangelogView[]; next: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), MAX_PAGE);
  const cursor = input.before ? decodeCursor(input.before) : null;
  const rows = await db
    .select()
    .from(changelogPost)
    .where(
      and(
        eq(changelogPost.status, 'published'),
        cursor
          ? or(
              lt(changelogPost.publishedAt, cursor.at),
              and(eq(changelogPost.publishedAt, cursor.at), lt(changelogPost.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(changelogPost.publishedAt), desc(changelogPost.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    posts: page.map((row) => view(row, input.lang)),
    next: rows.length > limit ? encodeCursor(page.at(-1)!) : null,
  };
}

/** One post by ID or slug. The public callers pass `publishedOnly`. */
async function get(
  key: { id: string } | { slug: string },
  options: { lang?: ChangelogLang; publishedOnly?: boolean } = {},
): Promise<ChangelogView | null> {
  const [row] = await db
    .select()
    .from(changelogPost)
    .where(
      and(
        'id' in key ? eq(changelogPost.id, key.id) : eq(changelogPost.slug, key.slug),
        options.publishedOnly ? eq(changelogPost.status, 'published') : undefined,
      ),
    );
  return row ? view(row, options.lang ?? row.sourceLang) : null;
}

/** The raw row, for the admin editor, which edits both languages. */
async function getRow(id: string): Promise<Post | null> {
  const [row] = await db.select().from(changelogPost).where(eq(changelogPost.id, id));
  return row ?? null;
}

/** The latest published post under 14 days old that the player hasn't seen, or null. */
async function unseenFor(
  minecraftUuid: string,
  lang: ChangelogLang,
  now = new Date(),
): Promise<ChangelogView | null> {
  const since = new Date(now.getTime() - UNSEEN_DAYS * 86_400_000);
  const [row] = await db
    .select()
    .from(changelogPost)
    .where(
      and(
        eq(changelogPost.status, 'published'),
        lte(changelogPost.publishedAt, now),
        sql`${changelogPost.publishedAt} > ${since}`,
        notExists(
          db
            .select({ one: sql`1` })
            .from(changelogSeen)
            .where(
              and(
                eq(changelogSeen.postId, changelogPost.id),
                eq(changelogSeen.minecraftUuid, minecraftUuid),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(changelogPost.publishedAt))
    .limit(1);
  return row ? view(row, lang) : null;
}

/** Marks a post seen. Idempotent. A UUID no site account has linked is ignored. */
async function markSeen(postId: string, minecraftUuid: string): Promise<void> {
  const [post] = await db
    .select({ id: changelogPost.id })
    .from(changelogPost)
    .where(eq(changelogPost.id, postId));
  if (!post) refuse(404, 'notFound');
  const [account] = await db
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, minecraftUuid));
  if (!account) return;
  await db.insert(changelogSeen).values({ postId, minecraftUuid }).onConflictDoNothing();
}

export const changelogService = {
  create,
  update,
  saveTranslation,
  publish,
  unpublish,
  schedule,
  publishDue,
  listAdmin,
  listPublished,
  get,
  getRow,
  unseenFor,
  markSeen,
};
