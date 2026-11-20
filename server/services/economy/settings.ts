import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { economySettings } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';

import type { Db } from './shared';

import type { EconomySettingsBody, EconomySettingsView } from '#shared/schemas/economy';
import { CENTS_PER_LNBIT } from '#shared/utils/lnbits';

// Money is in cents of LNBit.
const DEFAULTS = {
  startingBalance: 0,
  maxOwnedShared: 3,
  maxMembers: 20,
  auctionTaxPercent: 5,
  auctionMaxListings: 20,
  auctionDays: 7,
  casinoLicensePrice: 1_050 * CENTS_PER_LNBIT,
};

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
    auctionTaxPercent: row.auctionTaxPercent,
    auctionMaxListings: row.auctionMaxListings,
    auctionDays: row.auctionDays,
    casinoLicensePrice: row.casinoLicensePrice,
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
    await auditService.record(tx, {
      action: 'economy.settings',
      actor: { source: 'web', userId: actorId },
      targetUserId: null,
      data: { ...body },
    });
  });
  return view();
}

export const economySettingsService = { get, view, update };
