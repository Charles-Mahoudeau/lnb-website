import { z } from 'zod';

import { WEEKDAYS } from '../utils/paris-time.ts';

// Playtime limit contracts, shared by the routes, the services and the pages. See docs/playtime.md.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const PLAYTIME_MODES = ['off', 'observe', 'enforce'] as const;
export type PlaytimeMode = (typeof PLAYTIME_MODES)[number];
export const playtimeMode = z.enum(PLAYTIME_MODES);

/** `unlimited` is an exempt player, a closure or the mode `off`. */
export const PLAYTIME_STATES = ['unlimited', 'free', 'counting', 'grace', 'blocked'] as const;
export type PlaytimeState = (typeof PLAYTIME_STATES)[number];
export const playtimeState = z.enum(PLAYTIME_STATES);

export const PLAYTIME_UNLIMITED_REASONS = ['off', 'exempt', 'closed'] as const;
export type PlaytimeUnlimitedReason = (typeof PLAYTIME_UNLIMITED_REASONS)[number];

/** The most one grant can add, and the most a week's allowance can be set to. */
export const PLAYTIME_MAX_GRANT_SECONDS = 18_000;
export const PLAYTIME_MAX_ALLOWANCE_SECONDS = 7 * 24 * 3600;
export const PLAYTIME_MAX_GRACE_SECONDS = 24 * 3600;

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:MM, up to 24:00.');

/** "09:00" as minutes after midnight. "24:00" is 1440. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** One range of restricted hours in a day: start and end as HH:MM, in Paris time. */
const range = z.tuple([time, time]);

const day = z.array(range).max(8);

export type PlaytimeSchedule = Record<(typeof WEEKDAYS)[number], [string, string][]>;

/** The first weekday whose ranges end before they start, overlap or are out of order. */
export function scheduleProblem(schedule: PlaytimeSchedule): (typeof WEEKDAYS)[number] | null {
  for (const name of WEEKDAYS) {
    let previousEnd = -1;
    for (const [start, end] of schedule[name]) {
      const from = timeToMinutes(start);
      if (timeToMinutes(end) <= from || from < previousEnd) return name;
      previousEnd = timeToMinutes(end);
    }
  }
  return null;
}

/**
 * The restricted hours: for each weekday, sorted ranges that don't overlap. A free day is an empty
 * array, and every weekday is present.
 */
export const playtimeSchedule = z
  .object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day })
  .refine((schedule) => scheduleProblem(schedule) === null, {
    message: 'Ranges must end after they start, be sorted, and not overlap.',
  });

/** Minutes left at which a warning is sent. */
export const playtimeWarningMinutes = z.array(z.number().int().min(1).max(600)).max(10);

export const DEFAULT_PLAYTIME_SCHEDULE: PlaytimeSchedule = {
  mon: [['09:00', '17:00']],
  tue: [['09:00', '17:00']],
  wed: [['09:00', '17:00']],
  thu: [['09:00', '17:00']],
  fri: [['09:00', '17:00']],
  sat: [],
  sun: [],
};

/** The restricted hours of one day, for the player page. */
export const playtimeDayLine = z.object({
  days: z.array(z.enum(WEEKDAYS)),
  ranges: z.array(range),
});
export type PlaytimeDayLine = z.infer<typeof playtimeDayLine>;

export const playtimeAccountView = z.object({
  uuid: z.uuid(),
  username: z.string(),
  exempt: z.boolean(),
  playedSeconds: z.number().int().nonnegative(),
});

/** What the Minecraft account page shows about the week. Times are ISO dates, or null when none. */
export const playtimeMe = z.object({
  mode: playtimeMode,
  state: playtimeState,
  reason: z.enum(PLAYTIME_UNLIMITED_REASONS).nullable(),
  weekStart: z.string().meta({ format: 'date', description: 'The Monday of this week, in Paris.' }),
  /** Everything played this week, on all accounts, whether or not it counted. */
  playedSeconds: z.number().int().nonnegative(),
  /** Everything ever played on the linked accounts, whether or not it counted. */
  totalPlayedSeconds: z.number().int().nonnegative(),
  allowanceSeconds: z.number().int().nonnegative(),
  usedSeconds: z.number().int().nonnegative(),
  remainingSeconds: z.number().int().nonnegative(),
  percentUsed: z.number().int().min(0).max(100),
  windowEndsAt: isoDate.nullable(),
  nextWindowStartsAt: isoDate.nullable(),
  graceEndsAt: isoDate.nullable(),
  resumesAt: isoDate.nullable(),
  resetsAt: isoDate,
  nextChangeAt: isoDate.nullable(),
  hours: z.array(playtimeDayLine),
  accounts: z.array(playtimeAccountView),
});
export type PlaytimeMe = z.infer<typeof playtimeMe>;
