import { and, asc, count, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyInvitation,
  economyMember,
  economyProfile,
  minecraftAccount,
  user,
} from '~~/server/db/schema';

import { economyBaltopService } from './baltop';
import { economyLedger } from './ledger';
import { canManage, canSpend } from './rules';
import { economySettingsService } from './settings';
import { refuse } from './shared';
import type { Db, Tx } from './shared';
import { accountTransactions, accountViews, playerNames } from './views';

import type {
  EconomyAccountDetail,
  EconomyCreateBody,
  EconomyInviteBody,
  EconomyMe,
  EconomyMePatchBody,
  EconomyRole,
  EconomyTransactionPage,
} from '#shared/schemas/economy';
import { economyHandle } from '#shared/schemas/economy';
import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';

// Bank accounts as players see them: their own, the shared ones they're in, invitations and
// preferences. Money only moves through ledger.ts. See docs/economy.md.

type Account = typeof economyAccount.$inferSelect;

/**
 * Whether the player can have a bank account: a Minecraft account linked through Warden, from a
 * school that can play.
 */
async function isEligible(dbx: Db, userId: string): Promise<boolean> {
  const [row] = await dbx.select({ tenantId: user.tenantId }).from(user).where(eq(user.id, userId));
  if (!row) return false;
  const app = getLinkApp('warden');
  if (app && !canLinkFromSchool(app, row.tenantId)) return false;
  const [linked] = await dbx
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(and(eq(minecraftAccount.userId, userId), isNull(minecraftAccount.unlinkedAt)))
    .limit(1);
  return Boolean(linked);
}

/**
 * The player's personal account, opened on first need with the starting balance minted on it.
 * The caller checks that the player is eligible.
 */
async function ensurePersonal(tx: Tx, userId: string): Promise<Account> {
  const [existing] = await tx
    .select()
    .from(economyAccount)
    .where(eq(economyAccount.ownerUserId, userId));
  if (existing) return existing;
  const [created] = await tx
    .insert(economyAccount)
    .values({ kind: 'personal', ownerUserId: userId })
    .onConflictDoNothing()
    .returning();
  if (created) {
    const { startingBalance } = await economySettingsService.get(tx);
    if (startingBalance > 0) {
      await economyLedger.mint(tx, {
        accountId: created.id,
        amount: startingBalance,
        reason: 'startingBalance',
        actor: { source: 'system' },
      });
    }
  }
  const [account] = await tx
    .select()
    .from(economyAccount)
    .where(eq(economyAccount.ownerUserId, userId));
  if (!account) throw new Error('The personal account was not created.');
  return account;
}

/** The player's role in an account, or null. */
async function roleIn(dbx: Db, account: Account, userId: string): Promise<EconomyRole | null> {
  if (account.kind === 'personal') return account.ownerUserId === userId ? 'owner' : null;
  const [member] = await dbx
    .select({ role: economyMember.role })
    .from(economyMember)
    .where(and(eq(economyMember.accountId, account.id), eq(economyMember.userId, userId)));
  return member?.role ?? null;
}

/** An open account and the player's role in it. Anyone outside it gets a 404. */
async function membership(dbx: Db, accountId: string, userId: string, lock = false) {
  const query = dbx.select().from(economyAccount).where(eq(economyAccount.id, accountId));
  const [account] = lock ? await query.for('update') : await query;
  if (!account || account.closedAt) refuse(404, 'notFound');
  const role = await roleIn(dbx, account, userId);
  if (!role) refuse(404, 'notFound');
  return { account, role };
}

/** An open shared account the player owns. */
async function owned(dbx: Db, accountId: string, userId: string) {
  const found = await membership(dbx, accountId, userId, true);
  if (found.account.kind === 'personal') refuse(409, 'personalAccount');
  if (!canManage(found.role)) refuse(403, 'notAllowed');
  return found.account;
}

/** An open account by ID or by handle (with or without `#`). */
async function byRef(dbx: Db, ref: string): Promise<Account> {
  const isId = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(ref);
  let account: Account | undefined;
  if (isId) {
    [account] = await dbx.select().from(economyAccount).where(eq(economyAccount.id, ref));
  } else {
    const handle = economyHandle.safeParse(ref);
    if (handle.success) {
      [account] = await dbx
        .select()
        .from(economyAccount)
        .where(eq(economyAccount.handle, handle.data));
    }
  }
  if (!account || account.closedAt) refuse(404, 'notFound');
  return account;
}

