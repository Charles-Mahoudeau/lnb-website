import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { modListSettings } from '~~/server/db/schema';

import type { ModSettingsView } from '#shared/schemas/mods';

const DEFAULTS: ModSettingsView = {
  open: true,
  maxSuggestions: 5,
  gameVersion: '1.21.1',
  loader: 'neoforge',
};

/** The global settings. The migration creates their single row. */
async function get(dbx: Db = db): Promise<ModSettingsView> {
  const [row] = await dbx
    .select({
      open: modListSettings.open,
      maxSuggestions: modListSettings.maxSuggestions,
      gameVersion: modListSettings.gameVersion,
      loader: modListSettings.loader,
    })
    .from(modListSettings)
    .where(eq(modListSettings.id, 1));
  return row ?? DEFAULTS;
}

export const modSettingsService = { get };
