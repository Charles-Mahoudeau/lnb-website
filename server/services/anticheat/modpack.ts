import { and, eq, inArray } from 'drizzle-orm';

import { anticheatFile, anticheatProject, mod } from '~~/server/db/schema';

import type { Tx } from './shared';

// The official mod list as approvals: a visible official entry counts as approved at scoring time,
// and nothing is copied. See docs/anticheat.md.

export interface ModpackProject {
  modrinthId: string | null;
  curseforgeId: string | null;
}

/** The visible official entries, loaded once to match many files. */
export interface Modpack {
  has(file: { sha512: string }, project: ModpackProject | null): boolean;
}

async function load(tx: Tx): Promise<Modpack> {
  const rows = await tx
    .select({ source: mod.source, sourceId: mod.sourceId, fileSha512: mod.fileSha512 })
    .from(mod)
    .where(and(eq(mod.list, 'official'), eq(mod.status, 'visible')));
  const modrinth = new Set<string>();
  const curseforge = new Set<string>();
  const hashes = new Set<string>();
  for (const row of rows) {
    if (row.source === 'modrinth' && row.sourceId) modrinth.add(row.sourceId);
    if (row.source === 'curseforge' && row.sourceId) curseforge.add(row.sourceId);
    if (row.fileSha512) hashes.add(row.fileSha512.toLowerCase());
  }
  return {
    has: (file, project) =>
      hashes.has(file.sha512) ||
      Boolean(project?.modrinthId && modrinth.has(project.modrinthId)) ||
      Boolean(project?.curseforgeId && curseforge.has(project.curseforgeId)),
  };
}

/**
 * Whether a visible official entry matches the file: by its Modrinth or CurseForge project, or by
 * the hash an admin gave an entry added by hand.
 */
async function isInModpack(
  tx: Tx,
  file: { sha512: string },
  project: ModpackProject | null,
): Promise<boolean> {
  return (await load(tx)).has(file, project);
}

/**
 * The names of the visible official entries that are not optional and match none of the reported
 * files. Entries added by hand without a hash can't be matched, so they are skipped.
 */
async function missing(tx: Tx, reported: { sha512: string }[]): Promise<string[]> {
  const entries = await tx
    .select({
      name: mod.name,
      source: mod.source,
      sourceId: mod.sourceId,
      fileSha512: mod.fileSha512,
    })
    .from(mod)
    .where(and(eq(mod.list, 'official'), eq(mod.status, 'visible'), eq(mod.optional, false)));
  if (entries.length === 0) return [];

  const hashes = new Set(reported.map((file) => file.sha512));
  const projects =
    reported.length === 0
      ? []
      : await tx
          .select({
            modrinthId: anticheatProject.modrinthId,
            curseforgeId: anticheatProject.curseforgeId,
          })
          .from(anticheatFile)
          .innerJoin(anticheatProject, eq(anticheatProject.id, anticheatFile.projectId))
          .where(
            inArray(
              anticheatFile.sha512,
              reported.map((file) => file.sha512),
            ),
          );
  const modrinth = new Set(projects.flatMap((p) => (p.modrinthId ? [p.modrinthId] : [])));
  const curseforge = new Set(projects.flatMap((p) => (p.curseforgeId ? [p.curseforgeId] : [])));

  return entries
    .filter((entry) => {
      if (entry.fileSha512 && hashes.has(entry.fileSha512.toLowerCase())) return false;
      if (entry.source === 'manual') return Boolean(entry.fileSha512);
      if (!entry.sourceId) return false;
      return !(entry.source === 'modrinth' ? modrinth : curseforge).has(entry.sourceId);
    })
    .map((entry) => entry.name);
}

export const anticheatModpackService = { load, isInModpack, missing };
