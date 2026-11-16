import { eq, inArray } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { modpackMod } from '~~/server/db/schema';
import { modSettingsService } from '~~/server/services/mods/settings';
import { wardenAuditService } from '~~/server/services/warden/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { downloadAndHash, DownloadError } from './download';
import { bump, statusOf } from './index';
import { resolveLatest, SourceUnavailableError } from './latest';

import type { ModpackCheckResult, ModpackProblem, ModpackSource } from '#shared/schemas/modpack';

// The check for newer files, nightly (`modpack:check-latest`) and from the "Check for updates"
// button, and Adopt, which makes a newer file the pinned one. Only Adopt changes the manifest: a
// check never does, it only fills the `latest_*` columns. See docs/modpack.md.

type WebActor = WardenActor & { source: 'web' };
type Row = typeof modpackMod.$inferSelect;

function refuse(status: number, problem: ModpackProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

const NO_LATEST = {
  latestVersion: null,
  latestFileName: null,
  latestUrl: null,
  latestSha256: null,
  latestSha512: null,
  latestSize: null,
} satisfies Partial<typeof modpackMod.$inferInsert>;

/** What the check found for one mod, as columns to write. Undefined: the source couldn't answer. */
async function lookup(
  row: Row,
  target: Awaited<ReturnType<typeof modSettingsService.get>>,
): Promise<Partial<typeof modpackMod.$inferInsert> | undefined> {
  const source = row.source as ModpackSource;
  try {
    if ((source === 'modrinth' || source === 'curseforge') && row.sourceId) {
      const known = row.latestUrl
        ? {
            url: row.latestUrl,
            sha256: row.latestSha256,
            sha512: row.latestSha512,
            size: row.latestSize ?? 0,
          }
        : undefined;
      const found = await resolveLatest(source, row.sourceId, target, known);
      if (found.kind === 'file') {
        const { file } = found;
        return {
          latestVersion: file.version,
          latestFileName: file.fileName,
          latestUrl: file.url,
          latestSha256: file.sha256,
          latestSha512: file.sha512,
          latestSize: file.size,
        };
      }
      // A blocked file is newer, but can't be adopted: it has no link and no hash.
      if (found.kind === 'blocked') {
        return { ...NO_LATEST, latestVersion: found.version, latestFileName: found.fileName };
      }
      return NO_LATEST;
    }
    if (source === 'url' && row.pinnedUrl) {
      const hashed = await downloadAndHash(row.pinnedUrl);
      if (hashed.sha512 === row.pinnedSha512) {
        return { ...NO_LATEST, attention: row.attention === 'urlChanged' ? null : row.attention };
      }
      // The file at the link changed. The manifest keeps the pinned hash, so launchers would
      // fail to verify it: the mod goes out of the manifest until an admin accepts the new file.
      return {
        attention: 'urlChanged',
        latestVersion: row.pinnedVersion,
        latestFileName: hashed.fileName,
        latestUrl: row.pinnedUrl,
        latestSha256: hashed.sha256,
        latestSha512: hashed.sha512,
        latestSize: hashed.size,
      };
    }
  } catch (error) {
    if (error instanceof SourceUnavailableError || error instanceof DownloadError) return undefined;
    throw error;
  }
  // Uploaded files are the team's own: nothing to look up.
  return undefined;
}

/** Looks for newer files for the mods that come from a source or a link. */
async function check(input: { ids?: string[] } = {}): Promise<ModpackCheckResult> {
  const target = await modSettingsService.get();
  const rows = input.ids
    ? await db.select().from(modpackMod).where(inArray(modpackMod.id, input.ids))
    : await db.select().from(modpackMod);
  const result: ModpackCheckResult = { checked: 0, updates: 0, failed: 0 };
  for (const row of rows) {
    if (row.source === 'upload') continue;
    result.checked++;
    const found = await lookup(row, target);
    if (!found) {
      result.failed++;
      continue;
    }
    const next = { ...row, ...found };
    // A mod going out of the manifest (a link whose file changed) is a change launchers see.
    const leaves = found.attention === 'urlChanged' && row.attention !== 'urlChanged';
    const returns = row.attention === 'urlChanged' && found.attention === null;
    await db.transaction(async (tx) => {
      await tx
        .update(modpackMod)
        .set({ ...found, latestCheckedAt: new Date() })
        .where(eq(modpackMod.id, row.id));
      if (leaves || returns) await bump(tx);
    });
    if (statusOf(next) === 'update') result.updates++;
  }
  return result;
}

function adoptValues(row: Row): Partial<typeof modpackMod.$inferInsert> | undefined {
  if (!row.latestSha512 || !row.latestVersion) return undefined;
  if (row.latestSha512 === row.pinnedSha512 && row.attention !== 'urlChanged') return undefined;
  return {
    pinnedVersion: row.latestVersion,
    pinnedFileName: row.latestFileName,
    pinnedUrl: row.latestUrl,
    pinnedSha256: row.latestSha256,
    pinnedSha512: row.latestSha512,
    pinnedSize: row.latestSize,
    pinnedFileId: null,
    attention: row.attention === 'urlChanged' ? null : row.attention,
  };
}

/** Makes the newest file the pinned one, for one mod, or for every mod with an update waiting. */
async function adopt(input: { id?: string; actor: WebActor }): Promise<{ adopted: number }> {
  return db.transaction(async (tx) => {
    const rows = input.id
      ? await tx.select().from(modpackMod).where(eq(modpackMod.id, input.id))
      : await tx.select().from(modpackMod);
    if (input.id && rows.length === 0) refuse(404, 'notFound');
    // Everything at once adopts updates only: a mod needing attention is for an admin to look at.
    const chosen = rows.filter((row) => (input.id ? true : statusOf(row) === 'update'));
    let adopted = 0;
    for (const row of chosen) {
      const values = adoptValues(row);
      if (!values) {
        if (input.id) refuse(409, 'nothingToAdopt');
        continue;
      }
      await tx.update(modpackMod).set(values).where(eq(modpackMod.id, row.id));
      await wardenAuditService.record(tx, {
        action: 'modpack.adopt',
        actor: input.actor,
        data: {
          modId: row.id,
          name: row.name,
          from: row.pinnedVersion,
          to: row.latestVersion,
        },
      });
      adopted++;
    }
    if (adopted > 0) await bump(tx);
    return { adopted };
  });
}

export const modpackCheckService = { check, adopt };
