import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { isFlagOn } from './flag-gate';
import { adminAudit, user } from '../db/schema';

// Ghost accounts: rows an admin made for people who haven't signed in yet (docs/ghost-accounts.md).
// No Nuxt imports here: server/lib/auth.ts loads this file, and the Better Auth CLI loads that.

/**
 * Whether a Microsoft sign-in from tenant `tid` may take over this account. Only a ghost of the
 * same school can be taken over: the admin picked that school when making it. The `ghostAccounts`
 * flag switches it off.
 */
export async function mayClaimGhost(userId: string | undefined, tid: string): Promise<boolean> {
  if (!userId || !(await isFlagOn('ghostAccounts'))) return false;
  const [row] = await db
    .select({ ghost: user.ghost, tenantId: user.tenantId })
    .from(user)
    .where(eq(user.id, userId));
  return row?.ghost === true && row.tenantId.toLowerCase() === tid.toLowerCase();
}

/**
 * Turns a ghost into a normal account once a Microsoft account is on it. Does nothing for any other
 * account, so it is safe to call for every new Microsoft account. The same row stays, so the
 * registrations, team seats and roles it had are the person's now.
 */
export async function claimGhost(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(user)
      .set({ ghost: false })
      .where(and(eq(user.id, userId), eq(user.ghost, true)))
      .returning({ email: user.email });
    if (!claimed) return;
    await tx.insert(adminAudit).values({
      action: 'user.ghostClaim',
      actorUserId: null,
      targetUserId: userId,
      data: { email: claimed.email },
    });
  });
}