/** The player's personal account first, then the shared ones they're in, by name. */
async function accountsOf(dbx: Db, userId: string) {
  const [personal, shared] = await Promise.all([
    dbx
      .select()
      .from(economyAccount)
      .where(and(eq(economyAccount.ownerUserId, userId), isNull(economyAccount.closedAt))),
    dbx
      .select({ account: economyAccount, role: economyMember.role })
      .from(economyMember)
      .innerJoin(economyAccount, eq(economyAccount.id, economyMember.accountId))
      .where(and(eq(economyMember.userId, userId), isNull(economyAccount.closedAt)))
      .orderBy(asc(economyAccount.name)),
  ]);
  return [
    ...personal.map((account) => ({ ...account, role: 'owner' as const })),
    ...shared.map((row) => ({ ...row.account, role: row.role })),
  ];
}

/**
 * The account that pays when the player names none: their chosen one, while they can still spend
 * from it, else the personal one.
 */
async function resolveDefault(dbx: Db, userId: string, personalId: string): Promise<string> {
  const [profile] = await dbx
    .select({ defaultAccountId: economyProfile.defaultAccountId })
    .from(economyProfile)
    .where(eq(economyProfile.userId, userId));
  const chosen = profile?.defaultAccountId;
  if (!chosen || chosen === personalId) return personalId;
  const [account] = await dbx.select().from(economyAccount).where(eq(economyAccount.id, chosen));
  if (!account || account.closedAt || account.frozenAt) return personalId;
  return canSpend(await roleIn(dbx, account, userId)) ? chosen : personalId;
}

async function ownedSharedCount(dbx: Db, userId: string): Promise<number> {
  const [row] = await dbx
    .select({ n: count() })
    .from(economyMember)
    .innerJoin(economyAccount, eq(economyAccount.id, economyMember.accountId))
    .where(
      and(
        eq(economyMember.userId, userId),
        eq(economyMember.role, 'owner'),
        isNull(economyAccount.closedAt),
      ),
    );
  return row?.n ?? 0;
}

