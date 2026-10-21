import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { mod } from '~~/server/db/schema';
import { modsEnv } from '~~/server/lib/mods-env';
import { wardenAuditService } from '~~/server/services/warden/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { CatalogUnavailableError, modCatalog } from './catalog';
import type { CatalogProject } from './catalog';
import { modIconService } from './icons';
import { catalogIconPath, changedDetails } from './rules';
import { modSettingsService } from './settings';
import { iconUrl, refuse } from './shared';

import type { ModRefreshBody, ModRefreshChange, ModRefreshCheck } from '#shared/schemas/mods';

// Refetching a mod's details from Modrinth or CurseForge. Checking changes nothing: the admin
// reviews the differences, then applies the ones they accept. See docs/mods.md.

type WebActor = WardenActor & { source: 'web' };

/** The mod, and its project fetched fresh. Undefined when the source no longer has it. */
async function load(modId: number) {
  const [row] = await db
    .select({
      id: mod.id,
      source: mod.source,
      sourceId: mod.sourceId,
      name: mod.name,
      summary: mod.summary,
      pageUrl: mod.pageUrl,
      iconKey: mod.iconKey,
      proposerUserId: mod.proposerUserId,
    })
    .from(mod)
    .where(eq(mod.id, modId));
  if (!row) refuse(404, 'notFound');
  // Mods added by hand have no source to ask.
  if (row.source === 'manual' || !row.sourceId) refuse(409, 'manual');
  // Without the key, an unanswered CurseForge mod would look like a deleted one.
  if (row.source === 'curseforge' && !modsEnv().CURSEFORGE_API_KEY)
    refuse(502, 'sourceUnavailable');

  const settings = await modSettingsService.get();
  let project: CatalogProject | undefined;
  try {
    project = await modCatalog.project(row.source, row.sourceId, settings);
  } catch (error) {
    if (error instanceof CatalogUnavailableError) refuse(502, 'sourceUnavailable');
    throw error;
  }
  return { row, project };
}

/** What would change if the mod's details were refreshed. Writes nothing. */
async function check(modId: number): Promise<ModRefreshCheck> {
  const { row, project } = await load(modId);
  if (!project) return { status: 'gone', changes: [], compatible: false };

  const changes: ModRefreshChange[] = changedDetails(row, project).map((field) => ({
    field,
    from: row[field],
    to: project[field],
  }));
  if (project.iconUrl && (await modIconService.differs(row.iconKey, project.iconUrl))) {
    changes.push({ field: 'icon', from: iconUrl(row), to: catalogIconPath(project.iconUrl) });
  }
  return {
    status: changes.length > 0 ? 'changed' : 'unchanged',
    changes,
    compatible: project.compatible,
  };
}

/**
 * Applies the accepted fields. The values come from the source again, never from the client, so
 * they can't be forged. A field that no longer differs is skipped.
 */
async function apply(input: { modId: number; body: ModRefreshBody; actor: WebActor }) {
  const { row, project } = await load(input.modId);
  if (!project) refuse(404, 'notFound');

  const fields = new Set(input.body.fields);
  const set: Partial<typeof mod.$inferInsert> = {};
  for (const field of changedDetails(row, project)) {
    if (fields.has(field)) set[field] = project[field];
  }
  let newIconKey: string | null = null;
  if (
    fields.has('icon') &&
    project.iconUrl &&
    (await modIconService.differs(row.iconKey, project.iconUrl))
  ) {
    newIconKey = await modIconService.save(project.iconUrl);
    if (newIconKey) set.iconKey = newIconKey;
  }
  const applied = Object.keys(set).map((key) => (key === 'iconKey' ? 'icon' : key));
  if (applied.length === 0) return;

  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(mod)
        .set(set)
        .where(eq(mod.id, row.id))
        .returning({ id: mod.id });
      if (!updated) refuse(404, 'notFound');
      await wardenAuditService.record(tx, {
        action: 'mod.refresh',
        actor: input.actor,
        targetUserId: row.proposerUserId,
        data: { modId: row.id, name: set.name ?? row.name, fields: applied },
      });
    });
  } catch (error) {
    await modIconService.remove(newIconKey);
    throw error;
  }
  if (newIconKey) await modIconService.remove(row.iconKey);
}

export const modRefreshService = { check, apply };
