import { and, asc, count, eq, isNull } from 'drizzle-orm';

import { economyCasinoLicense } from '~~/server/db/schema';

import { refuse } from './shared';
import type { Db, Tx } from './shared';

import type { EconomyLicenseCount } from '#shared/schemas/economy';

// Casino licences: bought from the game (server.ts), and used here when a shared account becomes
// a casino. A licence belongs to the LNB account and is bound to one casino for good. See
// docs/economy.md.

/** How many licences the player bought, and how many are still free. */
export async function licenseCount(dbx: Db, userId: string): Promise<EconomyLicenseCount> {
  const [[total], [free]] = await Promise.all([
    dbx
      .select({ n: count() })
      .from(economyCasinoLicense)
      .where(eq(economyCasinoLicense.userId, userId)),
    dbx
      .select({ n: count() })
      .from(economyCasinoLicense)
      .where(and(eq(economyCasinoLicense.userId, userId), isNull(economyCasinoLicense.accountId))),
  ]);
  return { total: total?.n ?? 0, free: free?.n ?? 0 };
}

/**
 * Uses one of the player's free licences for an account that becomes a casino. An account that
 * already holds a licence (an admin took its type away) needs no other one.
 */
export async function bindLicense(tx: Tx, accountId: string, userId: string): Promise<void> {
  const [held] = await tx
    .select({ id: economyCasinoLicense.id })
    .from(economyCasinoLicense)
    .where(eq(economyCasinoLicense.accountId, accountId));
  if (held) return;
  // Locked, so two accounts made casinos at once can't share a licence.
  const [free] = await tx
    .select({ id: economyCasinoLicense.id })
    .from(economyCasinoLicense)
    .where(and(eq(economyCasinoLicense.userId, userId), isNull(economyCasinoLicense.accountId)))
    .orderBy(asc(economyCasinoLicense.createdAt))
    .limit(1)
    .for('update');
  if (!free) refuse(403, 'noLicense');
  await tx
    .update(economyCasinoLicense)
    .set({ accountId, boundAt: new Date() })
    .where(eq(economyCasinoLicense.id, free.id));
}