/** The /minecraft/bank page: accounts, invitations and preferences. */
async function me(userId: string): Promise<EconomyMe> {
  const eligible = await isEligible(db, userId);
  if (eligible) await db.transaction((tx) => ensurePersonal(tx, userId));
  const [rows, invitations, profile, settings, ownedShared] = await Promise.all([
    accountsOf(db, userId),
    db
      .select({
        id: economyInvitation.id,
        role: economyInvitation.role,
        createdAt: economyInvitation.createdAt,
        invitedByUserId: economyInvitation.invitedByUserId,
        accountId: economyAccount.id,
        handle: economyAccount.handle,
        name: economyAccount.name,
      })
      .from(economyInvitation)
      .innerJoin(economyAccount, eq(economyAccount.id, economyInvitation.accountId))
      .where(and(eq(economyInvitation.userId, userId), isNull(economyAccount.closedAt)))
      .orderBy(asc(economyInvitation.createdAt)),
    db.select().from(economyProfile).where(eq(economyProfile.userId, userId)),
    economySettingsService.get(),
    ownedSharedCount(db, userId),
  ]);
  const names = await playerNames(
    db,
    invitations.flatMap((row) => (row.invitedByUserId ? [row.invitedByUserId] : [])),
  );
  const personal = rows.find((row) => row.kind === 'personal');
  const hideFromBaltop = profile[0]?.hideFromBaltop ?? false;
  return {
    eligible,
    accounts: await accountViews(db, rows),
    invitations: invitations.map((row) => ({
      id: row.id,
      account: { id: row.accountId, handle: row.handle ?? '', name: row.name ?? '' },
      role: row.role,
      invitedBy: row.invitedByUserId ? (names.get(row.invitedByUserId)?.name ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    })),
    defaultAccountId: personal ? await resolveDefault(db, userId, personal.id) : null,
    hideFromBaltop,
    rank: personal && !hideFromBaltop ? await economyBaltopService.rankOf(personal.id) : null,
    ownedShared,
    maxOwnedShared: settings.maxOwnedShared,
  };
}

/** One account, with its members, for anyone in it. Owners also see pending invitations. */
async function detail(userId: string, accountId: string): Promise<EconomyAccountDetail> {
  const { account, role } = await membership(db, accountId, userId);
  const [view] = await accountViews(db, [{ ...account, role }]);
  if (!view) refuse(404, 'notFound');
  const settings = await economySettingsService.get();
  if (account.kind === 'personal') {
    return { ...view, members: [], invitations: [], maxMembers: settings.maxMembers };
  }
  const [members, invitations] = await Promise.all([
    db
      .select()
      .from(economyMember)
      .where(eq(economyMember.accountId, accountId))
      .orderBy(asc(economyMember.joinedAt)),
    canManage(role)
      ? db
          .select()
          .from(economyInvitation)
          .where(eq(economyInvitation.accountId, accountId))
          .orderBy(asc(economyInvitation.createdAt))
      : Promise.resolve([]),
  ]);
  const names = await playerNames(db, [
    ...members.map((member) => member.userId),
    ...invitations.map((invitation) => invitation.userId),
  ]);
  return {
    ...view,
    members: members.map((member) => ({
      userId: member.userId,
      name: names.get(member.userId)?.name ?? null,
      username: names.get(member.userId)?.username ?? null,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      name: names.get(invitation.userId)?.name ?? null,
      username: names.get(invitation.userId)?.username ?? null,
      role: invitation.role,
      createdAt: invitation.createdAt.toISOString(),
    })),
    maxMembers: settings.maxMembers,
  };
}

/** An account's history, for anyone in it, viewers included. */
async function transactions(
  userId: string,
  accountId: string,
  cursor: string | undefined,
): Promise<EconomyTransactionPage> {
  await membership(db, accountId, userId);
  return accountTransactions(accountId, cursor);
}

/** Opens a shared account with the player as its owner. */
async function create(userId: string, body: EconomyCreateBody): Promise<EconomyAccountDetail> {
  if (!(await isEligible(db, userId))) refuse(403, 'notEligible');
  const handle = economyHandle.parse(body.handle);
  const accountId = await db.transaction(async (tx) => {
    // One at a time per player, so two requests can't both pass the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`economy-owner:${userId}`}))`);
    const { maxOwnedShared } = await economySettingsService.get(tx);
    if ((await ownedSharedCount(tx, userId)) >= maxOwnedShared) refuse(409, 'tooManyAccounts');
    const [account] = await tx
      .insert(economyAccount)
      .values({ kind: 'shared', handle, name: body.name.trim() })
      .onConflictDoNothing()
      .returning({ id: economyAccount.id });
    if (!account) refuse(409, 'handleTaken');
    await tx.insert(economyMember).values({ accountId: account.id, userId, role: 'owner' });
    return account.id;
  });
  return detail(userId, accountId);
}

async function rename(userId: string, accountId: string, name: string) {
  await db.transaction(async (tx) => {
    await owned(tx, accountId, userId);
    await tx
      .update(economyAccount)
      .set({ name: name.trim() })
      .where(eq(economyAccount.id, accountId));
  });
}

/** Closes an empty shared account. Its handle stays taken, so nobody can pose as it later. */
async function close(userId: string, accountId: string) {
  await db.transaction(async (tx) => {
    const account = await owned(tx, accountId, userId);
    if (account.balance !== 0) refuse(409, 'balanceNotZero');
    await closeAccount(tx, accountId);
  });
}

async function closeAccount(tx: Tx, accountId: string) {
  await tx
    .update(economyAccount)
    .set({ closedAt: new Date() })
    .where(eq(economyAccount.id, accountId));
  await tx.delete(economyMember).where(eq(economyMember.accountId, accountId));
  await tx.delete(economyInvitation).where(eq(economyInvitation.accountId, accountId));
}

async function seatsTaken(dbx: Db, accountId: string): Promise<number> {
  const [[members], [invitations]] = await Promise.all([
    dbx.select({ n: count() }).from(economyMember).where(eq(economyMember.accountId, accountId)),
    dbx
      .select({ n: count() })
      .from(economyInvitation)
      .where(eq(economyInvitation.accountId, accountId)),
  ]);
  return (members?.n ?? 0) + (invitations?.n ?? 0);
}

/** Invites a player by their linked Minecraft username. They join once they accept. */
async function invite(userId: string, accountId: string, body: EconomyInviteBody) {
  await db.transaction(async (tx) => {
    await owned(tx, accountId, userId);
    const [target] = await tx
      .select({ userId: minecraftAccount.userId })
      .from(minecraftAccount)
      .where(
        and(eq(minecraftAccount.username, body.username), isNull(minecraftAccount.unlinkedAt)),
      );
    if (!target) refuse(404, 'playerNotFound');
    if (!(await isEligible(tx, target.userId))) refuse(409, 'notEligible');
    const [member] = await tx
      .select({ userId: economyMember.userId })
      .from(economyMember)
      .where(and(eq(economyMember.accountId, accountId), eq(economyMember.userId, target.userId)));
    if (member) refuse(409, 'alreadyMember');
    const { maxMembers } = await economySettingsService.get(tx);
    if ((await seatsTaken(tx, accountId)) >= maxMembers) refuse(409, 'tooManyMembers');
    const [created] = await tx
      .insert(economyInvitation)
      .values({ accountId, userId: target.userId, role: body.role, invitedByUserId: userId })
      .onConflictDoNothing()
      .returning({ id: economyInvitation.id });
    if (!created) refuse(409, 'alreadyInvited');
  });
}

async function cancelInvitation(userId: string, accountId: string, invitationId: string) {
  await db.transaction(async (tx) => {
    await owned(tx, accountId, userId);
    const deleted = await tx
      .delete(economyInvitation)
      .where(
        and(eq(economyInvitation.id, invitationId), eq(economyInvitation.accountId, accountId)),
      )
      .returning({ id: economyInvitation.id });
    if (!deleted.length) refuse(404, 'notFound');
  });
}

async function answerInvitation(userId: string, invitationId: string, accept: boolean) {
  await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(economyInvitation)
      .where(and(eq(economyInvitation.id, invitationId), eq(economyInvitation.userId, userId)))
      .for('update');
    if (!invitation) refuse(404, 'notFound');
    await tx.delete(economyInvitation).where(eq(economyInvitation.id, invitationId));
    if (!accept) return;
    const [account] = await tx
      .select()
      .from(economyAccount)
      .where(eq(economyAccount.id, invitation.accountId))
      .for('update');
    if (!account || account.closedAt) refuse(404, 'notFound');
    if (!(await isEligible(tx, userId))) refuse(403, 'notEligible');
    const { maxMembers } = await economySettingsService.get(tx);
    // The invitation was holding a seat; it was just deleted.
    if ((await seatsTaken(tx, account.id)) >= maxMembers) refuse(409, 'tooManyMembers');
    await tx
      .insert(economyMember)
      .values({ accountId: account.id, userId, role: invitation.role })
      .onConflictDoNothing();
  });
}

