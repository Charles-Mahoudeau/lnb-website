import { and, count, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyEntry,
  economyMember,
  economyTransaction,
  minecraftAccount,
  user,
  wardenPlayer,
} from '~~/server/db/schema';
import { shortName } from '~~/server/services/warden/rules';

import { bannedUsers, decodeCursor, PAGE_SIZE } from './shared';
import type { Db } from './shared';

import type {
  EconomyCounterparty,
  EconomyRole,
  EconomyTransactionPage,
  EconomyAccountView,
} from '#shared/schemas/economy';

export interface PlayerName {
  /** First name and initial, or null when the player hides it (Warden's `showRealName`). */
  name: string | null;
  /** The linked Minecraft account seen last, for its head. */
  uuid: string | null;
  username: string | null;
  /** The full name, for admins. */
  fullName: string;
}

/** How players show in the economy: as in-game, first name and initial, then the username. */
export async function playerNames(
  dbx: Db,
  userIds: readonly string[],
): Promise<Map<string, PlayerName>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const [people, accounts] = await Promise.all([
    dbx
      .select({ id: user.id, name: user.name, showRealName: wardenPlayer.showRealName })
      .from(user)
      .leftJoin(wardenPlayer, eq(wardenPlayer.userId, user.id))
      .where(inArray(user.id, ids)),
    dbx
      .select({
        userId: minecraftAccount.userId,
        uuid: minecraftAccount.uuid,
        username: minecraftAccount.username,
      })
      .from(minecraftAccount)
      .where(and(inArray(minecraftAccount.userId, ids), isNull(minecraftAccount.unlinkedAt)))
      .orderBy(
        sql`${minecraftAccount.lastSeenAt} desc nulls last`,
        desc(minecraftAccount.linkedAt),
      ),
  ]);
  const main = new Map<string, { uuid: string; username: string }>();
  for (const account of accounts) {
    if (!main.has(account.userId)) main.set(account.userId, account);
  }
  return new Map(
    people.map((person) => [
      person.id,
      {
        name: (person.showRealName ?? true) ? shortName(person.name) : null,
        uuid: main.get(person.id)?.uuid ?? null,
        username: main.get(person.id)?.username ?? null,
        fullName: person.name,
      },
    ]),
  );
}

/** How many members each shared account has. */
export async function memberCounts(dbx: Db, accountIds: readonly string[]) {
  if (!accountIds.length) return new Map<string, number>();
  const rows = await dbx
    .select({ accountId: economyMember.accountId, n: count() })
    .from(economyMember)
    .where(inArray(economyMember.accountId, [...accountIds]))
    .groupBy(economyMember.accountId);
  return new Map(rows.map((row) => [row.accountId, row.n]));
}

type AccountRow = Pick<
  typeof economyAccount.$inferSelect,
  'id' | 'kind' | 'handle' | 'name' | 'balance' | 'ownerUserId' | 'frozenAt'
>;

/** Accounts as their members see them, with the viewer's role in each. */
export async function accountViews(
  dbx: Db,
  rows: readonly (AccountRow & { role: EconomyRole })[],
): Promise<EconomyAccountView[]> {
  const counts = await memberCounts(
    dbx,
    rows.filter((row) => row.kind === 'shared').map((row) => row.id),
  );
  const banned = await bannedUsers(
    dbx,
    rows.flatMap((row) => (row.ownerUserId ? [row.ownerUserId] : [])),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    handle: row.handle,
    name: row.name,
    balance: row.balance,
    role: row.role,
    frozen: Boolean(row.frozenAt) || (row.ownerUserId !== null && banned.has(row.ownerUserId)),
    memberCount: row.kind === 'shared' ? (counts.get(row.id) ?? 0) : 1,
  }));
}

/** What a ledger line's account looks like from the other side. */
export async function counterparties(
  dbx: Db,
  accountIds: readonly (string | null)[],
): Promise<(id: string | null) => EconomyCounterparty> {
  const ids = [...new Set(accountIds.filter((id): id is string => id !== null))];
  const accounts = ids.length
    ? await dbx
        .select({
          id: economyAccount.id,
          kind: economyAccount.kind,
          handle: economyAccount.handle,
          name: economyAccount.name,
          ownerUserId: economyAccount.ownerUserId,
        })
        .from(economyAccount)
        .where(inArray(economyAccount.id, ids))
    : [];
  const names = await playerNames(
    dbx,
    accounts.flatMap((account) => (account.ownerUserId ? [account.ownerUserId] : [])),
  );
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return (id) => {
    if (id === null) return { type: 'lnb' };
    const account = byId.get(id);
    if (!account) return { type: 'deleted' };
    if (account.kind === 'shared') {
      return { type: 'account', handle: account.handle ?? '', name: account.name ?? '' };
    }
    const owner = account.ownerUserId ? names.get(account.ownerUserId) : undefined;
    if (!owner) return { type: 'deleted' };
    return { type: 'player', name: owner.name, username: owner.username };
  };
}

/** An account's history, newest first, 50 per page. */
export async function accountTransactions(
  accountId: string,
  cursor: string | undefined,
  dbx: Db = db,
): Promise<EconomyTransactionPage> {
  const before = decodeCursor(cursor);
  const reversal = economyTransaction;
  const rows = await dbx
    .select({
      id: economyTransaction.id,
      at: economyTransaction.at,
      kind: economyTransaction.kind,
      reason: economyTransaction.reason,
      memo: economyTransaction.memo,
      amount: economyEntry.amount,
      balanceAfter: economyEntry.balanceAfter,
    })
    .from(economyEntry)
    .innerJoin(economyTransaction, eq(economyTransaction.id, economyEntry.transactionId))
    .where(
      and(
        eq(economyEntry.accountId, accountId),
        before ? lt(economyEntry.transactionId, before) : undefined,
      ),
    )
    .orderBy(desc(economyEntry.transactionId))
    .limit(PAGE_SIZE + 1);
  const pageRows = rows.slice(0, PAGE_SIZE);
  const ids = pageRows.map((row) => row.id);

  const [others, reversed] = ids.length
    ? await Promise.all([
        dbx
          .select({ transactionId: economyEntry.transactionId, accountId: economyEntry.accountId })
          .from(economyEntry)
          .where(
            and(
              inArray(economyEntry.transactionId, ids),
              or(isNull(economyEntry.accountId), ne(economyEntry.accountId, accountId)),
            ),
          ),
        dbx
          .select({ id: reversal.reversesId })
          .from(reversal)
          .where(and(inArray(reversal.reversesId, ids), isNotNull(reversal.reversesId))),
      ])
    : [[], []];
  const otherSides = new Map<number, (string | null)[]>();
  for (const other of others) {
    otherSides.set(other.transactionId, [
      ...(otherSides.get(other.transactionId) ?? []),
      other.accountId,
    ]);
  }
  const reversedIds = new Set(reversed.map((row) => row.id));
  const lookup = await counterparties(
    dbx,
    others.map((other) => other.accountId),
  );

  const items = pageRows.map((row) => {
    const sides = otherSides.get(row.id) ?? [];
    const counterparty: EconomyCounterparty =
      sides.length === 1 ? lookup(sides[0] ?? null) : { type: 'several' };
    return {
      id: row.id,
      at: row.at.toISOString(),
      kind: row.kind,
      reason: row.reason,
      memo: row.memo,
      amount: row.amount,
      balanceAfter: row.balanceAfter ?? 0,
      counterparty,
      reversed: reversedIds.has(row.id),
    };
  });
  const last = items.at(-1);
  return { items, nextCursor: rows.length > PAGE_SIZE && last ? String(last.id) : null };
}
