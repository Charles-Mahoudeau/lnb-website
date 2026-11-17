import { createHash } from 'node:crypto';

import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { modpackMod, modpackState, storedFile } from '~~/server/db/schema';
import { siteUrl } from '~~/server/lib/site';
import { latestLoaderVersion } from '~~/server/services/modpack/loader-version';
import { modSettingsService } from '~~/server/services/mods/settings';

import type { ModpackManifest, ModpackSide, ModpackSource } from '#shared/schemas/modpack';

// The manifest the launcher reads, built from the Modlist and the Files library. See docs/modpack.md.

const libraryPath = (sha256: string, name: string) =>
  `/api/files/${sha256}/${encodeURIComponent(name)}`;

async function build(): Promise<ModpackManifest> {
  const [state] = await db.select().from(modpackState).where(eq(modpackState.id, 1));
  const settings = await modSettingsService.get();
  // A mod needing attention has no file the launcher could verify, so it stays out.
  const rows = await db
    .select()
    .from(modpackMod)
    .where(and(isNull(modpackMod.attention), isNotNull(modpackMod.pinnedSha512)))
    .orderBy(modpackMod.name);
  const files = await db
    .select()
    .from(storedFile)
    .where(inArray(storedFile.kind, ['wrapper', 'asset']))
    .orderBy(storedFile.name);

  const mods: ModpackManifest['mods'] = [];
  for (const row of rows) {
    const url =
      row.pinnedFileId && row.pinnedSha256 && row.pinnedFileName
        ? siteUrl(libraryPath(row.pinnedSha256, row.pinnedFileName))
        : row.pinnedUrl;
    if (!url || !row.pinnedVersion || !row.pinnedSha512) continue;
    mods.push({
      id: row.id,
      name: row.name,
      side: row.side as ModpackSide,
      optional: row.optional,
      version: row.pinnedVersion,
      fileName: row.pinnedFileName ?? '',
      size: row.pinnedSize ?? 0,
      hashes: {
        ...(row.pinnedSha256 ? { sha256: row.pinnedSha256 } : {}),
        sha512: row.pinnedSha512,
      },
      downloads: [url],
      source: row.source as ModpackSource,
      projectUrl: row.pageUrl,
    });
  }

  return {
    schema: 1,
    revision: state?.revision ?? 1,
    updatedAt: (state?.updatedAt ?? new Date(0)).toISOString(),
    gameVersion: settings.gameVersion,
    loader: settings.loader,
    // The admin's value wins. Otherwise the loader's newest version for the game version.
    loaderVersion:
      settings.loaderVersion || (await latestLoaderVersion(settings.loader, settings.gameVersion)),
    mods,
    assets: files.map((file) => ({
      name: file.name,
      kind: file.kind as 'wrapper' | 'asset',
      size: file.size,
      hashes: { sha256: file.sha256, sha512: file.sha512 },
      url: siteUrl(libraryPath(file.sha256, file.name)),
    })),
  };
}

/** The manifest, serialized once, with an ETag that changes whenever its content does. */
async function render(): Promise<{ body: string; etag: string }> {
  const body = JSON.stringify(await build());
  return { body, etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"` };
}

export const modpackManifestService = { build, render };
