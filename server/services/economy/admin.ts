import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, sum } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyDailyStat,
  economyEntry,
  economyInvitation,
  economyMember,
  economyProfile,
  economyTransaction,
  user,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { economyLedger } from './ledger';
import { bannedUsers, decodeCursor, PAGE_SIZE, refuse } from './shared';
import type { Tx } from './shared';
import { accountTransactions, memberCounts, playerNames } from './views';

import type {
  EconomyAdjustBody,
  EconomyAdminAccountDetail,
  EconomyAdminAccountPage,
  EconomyAdminAccountRow,
  EconomyAdminAccountsQuery,
  EconomyExport,
  EconomyFreezeBody,
  EconomyLedgerPage,
  EconomyLedgerQuery,
  EconomyLedgerSide,
  EconomyTransactionPage,
} from '#shared/schemas/economy';
import { ECONOMY_RESET_CONFIRM } from '#shared/schemas/economy';

// The Economy section of the admin area: every account, the ledger, adjustments, freezes,
// reversals and the reset. Each change is written to admin_audit. See docs/economy.md.

type Account = typeof economyAccount.$inferSelect;

/** How an account is named in the audit log: its handle, or its owner's name. */
async function auditName(tx: Tx, account: Account): Promise<string> {
  if (account.handle) return `#${account.handle}`;
  if (!account.ownerUserId) return '';
  const [owner] = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, account.ownerUserId));
  return owner?.name ?? '';
}

function escapeLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

async function rows(accounts: readonly Account[]): Promise<EconomyAdminAccountRow[]> {
  const owners = accounts.flatMap((account) => (account.ownerUserId ? [account.ownerUserId] : []));
  const [names, counts, banned] = await Promise.all([
    playerNames(db, owners),
    memberCounts(
      db,
      accounts.map((account) => account.id),
    ),
    bannedUsers(db, owners),
  ]);
  return accounts.map((account) => {
    const owner = account.ownerUserId ? names.get(account.ownerUserId) : undefined;
    return {
      id: account.id,
      kind: account.kind,
      handle: account.handle,
      name: account.name,
      owner:
        owner && account.ownerUserId
          ? { userId: account.ownerUserId, name: owner.fullName, username: owner.username }
          : null,
      balance: account.balance,
      memberCount: account.kind === 'shared' ? (counts.get(account.id) ?? 0) : 1,
      frozen:
        Boolean(account.frozenAt) ||
        (account.ownerUserId !== null && banned.has(account.ownerUserId)),
      closed: Boolean(account.closedAt),
      createdAt: account.createdAt.toISOString(),
    };
  });
}

