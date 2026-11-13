import type { QuestSettings, QuestShareFamily } from '../../../shared/schemas/quests.ts';

// The reward formula, without the database: R = Rbase × Kglobal × Kplayer, then the cap.
// Taken from the economy spec (lnb-economy, "Spécification Technique — Économie Serveur"):
// a daily index of the active players' wealth, a damped global multiplier, and a catch-up bonus
// for players below the index. See docs/quests.md.

type Formula = QuestSettings['formula'];

/** The value at a fraction (0 to 1) of sorted values, interpolated like Python's statistics module. */
export function quantile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below);
}

export interface IndexResult {
  activePlayers: number;
  median: number;
  q3: number;
  mean: number;
  index: number;
  kGlobal: number;
  /** Too few active players, or a median of 0: the reference index was used. */
  fallback: boolean;
}

/** The day's index and global multiplier, from the active players' personal balances. */
export function computeIndex(
  balances: readonly number[],
  formula: Formula,
  minPlayers: number,
): IndexResult {
  const sorted = [...balances].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const mean = sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0;
  const base = { activePlayers: sorted.length, median, q3, mean };
  if (sorted.length < minPlayers || median <= 0) {
    return { ...base, index: formula.baselineIndex, kGlobal: 1, fallback: true };
  }
  const index = formula.wMedian * median + formula.wQ3 * q3 + formula.wMean * mean;
  return { ...base, index, kGlobal: kGlobal(index, formula), fallback: false };
}

/** The damped global multiplier: (I / I0)^alpha, kept between kMin and kMax. */
export function kGlobal(index: number, formula: Formula): number {
  if (index <= 0) return formula.kMin;
  const raw = Math.pow(index / formula.baselineIndex, formula.alpha);
  return Math.min(formula.kMax, Math.max(formula.kMin, raw));
}

/** The catch-up bonus: up to bMax more for a player with nothing, none at or above the index. */
export function kPlayer(balance: number, index: number, formula: Formula): number {
  if (index <= 0 || balance >= index) return 1;
  return 1 + formula.bMax * (1 - Math.max(0, balance) / index);
}

/** The reward before the cap, in whole LNBits. */
export function reward(base: number, global: number, player: number): number {
  return Math.max(0, Math.round(base * global * player));
}

/** One family's budget over 30 rolling days: its share of `cap.percent` of the money in circulation. */
export function familyBudget(
  family: QuestShareFamily,
  circulation: number,
  cap: QuestSettings['cap'],
): number | null {
  if (cap.percent <= 0) return null;
  const total = (cap.percent / 100) * circulation;
  const shares = Object.values(cap.shares).reduce((sum, value) => sum + value, 0);
  if (shares <= 0) return 0;
  return Math.floor((total * cap.shares[family]) / shares);
}

/** Cuts a reward to what is left of the budget. A null budget is no cap. */
export function applyCap(amount: number, budget: number | null, spent: number) {
  if (budget === null) return { amount, capped: false };
  const left = Math.max(0, budget - spent);
  return amount > left ? { amount: left, capped: true } : { amount, capped: false };
}

/** Whether a Paris time of day ("HH:MM") is inside a range, which may cross midnight. */
export function withinHours(time: string, hours: { from: string; to: string } | undefined) {
  if (!hours) return true;
  if (hours.from === hours.to) return true;
  return hours.from < hours.to
    ? time >= hours.from && time < hours.to
    : time >= hours.from || time < hours.to;
}
