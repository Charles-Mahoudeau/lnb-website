import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { wardenSettings } from '~~/server/db/schema';

import type { Db } from './shared';

export interface WardenSettings {
  defaultMaxAccounts: number;
}

/** The global settings. The migration creates their single row. */
async function get(dbx: Db = db): Promise<WardenSettings> {
  const [row] = await dbx
    .select({ defaultMaxAccounts: wardenSettings.defaultMaxAccounts })
    .from(wardenSettings)
    .where(eq(wardenSettings.id, 1));
  return row ?? { defaultMaxAccounts: 1 };
}

export const wardenSettingsService = { get };
