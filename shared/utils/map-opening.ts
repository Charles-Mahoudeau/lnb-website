import { parisDate } from './paris-time.ts';

// What the wait page says while the map is closed (docs/map.md). Days are Paris calendar days,
// so "tomorrow" means the next day on the clock, not 24 hours from now.

export type MapCountdown =
  | { unit: 'days'; n: number }
  | { unit: 'tomorrow' }
  | { unit: 'hours'; n: number }
  | { unit: 'minutes'; n: number }
  | { unit: 'now' };

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** How long is left until the map opens, in the unit that reads best. */
export function mapCountdown(opensAt: string, now: number): MapCountdown {
  const opens = Date.parse(opensAt);
  const left = opens - now;
  if (left <= 0) return { unit: 'now' };
  const days = daysBetween(parisDate(now), parisDate(opens));
  if (days >= 2) return { unit: 'days', n: days };
  if (days === 1) return { unit: 'tomorrow' };
  if (left >= 3_600_000) return { unit: 'hours', n: Math.floor(left / 3_600_000) };
  return { unit: 'minutes', n: Math.max(1, Math.ceil(left / 60_000)) };
}

/**
 * How far into the wait it is: "Day 3 of 17" and a percentage. Null without a start, or when the
 * start is not before the opening.
 */
export function mapProgress(
  lockedAt: string | null,
  opensAt: string,
  now: number,
): { day: number; total: number; percent: number } | null {
  if (!lockedAt) return null;
  const start = Date.parse(lockedAt);
  const end = Date.parse(opensAt);
  if (!(start < end)) return null;
  const total = Math.max(1, daysBetween(parisDate(start), parisDate(end)));
  const day = Math.min(total, Math.max(1, daysBetween(parisDate(start), parisDate(now)) + 1));
  const percent = Math.round(Math.min(1, Math.max(0, (now - start) / (end - start))) * 100);
  return { day, total, percent };
}
