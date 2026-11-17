import { timeToMinutes } from '../../../shared/schemas/playtime.ts';
import type {
  PlaytimeMode,
  PlaytimeSchedule,
  PlaytimeState,
  PlaytimeUnlimitedReason,
} from '../../../shared/schemas/playtime.ts';
import {
  addDays,
  mondayOf,
  parisDate,
  parisInstant,
  WEEKDAYS,
  weekdayOf,
} from '../../../shared/utils/paris-time.ts';
import type { Weekday } from '../../../shared/utils/paris-time.ts';

// The playtime limit's pure rules, without database or Nuxt imports, so plain unit tests can load
// them. Instants are epoch milliseconds, weeks are identified by their Monday in Paris
// ("2026-11-16"), and every wall-clock time goes through the Paris helpers, never through the
// server's time zone. See docs/playtime.md.

const SECOND = 1000;
const DAY_MS = 86_400_000;
/** How far ahead the search for the next window goes. A schedule with none gives null. */
const HORIZON_DAYS = 14;

export interface PlaytimeConfig {
  allowanceSeconds: number;
  schedule: PlaytimeSchedule;
  /** Zero switches the grace period off. */
  graceSeconds: number;
  warningsMinutes: number[];
  startWarningsMinutes: number[];
}

/** One level of overrides: every field null or left out inherits from the level above. */
export interface PlaytimeOverrides {
  allowanceSeconds?: number | null;
  schedule?: PlaytimeSchedule | null;
  graceSeconds?: number | null;
  warningsMinutes?: number[] | null;
  startWarningsMinutes?: number[] | null;
}

/** A closure that applies to the player, as Paris dates, both inclusive. */
export interface ClosureRange {
  startsOn: string;
  endsOn: string;
}

/**
 * The effective settings, each field on its own: player, then school, then global. A player only
 * overrides the allowance, the grace length and the warning times, never the schedule.
 */
export function resolveConfig(
  global: PlaytimeConfig,
  school?: PlaytimeOverrides | null,
  player?: PlaytimeOverrides | null,
): PlaytimeConfig {
  return {
    allowanceSeconds:
      player?.allowanceSeconds ?? school?.allowanceSeconds ?? global.allowanceSeconds,
    schedule: school?.schedule ?? global.schedule,
    graceSeconds: player?.graceSeconds ?? school?.graceSeconds ?? global.graceSeconds,
    warningsMinutes: player?.warningsMinutes ?? school?.warningsMinutes ?? global.warningsMinutes,
    startWarningsMinutes: school?.startWarningsMinutes ?? global.startWarningsMinutes,
  };
}

/** The Monday of the week containing an instant, in Paris: the key of a week. */
export function weekStart(instant: number): string {
  return mondayOf(parisDate(instant));
}

/** The instants a week starts and ends at: Monday 00:00 to the next Monday 00:00, in Paris. */
export function weekBounds(monday: string): { from: number; to: number } {
  return { from: parisInstant(monday, 0), to: parisInstant(addDays(monday, 7), 0) };
}

function isClosed(date: string, closures: readonly ClosureRange[]): boolean {
  return closures.some((closure) => closure.startsOn <= date && date <= closure.endsOn);
}

/** The window ranges of a Paris date, as instants. Empty on a closed day. */
function dayWindows(
  date: string,
  schedule: PlaytimeSchedule,
  closures: readonly ClosureRange[],
): [number, number][] {
  if (isClosed(date, closures)) return [];
  return schedule[weekdayOf(date)].map(([start, end]) => [
    parisInstant(date, timeToMinutes(start)),
    parisInstant(date, timeToMinutes(end)),
  ]);
}

/**
 * The restricted windows touching [from, to], whole and not clipped, sorted. Windows that touch
 * (one ends at 24:00, the next starts at 00:00) are one window, so a grace period is the end of
 * the whole stretch.
 */
export function windowsAround(
  from: number,
  to: number,
  schedule: PlaytimeSchedule,
  closures: readonly ClosureRange[],
): [number, number][] {
  const first = addDays(parisDate(from), -7);
  const last = addDays(parisDate(to), 7);
  const merged: [number, number][] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    for (const [start, end] of dayWindows(date, schedule, closures)) {
      const previous = merged.at(-1);
      if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
      else merged.push([start, end]);
    }
  }
  return merged.filter(([start, end]) => end > from && start < to);
}

/** A stretch of time that is either inside a restricted window (counted) or outside (free). */
export interface Segment {
  from: number;
  to: number;
  counted: boolean;
  /** When the window this stretch is in ends, whole. Null for a free stretch. */
  windowEnd: number | null;
}

