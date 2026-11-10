import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyDailyStat,
  economyEntry,
  economyTransaction,
} from '~~/server/db/schema';
import type { EconomyKindVolume } from '~~/server/db/schema';

import { daysBetween, gini, histogram, parisDay, periodStart, topShare } from './rules';
import type { Db } from './shared';
import { memberCounts } from './views';

import type { EconomyPeriod, EconomyStats } from '#shared/schemas/economy';
import { ECONOMY_VOLUME_KINDS } from '#shared/schemas/economy';

// The admin overview's numbers. Closed days come from economy_daily_stat, written each night by
// the economy:snapshot task; the current day is computed live. See docs/economy.md.

const parisDate = sql<string>`to_char((${economyTransaction.at} at time zone 'UTC') at time zone 'Europe/Paris', 'YYYY-MM-DD')`;

interface DayFlows {
  minted: number;
  burned: number;
  volume: Partial<Record<string, EconomyKindVolume>>;
}

/** Money created, destroyed and moved per Paris day, for the days in [from, to). */
async function flowsByDay(dbx: Db, from: Date | null, to: Date | null) {
  const range = and(
    from ? gte(economyTransaction.at, from) : undefined,
    to ? lt(economyTransaction.at, to) : undefined,
  );
  const [issuance, volume] = await Promise.all([
    // Lines without an account: negative is money created, positive is money destroyed.
    dbx
      .select({
        day: parisDate,
        minted: sql<string>`coalesce(-sum(${economyEntry.amount}) filter (where ${economyEntry.amount} < 0), 0)`,
        burned: sql<string>`coalesce(sum(${economyEntry.amount}) filter (where ${economyEntry.amount} > 0), 0)`,
      })
      .from(economyEntry)
      .innerJoin(economyTransaction, eq(economyTransaction.id, economyEntry.transactionId))
      .where(and(isNull(economyEntry.accountId), range))
      .groupBy(parisDate),
    dbx
      .select({
        day: parisDate,
        kind: economyTransaction.kind,
        amount: sql<string>`coalesce(sum(${economyEntry.amount}) filter (where ${economyEntry.amount} > 0), 0)`,
        count: countDistinct(economyTransaction.id),
      })
      .from(economyEntry)
      .innerJoin(economyTransaction, eq(economyTransaction.id, economyEntry.transactionId))
      .where(and(inArray(economyTransaction.kind, [...ECONOMY_VOLUME_KINDS]), range))
      .groupBy(parisDate, economyTransaction.kind),
  ]);
  const days = new Map<string, DayFlows>();
  const day = (key: string) => {
    const existing = days.get(key);
    if (existing) return existing;
    const created: DayFlows = { minted: 0, burned: 0, volume: {} };
    days.set(key, created);
    return created;
  };
  for (const row of issuance) {
    day(row.day).minted += Number(row.minted);
    day(row.day).burned += Number(row.burned);
  }
  for (const row of volume) {
    day(row.day).volume[row.kind] = { amount: Number(row.amount), count: row.count };
  }
  return days;
}

/** Money in circulation: every balance added up. */
async function supplyNow(dbx: Db = db): Promise<number> {
  const [row] = await dbx
    .select({ total: sql<string>`coalesce(sum(${economyAccount.balance}), 0)` })
    .from(economyAccount);
  return Number(row?.total ?? 0);
}

