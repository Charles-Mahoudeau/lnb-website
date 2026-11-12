import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { economyAccount, economyInvitation, minecraftAccount } from '~~/server/db/schema';

import { economyAccountService } from './accounts';
import { canManage } from './rules';
import { ownerOf } from './server';
import { refuse } from './shared';
import type { Db } from './shared';

import type {
  EconomyAccountView,
  EconomyServerAccountPatchBody,
  EconomyServerCreateBody,
  EconomyServerInvitations,
  EconomyServerInviteBody,
  EconomyServerInviteResult,
  EconomyServerMembers,
} from '#shared/schemas/economy';
import {
  economyServerCreateBody,
  economyServerInviteBody,
  RESERVED_HANDLES,
} from '#shared/schemas/economy';

// Shared accounts managed from the game: opening one, its name and type, its members and
// invitations. The server names the acting player; every rule is the player routes' own
// (accounts.ts), so the game and the site can't disagree. See docs/economy.md.

/**
 * Each player's Minecraft username: the first account they linked that is still linked. Players
 * with none are missing.
 */
async function usernames(dbx: Db, userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const rows = await dbx
    .select({ userId: minecraftAccount.userId, username: minecraftAccount.username })
    .from(minecraftAccount)
    .where(and(inArray(minecraftAccount.userId, ids), isNull(minecraftAccount.unlinkedAt)))
    .orderBy(asc(minecraftAccount.linkedAt));
  const first = new Map<string, string>();
  for (const row of rows) {
    if (!first.has(row.userId)) first.set(row.userId, row.username);
  }
  return first;
}

/**
 * An open shared account by handle, for a player who is in it. In the game the account is no
 * secret (`GET /accounts/:handle`), so an outsider is told they may not, not that it doesn't exist.
 */
async function joined(handle: string, userId: string) {
  const account = await economyAccountService.byRef(db, handle);
  if (account.kind !== 'shared') refuse(404, 'notFound');
  const role = await economyAccountService.roleIn(db, account, userId);
  if (!role) refuse(403, 'notAllowed');
  return { account, role };
}

/** Opens a shared account with the player as its owner. */
async function create(input: EconomyServerCreateBody): Promise<EconomyAccountView> {
  const body = economyServerCreateBody.parse(input);
  if ((RESERVED_HANDLES as readonly string[]).includes(body.handle)) refuse(409, 'handleReserved');
  const userId = await ownerOf(db, body.player);
  const created = await economyAccountService.create(userId, {
    handle: body.handle,
    name: body.name,
    type: body.type,
  });
  return economyAccountService.view(userId, created.id);
}

/** An owner renames the account, changes its type, or both. */
async function update(
  handle: string,
  body: EconomyServerAccountPatchBody,
): Promise<EconomyAccountView> {
  const userId = await ownerOf(db, body.player);
  const { account } = await joined(handle, userId);
  await economyAccountService.update(userId, account.id, { name: body.name, type: body.type });
  return economyAccountService.view(userId, account.id);
}

/** The account's members, for anyone in it. Owners also see the invitations waiting. */
async function members(handle: string, playerUuid: string): Promise<EconomyServerMembers> {
  const userId = await ownerOf(db, playerUuid);
  const { account } = await joined(handle, userId);
  const detail = await economyAccountService.detail(userId, account.id);
  const pending = canManage(detail.role)
    ? await db
        .select({
          id: economyInvitation.id,
          userId: economyInvitation.userId,
          createdAt: economyInvitation.createdAt,
        })
        .from(economyInvitation)
        .where(eq(economyInvitation.accountId, account.id))
        .orderBy(asc(economyInvitation.createdAt))
    : [];
  const names = await usernames(db, [
    ...detail.members.map((member) => member.userId),
    ...pending.map((invitation) => invitation.userId),
  ]);
  return {
    account: await economyAccountService.view(userId, account.id),
    members: detail.members.map((member) => ({
      userId: member.userId,
      username: names.get(member.userId) ?? '',
      role: member.role,
    })),
    invitations: pending.map((invitation) => ({
      id: invitation.id,
      username: names.get(invitation.userId) ?? '',
      createdAt: invitation.createdAt.toISOString(),
    })),
  };
}

/** An owner invites a linked Minecraft username. The answer lets the server tell them in the game. */
async function invite(
  handle: string,
  input: EconomyServerInviteBody,
): Promise<EconomyServerInviteResult> {
  const body = economyServerInviteBody.parse(input);
  const userId = await ownerOf(db, body.player);
  const { account } = await joined(handle, userId);
  const created = await economyAccountService.invite(userId, account.id, {
    username: body.username,
    role: body.role,
  });
  const [inviter, linked] = await Promise.all([
    db
      .select({ username: minecraftAccount.username })
      .from(minecraftAccount)
      .where(eq(minecraftAccount.uuid, body.player)),
    db
      .select({ uuid: minecraftAccount.uuid })
      .from(minecraftAccount)
      .where(and(eq(minecraftAccount.userId, created.userId), isNull(minecraftAccount.unlinkedAt)))
      .orderBy(asc(minecraftAccount.linkedAt)),
  ]);
  return {
    id: created.id,
    username: body.username,
    account: {
      id: account.id,
      handle: account.handle ?? '',
      name: account.name ?? '',
      type: account.type ?? 'team',
    },
    role: body.role,
    invitedBy: inviter[0]?.username ?? '',
    inviteeUuids: linked.map((row) => row.uuid),
  };
}

/** An owner takes an invitation back. */
async function cancelInvitation(handle: string, invitationId: string, playerUuid: string) {
  const userId = await ownerOf(db, playerUuid);
  const { account } = await joined(handle, userId);
  await economyAccountService.cancelInvitation(userId, account.id, invitationId);
}

/** The invitations waiting for the player's LNB account, oldest first. */
async function invitations(playerUuid: string): Promise<EconomyServerInvitations> {
  const userId = await ownerOf(db, playerUuid);
  const rows = await db
    .select({
      id: economyInvitation.id,
      role: economyInvitation.role,
      createdAt: economyInvitation.createdAt,
      invitedByUserId: economyInvitation.invitedByUserId,
      accountId: economyAccount.id,
      handle: economyAccount.handle,
      name: economyAccount.name,
      type: economyAccount.type,
    })
    .from(economyInvitation)
    .innerJoin(economyAccount, eq(economyAccount.id, economyInvitation.accountId))
    .where(and(eq(economyInvitation.userId, userId), isNull(economyAccount.closedAt)))
    .orderBy(asc(economyInvitation.createdAt));
  const names = await usernames(
    db,
    rows.flatMap((row) => (row.invitedByUserId ? [row.invitedByUserId] : [])),
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      account: {
        id: row.accountId,
        handle: row.handle ?? '',
        name: row.name ?? '',
        type: row.type ?? 'team',
      },
      role: row.role,
      invitedBy: row.invitedByUserId ? (names.get(row.invitedByUserId) ?? '') : '',
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** The player joins the account they were invited to. */
async function accept(invitationId: string, playerUuid: string): Promise<EconomyAccountView> {
  const userId = await ownerOf(db, playerUuid);
  const accountId = await economyAccountService.acceptInvitation(userId, invitationId);
  return economyAccountService.view(userId, accountId);
}

async function decline(invitationId: string, playerUuid: string) {
  const userId = await ownerOf(db, playerUuid);
  await economyAccountService.declineInvitation(userId, invitationId);
}

export const economyServerAccountService = {
  create,
  update,
  members,
  invite,
  cancelInvitation,
  invitations,
  accept,
  decline,
};