/** Splits [from, to] at the edges of the restricted windows. */
export function segments(
  from: number,
  to: number,
  schedule: PlaytimeSchedule,
  closures: readonly ClosureRange[],
): Segment[] {
  const out: Segment[] = [];
  let cursor = from;
  for (const [start, end] of windowsAround(from, to, schedule, closures)) {
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (a > cursor) out.push({ from: cursor, to: a, counted: false, windowEnd: null });
    out.push({ from: a, to: b, counted: true, windowEnd: end });
    cursor = b;
  }
  if (cursor < to) out.push({ from: cursor, to, counted: false, windowEnd: null });
  return out;
}

/** How much of a time span is inside the restricted windows and how much is outside, in seconds. */
export function splitInterval(
  from: number,
  to: number,
  schedule: PlaytimeSchedule,
  closures: readonly ClosureRange[],
): { countedSeconds: number; freeSeconds: number } {
  let counted = 0;
  for (const segment of segments(from, to, schedule, closures)) {
    if (segment.counted) counted += segment.to - segment.from;
  }
  const countedSeconds = Math.round(counted / SECOND);
  return {
    countedSeconds,
    freeSeconds: Math.round(Math.max(0, to - from) / SECOND) - countedSeconds,
  };
}

export interface Evaluation {
  state: PlaytimeState;
  /** Why the player is `unlimited`. */
  reason: PlaytimeUnlimitedReason | null;
  /** The week's allowance with grants, the part used, and the part left (never below 0). */
  allowanceSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  /** When the restricted window the player is in ends. Null outside one. */
  windowEndsAt: number | null;
  /** When the next restricted window starts. Null inside one, or when there is none soon. */
  nextWindowStartsAt: number | null;
  /** When a grace period ends: the end of the window. */
  graceEndsAt: number | null;
  /** When a blocked or closed player can play again. */
  resumesAt: number | null;
  /** The next Monday 00:00 in Paris, when the allowance resets. */
  resetsAt: number;
  /** The next instant the answer may change, or null when nothing is due. */
  nextChangeAt: number | null;
}

export interface EvaluateInput {
  now: number;
  mode: PlaytimeMode;
  config: PlaytimeConfig;
  closures: readonly ClosureRange[];
  usedSeconds: number;
  grantedSeconds: number;
  exempt: boolean;
}

/**
 * Where a player stands at an instant. Nothing here depends on how the allowance ran out: someone
 * with no allowance left is blocked inside a window, unless it ends within the grace period.
 * `observe` evaluates like `enforce`: it only decides whether anyone acts on the answer.
 */
export function evaluate(input: EvaluateInput): Evaluation {
  const { now, config } = input;
  const allowanceSeconds = config.allowanceSeconds + input.grantedSeconds;
  const remainingSeconds = Math.max(0, allowanceSeconds - input.usedSeconds);
  const resetsAt = weekBounds(weekStart(now)).to;
  const base = {
    allowanceSeconds,
    usedSeconds: input.usedSeconds,
    remainingSeconds,
    windowEndsAt: null,
    nextWindowStartsAt: null,
    graceEndsAt: null,
    resumesAt: null,
    resetsAt,
    nextChangeAt: null,
  } satisfies Omit<Evaluation, 'state' | 'reason'>;

  if (input.mode === 'off') return { ...base, state: 'unlimited', reason: 'off' };
  if (input.exempt) return { ...base, state: 'unlimited', reason: 'exempt' };

  const today = parisDate(now);
  if (isClosed(today, input.closures)) {
    let date = today;
    for (let i = 0; i < 400 && isClosed(date, input.closures); i++) date = addDays(date, 1);
    const resumesAt = parisInstant(date, 0);
    return { ...base, state: 'unlimited', reason: 'closed', resumesAt, nextChangeAt: resumesAt };
  }

  const windows = windowsAround(now, now + HORIZON_DAYS * DAY_MS, config.schedule, input.closures);
  const current = windows.find(([start, end]) => start <= now && now < end);
  if (!current) {
    const next = windows.find(([start]) => start > now);
    return {
      ...base,
      state: 'free',
      reason: null,
      nextWindowStartsAt: next?.[0] ?? null,
      nextChangeAt: next?.[0] ?? null,
    };
  }

  const windowEndsAt = current[1];
  if (remainingSeconds > 0) {
    const runsOutAt = now + remainingSeconds * SECOND;
    return {
      ...base,
      state: 'counting',
      reason: null,
      windowEndsAt,
      nextChangeAt: Math.min(windowEndsAt, runsOutAt, resetsAt),
    };
  }
  const graceStartsAt = windowEndsAt - config.graceSeconds * SECOND;
  if (config.graceSeconds > 0 && now >= graceStartsAt) {
    return {
      ...base,
      state: 'grace',
      reason: null,
      windowEndsAt,
      graceEndsAt: windowEndsAt,
      nextChangeAt: Math.min(windowEndsAt, resetsAt),
    };
  }
  return {
    ...base,
    state: 'blocked',
    reason: null,
    windowEndsAt,
    resumesAt: windowEndsAt,
    nextChangeAt: Math.min(config.graceSeconds > 0 ? graceStartsAt : windowEndsAt, resetsAt),
  };
}

