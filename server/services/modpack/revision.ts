import { eq, sql } from 'drizzle-orm';

import type { Tx } from '~~/server/db';
import { modpackState } from '~~/server/db/schema';

// Kept apart from the Modlist service, which reaches Modrinth and CurseForge, so the tools and the
// manifest can raise the revision without loading the sources' clients.

/** Raises the revision: what a launcher reads from the manifest has changed. */
export async function bump(tx: Tx): Promise<void> {
  await tx
    .update(modpackState)
    .set({ revision: sql`${modpackState.revision} + 1`, updatedAt: new Date() })
    .where(eq(modpackState.id, 1));
}
