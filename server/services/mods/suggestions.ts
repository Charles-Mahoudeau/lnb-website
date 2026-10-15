import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { mod } from '~~/server/db/schema';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import { CatalogUnavailableError, modCatalog } from './catalog';
import type { CatalogProject } from './catalog';
import { modIconService } from './icons';
import { suggestionsUsed } from './list';
import { catalogIconPath, createRateLimiter } from './rules';
import { modSettingsService } from './settings';
import { refuse } from './shared';

import type { ModCatalogSource, ModSearchResult } from '#shared/schemas/mods';

// Search, and what people do with their own suggestions.

/** 20 searches a minute per account: enough to type, not enough to scrape. */
const allowSearch = createRateLimiter(20, 60_000);

/** Whether an error is PostgreSQL's unique violation, wrapped by Drizzle or not. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown }).cause) === '23505';
}

/** Catalog results, each marked with whether it can be added. */
async function search(input: { actorId: string; query: string }): Promise<ModSearchResult[]> {
  if (!allowSearch(input.actorId)) refuse(429, 'rateLimited');
  const settings = await modSettingsService.get();
  let projects: CatalogProject[];
  try {
    projects = await modCatalog.search(input.query, settings);
  } catch (error) {
    if (error instanceof CatalogUnavailableError) refuse(502, 'sourceUnavailable');
    throw error;
  }
  if (projects.length === 0) return [];

  const existing = await db
    .select({ id: mod.id, source: mod.source, sourceId: mod.sourceId, status: mod.status })
    .from(mod)
    .where(
      inArray(
        mod.sourceId,
        projects.map((project) => project.sourceId),
      ),
    );
  const bySource = new Map(existing.map((row) => [`${row.source}:${row.sourceId ?? ''}`, row]));

  return projects.map((project) => {
    const known = bySource.get(`${project.source}:${project.sourceId}`);
    const status = known
      ? known.status === 'removed'
        ? 'removed'
        : 'listed'
      : project.compatible
        ? 'available'
        : 'incompatible';
    return {
      source: project.source,
      sourceId: project.sourceId,
      name: project.name,
      summary: project.summary,
      author: project.author,
      downloads: project.downloads,
      pageUrl: project.pageUrl,
      iconUrl: catalogIconPath(project.iconUrl),
      status,
      listedModId: status === 'listed' && known ? known.id : null,
    };
  });
}

/**
 * Fetches a project fresh and checks it can be added: it exists, it runs on the server, and it
 * isn't in the list already (removed ones included). Downloads its icon.
 */
export async function fetchAddable(source: ModCatalogSource, sourceId: string) {
  // Before calling the source, so a listed mod gets "already in the list" even when it no
  // longer fits the server. Checked again with the ID the source answers with.
  await refuseIfListed(source, sourceId);
  const settings = await modSettingsService.get();
  let project: CatalogProject | undefined;
  try {
    project = await modCatalog.project(source, sourceId, settings);
  } catch (error) {
    if (error instanceof CatalogUnavailableError) refuse(502, 'sourceUnavailable');
    throw error;
  }
  if (!project) refuse(404, 'notFound');
  if (!project.compatible) refuse(409, 'incompatible');
  await refuseIfListed(source, project.sourceId);
  const iconKey = project.iconUrl ? await modIconService.save(project.iconUrl) : null;
  return { project, iconKey, settings };
}

async function refuseIfListed(source: ModCatalogSource, sourceId: string, dbx: Db = db) {
  const [known] = await dbx
    .select({ status: mod.status })
    .from(mod)
    .where(and(eq(mod.source, source), eq(mod.sourceId, sourceId)));
  if (known) refuse(409, known.status === 'removed' ? 'removed' : 'duplicate');
}

/** Adds a suggestion, within the actor's limit. */
async function suggest(input: {
  actorId: string;
  source: ModCatalogSource;
  sourceId: string;
  reason: string;
}): Promise<{ id: number }> {
  const before = await modSettingsService.get();
  if (!before.open) refuse(409, 'closed');
  if (await wardenModerationService.activeBan(input.actorId)) refuse(403, 'banned');
  // Checked again in the transaction. This one saves a call to the source.
  if ((await suggestionsUsed(input.actorId)) >= before.maxSuggestions) refuse(409, 'limitReached');

  const { project, iconKey, settings } = await fetchAddable(input.source, input.sourceId);
  try {
    return await db.transaction(async (tx) => {
      // One suggestion at a time per account, so two at once can't both fit the last slot.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`mod-suggest:${input.actorId}`}))`,
      );
      if ((await suggestionsUsed(input.actorId, tx)) >= settings.maxSuggestions) {
        refuse(409, 'limitReached');
      }
      await refuseIfListed(input.source, project.sourceId, tx);
      const [row] = await tx
        .insert(mod)
        .values({
          list: 'suggestion',
          source: project.source,
          sourceId: project.sourceId,
          name: project.name,
          summary: project.summary,
          pageUrl: project.pageUrl,
          iconKey,
          proposerUserId: input.actorId,
          reason: input.reason,
        })
        .returning({ id: mod.id });
      return { id: row!.id };
    });
  } catch (error) {
    await modIconService.remove(iconKey);
    // Someone else suggested the same mod at the same moment.
    if (isUniqueViolation(error)) refuse(409, 'duplicate');
    throw error;
  }
}

/** The actor's own visible suggestion, or a 404. */
function ownSuggestion(actorId: string, modId: number) {
  return and(
    eq(mod.id, modId),
    eq(mod.proposerUserId, actorId),
    eq(mod.list, 'suggestion'),
    eq(mod.status, 'visible'),
  );
}

/** Changes the reason. The votes stay. */
async function editReason(input: { actorId: string; modId: number; reason: string }) {
  const updated = await db
    .update(mod)
    .set({ reason: input.reason })
    .where(ownSuggestion(input.actorId, input.modId))
    .returning({ id: mod.id });
  if (updated.length === 0) refuse(404, 'notFound');
}

/**
 * Deletes the actor's suggestion with its votes, which frees the mod and the slot. Removed
 * suggestions can't be withdrawn: they keep counting toward the limit.
 */
async function withdraw(input: { actorId: string; modId: number }) {
  const [deleted] = await db
    .delete(mod)
    .where(ownSuggestion(input.actorId, input.modId))
    .returning({ iconKey: mod.iconKey });
  if (!deleted) refuse(404, 'notFound');
  await modIconService.remove(deleted.iconKey);
}

/** Hides the removal notice of one of the actor's removed suggestions. */
async function dismissRemoval(input: { actorId: string; modId: number }) {
  const updated = await db
    .update(mod)
    .set({ removalSeenAt: new Date() })
    .where(
      and(
        eq(mod.id, input.modId),
        eq(mod.proposerUserId, input.actorId),
        eq(mod.status, 'removed'),
        isNull(mod.removalSeenAt),
      ),
    )
    .returning({ id: mod.id });
  if (updated.length === 0) refuse(404, 'notFound');
}

export const modSuggestionService = { search, suggest, editReason, withdraw, dismissRemoval };
