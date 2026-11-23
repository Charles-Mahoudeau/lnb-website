import { db } from '~~/server/db';
import { wardenBan, wardenNote } from '~~/server/db/schema';
import { anticheatAdminService } from '~~/server/services/anticheat/admin';
import { auditService } from '~~/server/services/audit';
import { feedEvents } from '~~/server/services/feed/events';

import { refuse } from './shared';
import type { WardenActor } from './shared';

import { WARDEN_RESET_SANCTIONS_CONFIRM } from '#shared/schemas/warden';

/**
 * Forgets every sanction: all bans (the ones in force too, so banned players can play again), their
 * appeals (they go with their ban), all notes and warnings, and the anticheat's scores, holds,
 * timelines, actions and alerts. The audit log, the files and their decisions stay. It lives in its
 * own file because it needs both Warden and the anticheat. Site admins only, after typing the
 * confirmation.
 */
async function resetSanctions(actor: WardenActor, confirm: string) {
  if (confirm.trim().toLowerCase() !== WARDEN_RESET_SANCTIONS_CONFIRM)
    refuse(400, 'confirmMismatch');
  const now = new Date();
  const bans = await db.transaction(async (tx) => {
    // Appeals go with their ban (on delete cascade).
    const bans = await tx.delete(wardenBan).returning({
      id: wardenBan.id,
      userId: wardenBan.userId,
      revokedAt: wardenBan.revokedAt,
      expiresAt: wardenBan.expiresAt,
    });
    const notes = await tx.delete(wardenNote).returning({ id: wardenNote.id });
    const anticheat = await anticheatAdminService.wipeSanctions(tx);
    await auditService.record(tx, {
      action: 'minecraft.resetSanctions',
      actor,
      data: { bans: bans.length, notes: notes.length, anticheat },
    });
    return bans;
  });
  // The bans in force are lifted: Feed's rights come back for those players.
  const lifted = bans.filter((ban) => !ban.revokedAt && (!ban.expiresAt || ban.expiresAt > now));
  await feedEvents.rightsOfUsers(lifted.map((ban) => ban.userId));
}

export const wardenResetService = { resetSanctions };
