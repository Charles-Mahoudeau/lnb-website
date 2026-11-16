import { desc, inArray } from 'drizzle-orm';

import { db } from '~~/server/db';
import { modpackMod } from '~~/server/db/schema';

// Kept apart from the Modlist service, which reaches Modrinth and CurseForge, so the Files library
// can ask what uses a file without loading the sources' clients.

/** The mods that point at each Files library file, by file ID, for "used by" and delete. */
export async function usageOfFiles(fileIds: string[]): Promise<Map<string, string[]>> {
  const used = new Map<string, string[]>();
  if (fileIds.length === 0) return used;
  const rows = await db
    .select({ fileId: modpackMod.pinnedFileId, name: modpackMod.name })
    .from(modpackMod)
    .where(inArray(modpackMod.pinnedFileId, fileIds))
    .orderBy(desc(modpackMod.name));
  for (const { fileId, name } of rows) {
    if (fileId) used.set(fileId, [...(used.get(fileId) ?? []), name]);
  }
  return used;
}