/** Midnight in Paris at the start of a YYYY-MM-DD day, as an instant. */
function parisMidnight(day: string): Date {
  const noon = new Date(`${day}T12:00:00Z`);
  const parisNoon = new Date(noon.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const offset =
    parisNoon.getTime() - new Date(noon.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(Date.parse(`${day}T00:00:00Z`) - offset);
}

/**
 * Writes the closed days missing from economy_daily_stat, up to yesterday. Run every night by
 * tasks/economy/snapshot.ts. Returns how many days were written.
 */
async function snapshot(now = new Date()): Promise<number> {
  const today = parisDay(now);
  const [last] = await db
    .select({ day: economyDailyStat.day })
    .from(economyDailyStat)
    .orderBy(desc(economyDailyStat.day))
    .limit(1);
  const [first] = await db
    .select({ at: economyTransaction.at })
    .from(economyTransaction)
    .orderBy(asc(economyTransaction.id))
    .limit(1);
  if (!first) return 0;
  const start = last ? daysBetween(last.day, today)[1] : parisDay(first.at);
  if (!start || start >= today) return 0;
  const days = daysBetween(start, today).slice(0, -1);
  const from = parisMidnight(start);
  const to = parisMidnight(today);
  const flows = await flowsByDay(db, from, to);

  // Walk back from today's supply: each later day's net creation is taken off.
  const todayFlows = await flowsByDay(db, to, null);
  let supply = await supplyNow();
  for (const flow of todayFlows.values()) supply -= flow.minted - flow.burned;
  const rows = [...days].reverse().map((day) => {
    const flow = flows.get(day) ?? { minted: 0, burned: 0, volume: {} };
    const row = { day, minted: flow.minted, burned: flow.burned, supply, volume: flow.volume };
    supply -= flow.minted - flow.burned;
    return row;
  });
  await db.insert(economyDailyStat).values(rows).onConflictDoNothing();
  return rows.length;
}

async function stats(period: EconomyPeriod, now = new Date()): Promise<EconomyStats> {
  const start = periodStart(period, now);
  const today = parisDay(now);
  const todayStart = parisMidnight(today);

  const [closed, live, supply, players, reasons, balances, shared] = await Promise.all([
    db
      .select()
      .from(economyDailyStat)
      .where(start ? gte(economyDailyStat.day, parisDay(start)) : undefined)
      .orderBy(asc(economyDailyStat.day)),
    flowsByDay(db, todayStart, null),
    supplyNow(),
    db
      .select({ n: countDistinct(economyTransaction.actorUserId) })
      .from(economyTransaction)
      .where(
        and(
          inArray(economyTransaction.kind, [...ECONOMY_VOLUME_KINDS]),
          isNotNull(economyTransaction.actorUserId),
          start ? gte(economyTransaction.at, start) : undefined,
        ),
      ),
    db
      .select({
        kind: economyTransaction.kind,
        reason: economyTransaction.reason,
        amount: sql<string>`coalesce(sum(abs(${economyEntry.amount})), 0)`,
      })
      .from(economyEntry)
      .innerJoin(economyTransaction, eq(economyTransaction.id, economyEntry.transactionId))
      .where(
        and(
          isNull(economyEntry.accountId),
          inArray(economyTransaction.kind, ['mint', 'burn']),
          start ? gte(economyTransaction.at, start) : undefined,
        ),
      )
      .groupBy(economyTransaction.kind, economyTransaction.reason),
    db
      .select({ balance: economyAccount.balance })
      .from(economyAccount)
      .where(
        and(
          eq(economyAccount.kind, 'personal'),
          isNull(economyAccount.closedAt),
          isNotNull(economyAccount.ownerUserId),
        ),
      ),
    db
      .select({
        id: economyAccount.id,
        handle: economyAccount.handle,
        name: economyAccount.name,
        balance: economyAccount.balance,
      })
      .from(economyAccount)
      .where(and(eq(economyAccount.kind, 'shared'), isNull(economyAccount.closedAt)))
      .orderBy(desc(economyAccount.balance))
      .limit(5),
  ]);

  const todayFlow = live.get(today) ?? { minted: 0, burned: 0, volume: {} };
  const days = [
    ...closed.map((row) => ({
      day: row.day,
      supply: row.supply,
      minted: row.minted,
      burned: row.burned,
      volume: row.volume,
    })),
    { day: today, supply, ...todayFlow },
  ];
  const minted = days.reduce((total, day) => total + day.minted, 0);
  const burned = days.reduce((total, day) => total + day.burned, 0);
  const volume = ECONOMY_VOLUME_KINDS.map((kind) => ({
    kind,
    amount: days.reduce((total, day) => total + (day.volume[kind]?.amount ?? 0), 0),
    count: days.reduce((total, day) => total + (day.volume[kind]?.count ?? 0), 0),
  }));
  const held = balances.map((row) => row.balance).filter((balance) => balance > 0);
  const counts = await memberCounts(
    db,
    shared.map((row) => row.id),
  );

  return {
    period,
    supply,
    supplyChange: minted - burned,
    minted,
    burned,
    activePlayers: players[0]?.n ?? 0,
    transactions: volume.reduce((total, row) => total + row.count, 0),
    moved: volume.reduce((total, row) => total + row.amount, 0),
    days: days.map(({ day, supply: daySupply, minted: dayMinted, burned: dayBurned }) => ({
      day,
      supply: daySupply,
      minted: dayMinted,
      burned: dayBurned,
    })),
    reasons: reasons.flatMap((row) =>
      row.reason
        ? [
            {
              direction: row.kind === 'mint' ? ('mint' as const) : ('burn' as const),
              reason: row.reason,
              amount: Number(row.amount),
            },
          ]
        : [],
    ),
    volume,
    distribution: {
      accounts: held.length,
      top10Share: topShare(held),
      gini: gini(held),
      histogram: histogram(balances.map((row) => row.balance)),
    },
    largestShared: shared.map((row) => ({
      id: row.id,
      handle: row.handle ?? '',
      name: row.name ?? '',
      balance: row.balance,
      memberCount: counts.get(row.id) ?? 0,
    })),
  };
}

export const economyStatsService = { stats, snapshot, parisMidnight };