async function ownerCount(tx: Tx, accountId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(economyMember)
    .where(and(eq(economyMember.accountId, accountId), eq(economyMember.role, 'owner')));
  return row?.n ?? 0;
}

async function setMemberRole(
  actorId: string,
  accountId: string,
  targetUserId: string,
  role: EconomyRole,
) {
  await db.transaction(async (tx) => {
    await owned(tx, accountId, actorId);
    const [member] = await tx
      .select()
      .from(economyMember)
      .where(and(eq(economyMember.accountId, accountId), eq(economyMember.userId, targetUserId)));
    if (!member) refuse(404, 'notFound');
    if (member.role === 'owner' && role !== 'owner' && (await ownerCount(tx, accountId)) <= 1) {
      refuse(409, 'lastOwner');
    }
    await tx
      .update(economyMember)
      .set({ role })
      .where(and(eq(economyMember.accountId, accountId), eq(economyMember.userId, targetUserId)));
  });
}

/** An owner removes a member, or a member leaves. The last owner can't go. */
async function removeMember(actorId: string, accountId: string, targetUserId: string) {
  await db.transaction(async (tx) => {
    const { account, role } = await membership(tx, accountId, actorId, true);
    if (account.kind === 'personal') refuse(409, 'personalAccount');
    if (actorId !== targetUserId && !canManage(role)) refuse(403, 'notAllowed');
    const [member] = await tx
      .select()
      .from(economyMember)
      .where(and(eq(economyMember.accountId, accountId), eq(economyMember.userId, targetUserId)));
    if (!member) refuse(404, 'notFound');
    if (member.role === 'owner' && (await ownerCount(tx, accountId)) <= 1) refuse(409, 'lastOwner');
    await tx
      .delete(economyMember)
      .where(and(eq(economyMember.accountId, accountId), eq(economyMember.userId, targetUserId)));
  });
}

