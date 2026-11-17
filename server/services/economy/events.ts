import { eq, inArray } from 'drizzle-orm';

import { db } from '~~/server/db';
import { economyAccount, economyInvitation, economyMember } from '~~/server/db/schema';
import { minecraftEventService } from '~~/server/services/minecraft-events';

import { playerNames } from './views';

// What lnb-economy hears from the site (`GET /api/economy/server/events`), after a change the
// game didn't make itself or needs to tell another player about. See docs/economy.md.
//
// - `accounts` { uuids }: read these players' accounts and invitations again.
// - `invitation` { uuids, id, account: { id, handle, name, type }, role, invitedBy }: tell them.

/** The members of these accounts, owners of personal ones included, for an `accounts` event. */
async function membersOf(accountIds: readonly string[]): Promise<string[]> {
  if (!accountIds.length) return [];
  const ids = [...accountIds];
  const [members, owners] = await Promise.all([
    db
      .select({ userId: economyMember.userId })
      .from(economyMember)
      .where(inArray(economyMember.accountId, ids)),
    db
      .select({ userId: economyAccount.ownerUserId })
      .from(economyAccount)
      .where(inArray(economyAccount.id, ids)),
  ]);
  return [...members.map((row) => row.userId), ...owners.flatMap((row) => row.userId ?? [])];
}

/** These players' accounts changed, and those of every member of these accounts. */
async function accountsChanged(input: {
  userIds?: readonly string[];
  accountIds?: readonly string[];
}) {
  try {
    const userIds = [...(input.userIds ?? []), ...(await membersOf(input.accountIds ?? []))];
    await minecraftEventService.emitToPlayers('economy', 'accounts', userIds);
  } catch (error) {
    console.error("Couldn't record an economy accounts event", error);
  }
}

/** A player was invited: the game shows it to them at once, and lists it. */
async function invited(invitationId: string) {
  try {
    const [row] = await db
      .select({
        userId: economyInvitation.userId,
        role: economyInvitation.role,
        invitedByUserId: economyInvitation.invitedByUserId,
        accountId: economyAccount.id,
        handle: economyAccount.handle,
        name: economyAccount.name,
        type: economyAccount.type,
      })
      .from(economyInvitation)
      .innerJoin(economyAccount, eq(economyAccount.id, economyInvitation.accountId))
      .where(eq(economyInvitation.id, invitationId));
    if (!row) return;
    const inviter = row.invitedByUserId
      ? (await playerNames(db, [row.invitedByUserId])).get(row.invitedByUserId)
      : undefined;
    await minecraftEventService.emitToPlayers('economy', 'invitation', [row.userId], {
      id: invitationId,
      account: {
        id: row.accountId,
        handle: row.handle ?? '',
        name: row.name ?? '',
        type: row.type,
      },
      role: row.role,
      invitedBy: inviter?.username ?? inviter?.name ?? '',
    });
  } catch (error) {
    console.error("Couldn't record an economy invitation event", error);
  }
}

export const economyEvents = { accountsChanged, membersOf, invited };
