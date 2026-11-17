import { desc, inArray } from 'drizzle-orm';

import { db } from '~~/server/db';
import { modpackMod, modpackTool } from '~~/server/db/schema';

// Kept apart from the Modlist service, which reaches Modrinth and CurseForge, so the Files library
// can ask what uses a file without loading the sources' clients.

/** The names the tools go by in "used by". */
const TOOL_NAMES: Record<string, string> = {
  launcher: 'lnb-modsync-launcher',
  updater: 'lnb-modsync-updater',
};

/** The mods and tools that point at each Files library file, by file ID, for "used by" and delete. */
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
  const tools = await db
    .select({ fileId: modpackTool.fileId, tool: modpackTool.tool })
    .from(modpackTool)
    .where(inArray(modpackTool.fileId, fileIds));
  for (const { fileId, tool } of tools) {
    used.set(fileId, [...(used.get(fileId) ?? []), TOOL_NAMES[tool] ?? tool]);
  }
  return used;
}