/** The default account and the baltop opt-out. */
async function updateMe(userId: string, body: EconomyMePatchBody) {
  await db.transaction(async (tx) => {
    if (body.defaultAccountId) {
      const { account, role } = await membership(tx, body.defaultAccountId, userId);
      if (!canSpend(role) || account.frozenAt) refuse(409, 'notAllowed');
    }
    const values = {
      ...(body.defaultAccountId !== undefined && { defaultAccountId: body.defaultAccountId }),
      ...(body.hideFromBaltop !== undefined && { hideFromBaltop: body.hideFromBaltop }),
    };
    if (!Object.keys(values).length) return;
    await tx
      .insert(economyProfile)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: economyProfile.userId, set: values });
  });
}

/**
 * Tidies up after deleted LNB accounts, in the caller's transaction: their personal accounts are
 * emptied (the money is destroyed) and closed, and a shared account left without an owner passes
 * to its oldest member, or is emptied and closed when nobody is left. Called right after a
 * deletion, and every night in case an account went another way.
 */
async function sweepOrphans(tx: Tx): Promise<{ closed: number; promoted: number }> {
  let closed = 0;
  let promoted = 0;
  const orphans = await tx
    .select({ id: economyAccount.id, balance: economyAccount.balance })
    .from(economyAccount)
    .where(
      and(
        eq(economyAccount.kind, 'personal'),
        isNull(economyAccount.ownerUserId),
        isNull(economyAccount.closedAt),
      ),
    )
    .for('update');
  const ownerless = await tx
    .select({ id: economyAccount.id, balance: economyAccount.balance })
    .from(economyAccount)
    .where(
      and(
        eq(economyAccount.kind, 'shared'),
        isNull(economyAccount.closedAt),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(economyMember)
            .where(
              and(eq(economyMember.accountId, economyAccount.id), eq(economyMember.role, 'owner')),
            ),
        ),
      ),
    )
    .for('update');

  const toClose = [...orphans];
  for (const account of ownerless) {
    const [oldest] = await tx
      .select({ userId: economyMember.userId })
      .from(economyMember)
      .where(eq(economyMember.accountId, account.id))
      .orderBy(asc(economyMember.joinedAt))
      .limit(1);
    if (oldest) {
      await tx
        .update(economyMember)
        .set({ role: 'owner' })
        .where(
          and(eq(economyMember.accountId, account.id), eq(economyMember.userId, oldest.userId)),
        );
      promoted++;
    } else {
      toClose.push(account);
    }
  }
  for (const account of toClose) {
    if (account.balance > 0) {
      await economyLedger.burn(tx, {
        accountId: account.id,
        amount: account.balance,
        reason: 'accountClosed',
        actor: { source: 'system' },
      });
    }
    await closeAccount(tx, account.id);
    closed++;
  }
  return { closed, promoted };
}

/** The open accounts with these IDs, for the server and the admins. */
async function openAccounts(dbx: Db, ids: readonly string[]) {
  if (!ids.length) return [];
  return dbx
    .select()
    .from(economyAccount)
    .where(and(inArray(economyAccount.id, [...ids]), isNull(economyAccount.closedAt)));
}

export const economyAccountService = {
  isEligible,
  ensurePersonal,
  roleIn,
  membership,
  byRef,
  accountsOf,
  resolveDefault,
  openAccounts,
  closeAccount,
  me,
  detail,
  transactions,
  create,
  rename,
  close,
  invite,
  cancelInvitation,
  acceptInvitation: (userId: string, invitationId: string) =>
    answerInvitation(userId, invitationId, true),
  declineInvitation: (userId: string, invitationId: string) =>
    answerInvitation(userId, invitationId, false),
  setMemberRole,
  removeMember,
  updateMe,
  sweepOrphans,
};
