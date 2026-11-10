import { and, count, desc, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { economyAccount, economyProfile } from '~~/server/db/schema';

import { memberCounts, playerNames } from './views';

import type { EconomyBaltop } from '#shared/schemas/economy';

// The richest players and shared accounts. Players can leave the ranking (hideFromBaltop);
// shared accounts can't, since a casino is public by nature. See docs/economy.md.

const PLAYERS = 50;
const SHARED = 20;

/** Personal accounts of players who show on the baltop. */
const visiblePersonal = and(
  eq(economyAccount.kind, 'personal'),
  isNotNull(economyAccount.ownerUserId),
  isNull(economyAccount.closedAt),
  or(isNull(economyProfile.hideFromBaltop), eq(economyProfile.hideFromBaltop, false)),
);

/** The account's place: one more than the accounts holding more. */
async function rankOf(accountId: string): Promise<number | null> {
  const [account] = await db
    .select({ balance: economyAccount.balance })
    .from(economyAccount)
    .leftJoin(economyProfile, eq(economyProfile.userId, economyAccount.ownerUserId))
    .where(and(eq(economyAccount.id, accountId), visiblePersonal));
  if (!account) return null;
  const [above] = await db
    .select({ n: count() })
    .from(economyAccount)
    .leftJoin(economyProfile, eq(economyProfile.userId, economyAccount.ownerUserId))
    .where(and(visiblePersonal, gt(economyAccount.balance, account.balance)));
  return (above?.n ?? 0) + 1;
}

/** Players with the same balance share a place. */
function ranked<T extends { balance: number }>(rows: readonly T[]): (T & { rank: number })[] {
  return rows.map((row) => ({
    ...row,
    rank: rows.findIndex((other) => other.balance === row.balance) + 1,
  }));
}

async function list(userId: string | null): Promise<EconomyBaltop> {
  const [players, shared] = await Promise.all([
    db
      .select({
        id: economyAccount.id,
        ownerUserId: economyAccount.ownerUserId,
        balance: economyAccount.balance,
      })
      .from(economyAccount)
      .leftJoin(economyProfile, eq(economyProfile.userId, economyAccount.ownerUserId))
      .where(visiblePersonal)
      .orderBy(desc(economyAccount.balance), economyAccount.createdAt)
      .limit(PLAYERS),
    db
      .select({
        id: economyAccount.id,
        handle: economyAccount.handle,
        name: economyAccount.name,
        balance: economyAccount.balance,
      })
      .from(economyAccount)
      .where(and(eq(economyAccount.kind, 'shared'), isNull(economyAccount.closedAt)))
      .orderBy(desc(economyAccount.balance), economyAccount.createdAt)
      .limit(SHARED),
  ]);
  const [names, counts] = await Promise.all([
    playerNames(
      db,
      players.flatMap((row) => (row.ownerUserId ? [row.ownerUserId] : [])),
    ),
    memberCounts(
      db,
      shared.map((row) => row.id),
    ),
  ]);

  let me: EconomyBaltop['me'] = null;
  if (userId) {
    const [mine] = await db
      .select({ id: economyAccount.id, balance: economyAccount.balance })
      .from(economyAccount)
      .where(and(eq(economyAccount.ownerUserId, userId), isNull(economyAccount.closedAt)));
    const rank = mine ? await rankOf(mine.id) : null;
    if (mine && rank) me = { rank, balance: mine.balance };
  }

  return {
    players: ranked(players).map((row) => {
      const name = row.ownerUserId ? names.get(row.ownerUserId) : undefined;
      return {
        rank: row.rank,
        name: name?.name ?? null,
        username: name?.username ?? null,
        balance: row.balance,
        me: row.ownerUserId === userId,
      };
    }),
    shared: ranked(shared).map((row) => ({
      rank: row.rank,
      handle: row.handle ?? '',
      name: row.name ?? '',
      balance: row.balance,
      memberCount: counts.get(row.id) ?? 0,
    })),
    me,
  };
}

export const economyBaltopService = { list, rankOf };