/** Accounts by balance, richest first, 50 per page. The cursor is `balance:id`. */
async function list(query: EconomyAdminAccountsQuery): Promise<EconomyAdminAccountPage> {
  let after: { balance: number; id: string } | undefined;
  if (query.cursor) {
    const [balance, id] = query.cursor.split(':');
    if (!balance || !id || !Number.isSafeInteger(Number(balance))) refuse(400, 'invalidCursor');
    after = { balance: Number(balance), id };
  }
  const search = query.q ? escapeLike(query.q.replace(/^#/, '')) : undefined;
  const found = await db
    .select({ account: economyAccount })
    .from(economyAccount)
    .leftJoin(user, eq(user.id, economyAccount.ownerUserId))
    .where(
      and(
        query.kind ? eq(economyAccount.kind, query.kind) : undefined,
        search
          ? or(
              ilike(economyAccount.handle, search),
              ilike(economyAccount.name, search),
              ilike(user.name, search),
            )
          : undefined,
        after
          ? sql`(${economyAccount.balance}, ${economyAccount.id}) < (${after.balance}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(desc(economyAccount.balance), desc(economyAccount.id))
    .limit(PAGE_SIZE + 1);
  const items = await rows(found.slice(0, PAGE_SIZE).map((row) => row.account));
  const last = items.at(-1);
  return {
    items,
    nextCursor: found.length > PAGE_SIZE && last ? `${String(last.balance)}:${last.id}` : null,
  };
}

async function requireAccount(accountId: string, tx: Tx | typeof db = db, lock = false) {
  const query = tx.select().from(economyAccount).where(eq(economyAccount.id, accountId));
  const [account] = lock ? await query.for('update') : await query;
  if (!account) refuse(404, 'notFound');
  return account;
}

async function detail(accountId: string): Promise<EconomyAdminAccountDetail> {
  const account = await requireAccount(accountId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [[row], members, flows, banned] = await Promise.all([
    rows([account]),
    db
      .select()
      .from(economyMember)
      .where(eq(economyMember.accountId, accountId))
      .orderBy(asc(economyMember.joinedAt)),
    db
      .select({
        in: sql<string>`coalesce(sum(${economyEntry.amount}) filter (where ${economyEntry.amount} > 0), 0)`,
        out: sql<string>`coalesce(-sum(${economyEntry.amount}) filter (where ${economyEntry.amount} < 0), 0)`,
      })
      .from(economyEntry)
      .innerJoin(economyTransaction, eq(economyTransaction.id, economyEntry.transactionId))
      .where(and(eq(economyEntry.accountId, accountId), gte(economyTransaction.at, since))),
    bannedUsers(db, account.ownerUserId ? [account.ownerUserId] : []),
  ]);
  if (!row) refuse(404, 'notFound');
  const names = await playerNames(
    db,
    members.map((member) => member.userId),
  );
  return {
    ...row,
    frozenAt: account.frozenAt?.toISOString() ?? null,
    frozenReason: account.frozenReason,
    ownerBanned: account.ownerUserId !== null && banned.has(account.ownerUserId),
    members: members.map((member) => ({
      userId: member.userId,
      name: names.get(member.userId)?.fullName ?? null,
      uuid: names.get(member.userId)?.uuid ?? null,
      username: names.get(member.userId)?.username ?? null,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
    in30: Number(flows[0]?.in ?? 0),
    out30: Number(flows[0]?.out ?? 0),
  };
}

async function transactions(accountId: string, cursor?: string): Promise<EconomyTransactionPage> {
  await requireAccount(accountId);
  return accountTransactions(accountId, cursor);
}

/** Creates or destroys money on an account, with a reason its members see. */
async function adjust(actorId: string, accountId: string, body: EconomyAdjustBody) {
  await db.transaction(async (tx) => {
    const account = await requireAccount(accountId, tx);
    if (account.closedAt) refuse(409, 'closed');
    const move = body.direction === 'mint' ? economyLedger.mint : economyLedger.burn;
    const posted = await move(tx, {
      accountId,
      amount: body.amount,
      reason: 'adjustment',
      memo: body.reason,
      actor: { source: 'web', userId: actorId },
    });
    await adminAuditService.record(tx, {
      action: 'economy.adjust',
      actorUserId: actorId,
      targetUserId: account.ownerUserId,
      data: {
        name: await auditName(tx, account),
        accountId,
        direction: body.direction,
        amount: body.amount,
        reason: body.reason,
        transactionId: posted.transactionId,
      },
    });
  });
  return detail(accountId);
}

/** Freezes an account (nothing goes in or out, except admin moves) or lifts the freeze. */
async function freeze(actorId: string, accountId: string, body: EconomyFreezeBody) {
  await db.transaction(async (tx) => {
    const account = await requireAccount(accountId, tx, true);
    if (account.closedAt) refuse(409, 'closed');
    if (body.frozen === Boolean(account.frozenAt)) return;
    await tx
      .update(economyAccount)
      .set(
        body.frozen
          ? { frozenAt: new Date(), frozenReason: body.reason ?? null, frozenByUserId: actorId }
          : { frozenAt: null, frozenReason: null, frozenByUserId: null },
      )
      .where(eq(economyAccount.id, accountId));
    if (body.frozen) {
      // Nobody keeps paying with a frozen account by default.
      await tx
        .update(economyProfile)
        .set({ defaultAccountId: null })
        .where(eq(economyProfile.defaultAccountId, accountId));
    }
    await adminAuditService.record(tx, {
      action: body.frozen ? 'economy.freeze' : 'economy.unfreeze',
      actorUserId: actorId,
      targetUserId: account.ownerUserId,
      data: { name: await auditName(tx, account), accountId, reason: body.reason ?? null },
    });
  });
  return detail(accountId);
}

/** Undoes a transaction with a reversal. Refused when an account no longer holds the money. */
async function reverse(actorId: string, transactionId: number, reason: string) {
  return db.transaction(async (tx) => {
    const posted = await economyLedger.reverse(tx, {
      transactionId,
      memo: reason,
      actor: { source: 'web', userId: actorId },
    });
    const [first] = [...posted.balances.keys()];
    const account = first ? await requireAccount(first, tx) : undefined;
    await adminAuditService.record(tx, {
      action: 'economy.reverse',
      actorUserId: actorId,
      targetUserId: account?.ownerUserId ?? null,
      data: {
        name: account ? await auditName(tx, account) : '',
        transactionId,
        reversalId: posted.transactionId,
        reason,
      },
    });
    return { reversalId: posted.transactionId };
  });
}

/** The whole ledger, newest first, 50 per page. */
async function ledger(query: EconomyLedgerQuery): Promise<EconomyLedgerPage> {
  const before = decodeCursor(query.cursor);
  const search = query.q ? escapeLike(query.q) : undefined;
  const reversal = economyTransaction;
  const found = await db
    .select()
    .from(economyTransaction)
    .where(
      and(
        before ? lt(economyTransaction.id, before) : undefined,
        query.kind ? eq(economyTransaction.kind, query.kind) : undefined,
        search ? ilike(economyTransaction.memo, search) : undefined,
        query.accountId
          ? inArray(
              economyTransaction.id,
              db
                .select({ id: economyEntry.transactionId })
                .from(economyEntry)
                .where(eq(economyEntry.accountId, query.accountId)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(economyTransaction.id))
    .limit(PAGE_SIZE + 1);
  const page = found.slice(0, PAGE_SIZE);
  const ids = page.map((row) => row.id);
  const [entries, reversals] = ids.length
    ? await Promise.all([
        db
          .select({
            transactionId: economyEntry.transactionId,
            accountId: economyEntry.accountId,
            amount: economyEntry.amount,
            handle: economyAccount.handle,
            ownerUserId: economyAccount.ownerUserId,
            ownerName: user.name,
          })
          .from(economyEntry)
          .leftJoin(economyAccount, eq(economyAccount.id, economyEntry.accountId))
          .leftJoin(user, eq(user.id, economyAccount.ownerUserId))
          .where(inArray(economyEntry.transactionId, ids)),
        db
          .select({ id: reversal.id, reversesId: reversal.reversesId })
          .from(reversal)
          .where(inArray(reversal.reversesId, ids)),
      ])
    : [[], []];
  const actors = await playerNames(
    db,
    page.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
  );
  const reversedBy = new Map(reversals.map((row) => [row.reversesId, row.id]));

  const side = (entry: (typeof entries)[number]): EconomyLedgerSide =>
    entry.accountId
      ? {
          type: 'account',
          accountId: entry.accountId,
          handle: entry.handle,
          owner: entry.handle ? null : (entry.ownerName ?? null),
        }
      : { type: 'lnb' };

  const items = page.map((row) => {
    const lines = entries.filter((entry) => entry.transactionId === row.id);
    return {
      id: row.id,
      at: row.at.toISOString(),
      kind: row.kind,
      reason: row.reason,
      memo: row.memo,
      amount: lines.reduce((total, line) => total + Math.max(line.amount, 0), 0),
      from: lines.filter((line) => line.amount < 0).map(side),
      to: lines.filter((line) => line.amount > 0).map(side),
      actor: row.actorUserId ? (actors.get(row.actorUserId)?.fullName ?? null) : null,
      reversedBy: reversedBy.get(row.id) ?? null,
      reverses: row.reversesId,
    };
  });
  const last = items.at(-1);
  return { items, nextCursor: found.length > PAGE_SIZE && last ? String(last.id) : null };
}

/** Every open account with its balance and members, to keep before a reset. */
async function exportAll(): Promise<EconomyExport> {
  const [accounts, members] = await Promise.all([
    db.select().from(economyAccount).where(isNull(economyAccount.closedAt)),
    db.select().from(economyMember),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    supply: accounts.reduce((total, account) => total + account.balance, 0),
    accounts: accounts.map((account) => ({
      id: account.id,
      kind: account.kind,
      handle: account.handle,
      name: account.name,
      ownerUserId: account.ownerUserId,
      balance: account.balance,
      members: members
        .filter((member) => member.accountId === account.id)
        .map((member) => ({ userId: member.userId, role: member.role })),
    })),
  };
}

/**
 * Deletes every account, the ledger and the daily stats. The settings stay. Personal accounts
 * open again on the next need, with the starting balance. Site admins only, after typing the
 * confirmation.
 */
async function reset(actorId: string, confirm: string) {
  if (confirm.trim().toLowerCase() !== ECONOMY_RESET_CONFIRM) refuse(400, 'confirmMismatch');
  await db.transaction(async (tx) => {
    const [totals] = await tx.select({ supply: sum(economyAccount.balance) }).from(economyAccount);
    const accounts = await tx.select({ id: economyAccount.id }).from(economyAccount);
    await tx.delete(economyEntry);
    // Reversals point at the transaction they undo, so they go first.
    await tx.delete(economyTransaction).where(sql`${economyTransaction.reversesId} is not null`);
    await tx.delete(economyTransaction);
    await tx.delete(economyInvitation);
    await tx.delete(economyMember);
    await tx.delete(economyProfile);
    await tx.delete(economyDailyStat);
    await tx.delete(economyAccount);
    await adminAuditService.record(tx, {
      action: 'economy.reset',
      actorUserId: actorId,
      targetUserId: null,
      data: { accounts: accounts.length, supply: Number(totals?.supply ?? 0) },
    });
  });
}

export const economyAdminService = {
  list,
  detail,
  transactions,
  adjust,
  freeze,
  reverse,
  ledger,
  exportAll,
  reset,
};