/** Seconds of one stretch of a week, by what they count as. */
export interface LedgerDelta {
  countedSeconds: number;
  graceSeconds: number;
  /** Time played with no allowance left and no grace: only seen in `observe`, or before a kick. */
  overSeconds: number;
  freeSeconds: number;
}

export interface WeekDelta extends LedgerDelta {
  /** The Monday of the week, in Paris. */
  week: string;
}

export interface AdvanceInput {
  from: number;
  to: number;
  config: PlaytimeConfig;
  closures: readonly ClosureRange[];
  /** Exempt accounts and the mode `off` use no allowance: all their time is free. */
  unlimited: boolean;
  /** Counted seconds already used, by week, over every account of the player. */
  usedByWeek: Readonly<Record<string, number>>;
  /** Extra seconds granted, by week. */
  grantedByWeek: Readonly<Record<string, number>>;
}

/**
 * Sorts a stretch of play into seconds counted against the allowance, played in grace, played over
 * the allowance, and free, one result for each week it touches. Time in a window counts until the
 * allowance runs out. What follows is grace when it falls in the last grace period of the window,
 * and over otherwise. `to - from` should be whole seconds, so no second is lost between ticks.
 */
export function advanceLedger(input: AdvanceInput): WeekDelta[] {
  const out: WeekDelta[] = [];
  let cursor = input.from;
  while (cursor < input.to) {
    const week = weekStart(cursor);
    const end = Math.min(input.to, weekBounds(week).to);
    out.push({ week, ...advanceWithinWeek(cursor, end, week, input) });
    cursor = end;
  }
  return out;
}

function advanceWithinWeek(
  from: number,
  to: number,
  week: string,
  input: AdvanceInput,
): LedgerDelta {
  const total = Math.round((to - from) / SECOND);
  if (input.unlimited) {
    return { countedSeconds: 0, graceSeconds: 0, overSeconds: 0, freeSeconds: total };
  }

  const { config } = input;
  const allowance = config.allowanceSeconds + (input.grantedByWeek[week] ?? 0);
  let remaining = Math.max(0, allowance - (input.usedByWeek[week] ?? 0)) * SECOND;
  let counted = 0;
  let grace = 0;
  let over = 0;
  for (const segment of segments(from, to, config.schedule, input.closures)) {
    if (!segment.counted) continue;
    const length = segment.to - segment.from;
    const take = Math.min(remaining, length);
    counted += take;
    remaining -= take;
    if (length - take <= 0) continue;
    const restFrom = segment.from + take;
    const graceFrom =
      config.graceSeconds > 0
        ? Math.max(restFrom, segment.windowEnd! - config.graceSeconds * SECOND)
        : segment.to;
    const graceAt = Math.min(graceFrom, segment.to);
    over += graceAt - restFrom;
    grace += segment.to - graceAt;
  }
  // Each part is rounded to whole seconds and the rest is free, so the total stays exact.
  let countedSeconds = Math.round(counted / SECOND);
  let graceSeconds = Math.round(grace / SECOND);
  let overSeconds = Math.round(over / SECOND);
  let excess = countedSeconds + graceSeconds + overSeconds - total;
  if (excess > 0) {
    const cutOver = Math.min(excess, overSeconds);
    overSeconds -= cutOver;
    excess -= cutOver;
    const cutGrace = Math.min(excess, graceSeconds);
    graceSeconds -= cutGrace;
    excess -= cutGrace;
    countedSeconds -= excess;
  }
  return {
    countedSeconds,
    graceSeconds,
    overSeconds,
    freeSeconds: total - countedSeconds - graceSeconds - overSeconds,
  };
}

/**
 * How much of a stretch of play, by week, was inside a window and how much outside it, for taking
 * back a session's tail. Nothing is inside a window for an unlimited player.
 */
export function tailByWeek(
  from: number,
  to: number,
  config: PlaytimeConfig,
  closures: readonly ClosureRange[],
  unlimited: boolean,
): { week: string; windowSeconds: number; freeSeconds: number }[] {
  const out: { week: string; windowSeconds: number; freeSeconds: number }[] = [];
  let cursor = from;
  while (cursor < to) {
    const week = weekStart(cursor);
    const end = Math.min(to, weekBounds(week).to);
    const total = Math.round((end - cursor) / SECOND);
    const windowSeconds = unlimited
      ? 0
      : splitInterval(cursor, end, config.schedule, closures).countedSeconds;
    out.push({ week, windowSeconds, freeSeconds: total - windowSeconds });
    cursor = end;
  }
  return out;
}

