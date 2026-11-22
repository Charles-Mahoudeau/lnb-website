import { createHash } from 'node:crypto';

import { and, eq, isNull, isNotNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { modpackMod, modpackState, storedFile } from '~~/server/db/schema';
import { siteUrl } from '~~/server/lib/site';
import { flagService } from '~~/server/services/flags';
import { latestLoaderVersion } from '~~/server/services/modpack/loader-version';
import { modpackRetiredService } from '~~/server/services/modpack/retired';
import { modpackToolService } from '~~/server/services/modpack/tools';
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
    .where(eq(storedFile.kind, 'asset'))
    .orderBy(storedFile.name);

  const tools: ModpackManifest['tools'] = {};
  for (const tool of (await modpackToolService.list()).items) {
    tools[tool.tool] = {
      version: tool.version,
      fileName: tool.fileName,
      size: tool.size,
      hashes: { sha256: tool.sha256, sha512: tool.sha512 },
      url: siteUrl(tool.url),
    };
  }

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
      icon: row.iconKey
        ? siteUrl(`/api/minecraft/modpack/mods/${row.id}/icon?v=${encodeURIComponent(row.iconKey)}`)
        : null,
    });
  }

  return {
    schema: 1,
    revision: state?.revision ?? 1,
    updatedAt: (state?.updatedAt ?? new Date(0)).toISOString(),
    gameVersion: settings.gameVersion,
    loader: settings.loader,
    // `latest` follows the loader's newest version for the game version.
    loaderVersion:
      settings.loaderVersion === 'latest'
        ? await latestLoaderVersion(settings.loader, settings.gameVersion)
        : settings.loaderVersion,
    tools,
    mods,
    assets: files.map((file) => ({
      name: file.name,
      kind: 'asset',
      size: file.size,
      hashes: { sha256: file.sha256, sha512: file.sha512 },
      url: siteUrl(libraryPath(file.sha256, file.name)),
    })),
    // Kill switch: off, launchers delete nothing from it.
    retired: (await flagService.isEnabled('modpack.retired'))
      ? await modpackRetiredService.forManifest()
      : [],
  };
}

/** The manifest, serialized once, with an ETag that changes whenever its content does. */
async function render(): Promise<{ body: string; etag: string }> {
  const body = JSON.stringify(await build());
  return { body, etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"` };
}

export const modpackManifestService = { build, render };
