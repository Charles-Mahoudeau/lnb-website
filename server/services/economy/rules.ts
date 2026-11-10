// Pure economy rules: no database, so they're easy to test. See docs/economy.md.

import type { EconomyPeriod, EconomyRole } from '#shared/schemas/economy';

/** Owners and members spend. Viewers only read. */
export function canSpend(role: EconomyRole | null | undefined): boolean {
  return role === 'owner' || role === 'member';
}

/** Owners rename, invite, change roles, remove members and close the account. */
export function canManage(role: EconomyRole | null | undefined): boolean {
  return role === 'owner';
}

/** A transaction's lines add up to zero, and none is zero. */
export function isBalanced(legs: readonly { amount: number }[]): boolean {
  return (
    legs.length >= 2 &&
    legs.every((leg) => leg.amount !== 0) &&
    legs.reduce((sum, leg) => sum + leg.amount, 0) === 0
  );
}

/** Lines of the same account merged, so an account is locked and updated once. */
export function mergeLegs<T extends string | null>(
  legs: readonly { accountId: T; amount: number }[],
): { accountId: T; amount: number }[] {
  const merged = new Map<T, number>();
  for (const leg of legs) merged.set(leg.accountId, (merged.get(leg.accountId) ?? 0) + leg.amount);
  return [...merged]
    .filter(([, amount]) => amount !== 0)
    .map(([accountId, amount]) => ({ accountId, amount }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first day a period covers, or null for all time. */
export function periodStart(period: EconomyPeriod, now = new Date()): Date | null {
  if (period === 'all') return null;
  const days = Number.parseInt(period, 10);
  return new Date(now.getTime() - days * DAY_MS);
}

/** The day (YYYY-MM-DD) of a date in Paris time, the day boundaries of every economy stat. */
export function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Every day from `from` to `to`, both included, as YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let at = Date.parse(`${from}T12:00:00Z`);
    at <= Date.parse(`${to}T12:00:00Z`);
    at += DAY_MS
  ) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/** The Gini coefficient of the balances: 0 when equal, close to 1 when one holds everything. */
export function gini(balances: readonly number[]): number {
  const sorted = [...balances].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (n === 0 || total === 0) return 0;
  const weighted = sorted.reduce((sum, value, i) => sum + (i + 1) * value, 0);
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/** The share of all the money held by the richest 10% (at least one account). */
export function topShare(balances: readonly number[], fraction = 0.1): number {
  const sorted = [...balances].sort((a, b) => b - a);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  const top = Math.max(1, Math.ceil(sorted.length * fraction));
  return sorted.slice(0, top).reduce((sum, value) => sum + value, 0) / total;
}

/** Balance ranges for the distribution histogram: 0, then up to 100k and more. */
export const HISTOGRAM_BOUNDS = [0, 1, 100, 500, 1000, 5000, 20_000, 100_000] as const;

export function histogram(balances: readonly number[]) {
  return HISTOGRAM_BOUNDS.map((from, i) => {
    const to = HISTOGRAM_BOUNDS[i + 1] ?? null;
    return {
      from,
      to,
      count: balances.filter((value) => value >= from && (to === null || value < to)).length,
    };
  });
}

/** Cursors are the last ID of a page, so a new transaction never shifts the next page. */
export function encodeCursor(id: number | string): string {
  return String(id);
}