/**
 * Removes a tail from a ledger row. Within a window time was counted first, then played over or in
 * grace, so the last of it comes off first: grace, then over, then counted.
 */
export function takeBack(
  row: LedgerDelta,
  tail: { windowSeconds: number; freeSeconds: number },
): LedgerDelta {
  let window = tail.windowSeconds;
  const graceSeconds = row.graceSeconds - Math.min(row.graceSeconds, window);
  window -= row.graceSeconds - graceSeconds;
  const overSeconds = row.overSeconds - Math.min(row.overSeconds, window);
  window -= row.overSeconds - overSeconds;
  const countedSeconds = row.countedSeconds - Math.min(row.countedSeconds, window);
  return {
    countedSeconds,
    graceSeconds,
    overSeconds,
    freeSeconds: Math.max(0, row.freeSeconds - tail.freeSeconds),
  };
}

/** The restricted hours as lines for the player page: days in a row with the same ranges merge. */
export function hoursLines(
  schedule: PlaytimeSchedule,
): { days: Weekday[]; ranges: [string, string][] }[] {
  const lines: { days: Weekday[]; ranges: [string, string][] }[] = [];
  for (const day of WEEKDAYS) {
    const ranges = schedule[day];
    if (ranges.length === 0) continue;
    const previous = lines.at(-1);
    const last = previous?.days.at(-1);
    if (
      previous &&
      last &&
      WEEKDAYS.indexOf(last) === WEEKDAYS.indexOf(day) - 1 &&
      JSON.stringify(previous.ranges) === JSON.stringify(ranges)
    ) {
      previous.days.push(day);
    } else {
      lines.push({ days: [day], ranges: ranges.map(([a, b]) => [a, b]) });
    }
  }
  return lines;
}

/** What the timer owes a player online right now. Each notice kind is sent once per session and week. */
export interface DueNotices {
  /** A warning, with every notice kind it covers: the ones crossed since the last one sent. */
  warning: {
    kind: 'allowance' | 'windowStart';
    remainingSeconds: number;
    notices: string[];
  } | null;
  /** The allowance ran out inside the grace period: tell the player they can stay. */
  grace: boolean;
  /** The allowance is used up inside a window, outside the grace period: kick. */
  kick: boolean;
}

/**
 * What to tell or do for a player, given where they stand. Pure: the caller keeps each kind to
 * once by writing the notices it returns. A player joining with 3 minutes left has crossed the 30,
 * 10 and 5 minute marks, so one warning covers all three and says what is really left.
 *
 * - Counting: a warning at each "minutes left" mark, but only if the allowance really runs out
 *   before the window ends. Otherwise the player will never reach zero today.
 * - Free with nothing left, and a window about to open: a warning at each "start" mark, then the
 *   kick comes from the window opening (`blocked`).
 */
export function dueNotices(
  evaluation: Evaluation,
  config: PlaytimeConfig,
  now: number,
): DueNotices {
  const none: DueNotices = { warning: null, grace: false, kick: false };
  switch (evaluation.state) {
    case 'blocked':
      return { ...none, kick: true };
    case 'grace':
      return { ...none, grace: true };
    case 'counting': {
      const { remainingSeconds, windowEndsAt } = evaluation;
      if (remainingSeconds <= 0 || windowEndsAt === null) return none;
      if (now + remainingSeconds * SECOND > windowEndsAt) return none;
      const crossed = config.warningsMinutes.filter((minutes) => remainingSeconds <= minutes * 60);
      if (crossed.length === 0) return none;
      return {
        ...none,
        warning: {
          kind: 'allowance',
          remainingSeconds,
          notices: crossed.map((minutes) => `w${String(minutes)}`),
        },
      };
    }
    case 'free': {
      const { nextWindowStartsAt } = evaluation;
      if (evaluation.remainingSeconds > 0 || nextWindowStartsAt === null) return none;
      const secondsToStart = Math.max(0, Math.ceil((nextWindowStartsAt - now) / SECOND));
      const crossed = config.startWarningsMinutes.filter(
        (minutes) => secondsToStart <= minutes * 60,
      );
      if (crossed.length === 0) return none;
      return {
        ...none,
        warning: {
          kind: 'windowStart',
          remainingSeconds: secondsToStart,
          notices: crossed.map((minutes) => `s${String(minutes)}`),
        },
      };
    }
    default:
      return none;
  }
}
