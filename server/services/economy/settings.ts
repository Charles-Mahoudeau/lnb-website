import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { economySettings } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import type { Db } from './shared';

import type { EconomySettingsBody, EconomySettingsView } from '#shared/schemas/economy';

const DEFAULTS = { startingBalance: 0, maxOwnedShared: 3, maxMembers: 20 };

/** The global settings. The migration creates their single row. */
async function get(dbx: Db = db) {
  const [row] = await dbx.select().from(economySettings).where(eq(economySettings.id, 1));
  return row ?? { ...DEFAULTS, updatedAt: new Date(0), updatedByUserId: null };
}

async function view(): Promise<EconomySettingsView> {
  const row = await get();
  return {
    startingBalance: row.startingBalance,
    maxOwnedShared: row.maxOwnedShared,
    maxMembers: row.maxMembers,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function update(actorId: string, body: EconomySettingsBody): Promise<EconomySettingsView> {
  await db.transaction(async (tx) => {
    const values = { ...body, updatedAt: new Date(), updatedByUserId: actorId };
    await tx
      .insert(economySettings)
      .values({ id: 1, ...DEFAULTS, ...values })
      .onConflictDoUpdate({ target: economySettings.id, set: values });
    await adminAuditService.record(tx, {
      action: 'economy.settings',
      actorUserId: actorId,
      targetUserId: null,
      data: { ...body },
    });
  });
  return view();
}

export const economySettingsService = { get, view, update };
