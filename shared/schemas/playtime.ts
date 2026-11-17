import { z } from 'zod';

import { WEEKDAYS } from '../utils/paris-time.ts';
import { SCHOOLS } from '../utils/schools.ts';

// Playtime limit contracts, shared by the routes, the services and the pages. See docs/playtime.md.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const PLAYTIME_MODES = ['off', 'observe', 'enforce'] as const;
export type PlaytimeMode = (typeof PLAYTIME_MODES)[number];
export const playtimeMode = z.enum(PLAYTIME_MODES);

/** Who an event frees from the playtime limit during its days: players with a place, or everyone. */
export const playtimeEventScope = z.enum(['registered', 'everyone']);
export type PlaytimeEventScope = z.infer<typeof playtimeEventScope>;

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

// What admins send. Routes parse these, and the services take the parsed values.

const allowanceSeconds = z.number().int().min(0).max(PLAYTIME_MAX_ALLOWANCE_SECONDS);
const graceSeconds = z.number().int().min(0).max(PLAYTIME_MAX_GRACE_SECONDS);
const startWarnings = playtimeWarningMinutes;
const reason = z.string().trim().min(1).max(300);
const parisDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const playtimeSettingsPatch = z.object({
  mode: playtimeMode.optional(),
  allowanceSeconds: allowanceSeconds.optional(),
  schedule: playtimeSchedule.optional(),
  graceSeconds: graceSeconds.optional(),
  warningsMinutes: playtimeWarningMinutes.optional(),
  startWarningsMinutes: startWarnings.optional(),
});
export type PlaytimeSettingsPatch = z.infer<typeof playtimeSettingsPatch>;

/** A school's overrides: a null field inherits the global value. */
export const playtimeSchoolBody = z.object({
  allowanceSeconds: allowanceSeconds.nullable(),
  schedule: playtimeSchedule.nullable(),
  graceSeconds: graceSeconds.nullable(),
  warningsMinutes: playtimeWarningMinutes.nullable(),
  startWarningsMinutes: startWarnings.nullable(),
});
export type PlaytimeSchoolBody = z.infer<typeof playtimeSchoolBody>;

/** A player's own overrides: the allowance, the grace length and the warning times only. */
export const playtimePlayerOverridesBody = z.object({
  allowanceSeconds: allowanceSeconds.nullable(),
  graceSeconds: graceSeconds.nullable(),
  warningsMinutes: playtimeWarningMinutes.nullable(),
});
export type PlaytimePlayerOverridesBody = z.infer<typeof playtimePlayerOverridesBody>;

export const playtimeClosureBody = z
  .object({
    label: z.string().trim().min(1).max(120),
    startsOn: parisDay,
    endsOn: parisDay,
    /** Tenant IDs of the schools it applies to. Null is every school. */
    tenantIds: z.array(z.string().min(1)).min(1).nullable(),
  })
  .refine((closure) => closure.endsOn >= closure.startsOn, {
    message: 'The end date is before the start date.',
    path: ['endsOn'],
  });
export type PlaytimeClosureBody = z.infer<typeof playtimeClosureBody>;

export const playtimeExemptionBody = z
  .object({
    /** An LNB account, or one Minecraft account, not both. */
    userId: z.string().min(1).optional(),
    minecraftUuid: z.uuid().optional(),
    reason,
    until: z.iso.datetime().nullable().optional(),
  })
  .refine((body) => (body.userId === undefined) !== (body.minecraftUuid === undefined), {
    message: 'Give an LNB account or a Minecraft account, not both.',
  });
export type PlaytimeExemptionBody = z.infer<typeof playtimeExemptionBody>;

export const playtimeGrantBody = z.object({
  seconds: z.number().int().min(1).max(PLAYTIME_MAX_GRANT_SECONDS),
  reason,
  /** The Monday of the week it is for. This week when left out. */
  weekStart: parisDay.optional(),
});
export type PlaytimeGrantBody = z.infer<typeof playtimeGrantBody>;

// What the admin screens read.

/** The rules, with a school's overrides on top. A null field inherits the global value. */
const schoolOverrides = z.object({
  allowanceSeconds: z.number().int().nonnegative().nullable(),
  schedule: playtimeSchedule.nullable(),
  graceSeconds: z.number().int().nonnegative().nullable(),
  warningsMinutes: playtimeWarningMinutes.nullable(),
  startWarningsMinutes: playtimeWarningMinutes.nullable(),
});

export const playtimeSettingsResponse = z.object({
  mode: playtimeMode,
  /** The `playtime` feature flag. When it is off, nothing runs whatever the mode. */
  flagEnabled: z.boolean(),
  allowanceSeconds: z.number().int().nonnegative(),
  schedule: playtimeSchedule,
  graceSeconds: z.number().int().nonnegative(),
  warningsMinutes: playtimeWarningMinutes,
  startWarningsMinutes: playtimeWarningMinutes,
  /** Every allowed school, with its overrides (all null when it follows the global rules). */
  schools: z.array(
    z.object({ tenantId: z.string(), name: z.string(), overrides: schoolOverrides }),
  ),
});
export type PlaytimeSettingsResponse = z.infer<typeof playtimeSettingsResponse>;

export const playtimeClosureRow = z.object({
  id: z.number().int(),
  label: z.string(),
  startsOn: z.string().meta({ format: 'date' }),
  endsOn: z.string().meta({ format: 'date' }),
  tenantIds: z.array(z.string()).nullable(),
  /** Set for a closure kept in step with an event: it can't be edited here. */
  event: z
    .object({ id: z.uuid(), name: z.string(), scope: z.enum(['registered', 'everyone']) })
    .nullable(),
  createdByName: z.string().nullable(),
  createdAt: isoDate,
});
export type PlaytimeClosureRow = z.infer<typeof playtimeClosureRow>;
export const playtimeClosureList = z.array(playtimeClosureRow);

export const playtimeClosureParams = z.object({ id: z.coerce.number().int().positive() });
export const playtimeSchoolParams = z.object({
  tenantId: z.string().refine((id) => id.toLowerCase() in SCHOOLS, 'Unknown school.'),
});

// The Live tab and the player panel.

export const playtimeLiveRow = z.object({
  userId: z.string(),
  name: z.string(),
  school: z.string().nullable(),
  uuid: z.uuid(),
  username: z.string(),
  state: playtimeState,
  reason: z.enum(PLAYTIME_UNLIMITED_REASONS).nullable(),
  usedSeconds: z.number().int().nonnegative(),
  allowanceSeconds: z.number().int().nonnegative(),
  remainingSeconds: z.number().int().nonnegative(),
  graceEndsAt: isoDate.nullable(),
  startedAt: isoDate,
});

export const playtimeLive = z.object({
  /** What the limit does right now: `off` while the flag is off. */
  mode: playtimeMode,
  /** The default schedule's current window end and next start, ignoring closures and schools. */
  windowEndsAt: isoDate.nullable(),
  nextWindowStartsAt: isoDate.nullable(),
  /** Minecraft accounts online now, one row each. */
  online: z.array(playtimeLiveRow),
  week: z.object({
    weekStart: z.string().meta({ format: 'date' }),
    countedSeconds: z.number().int().nonnegative(),
    /** Players with any time on the server this week. */
    players: z.number().int().nonnegative(),
    /** Players who used up their allowance, with grants. */
    reachedLimit: z.number().int().nonnegative(),
    /** Players who played on in a grace period. */
    usedGrace: z.number().int().nonnegative(),
  }),
});
export type PlaytimeLive = z.infer<typeof playtimeLive>;

export const playtimeUserParams = z.object({ userId: z.string().min(1) });
export const playtimeUserItemParams = playtimeUserParams.extend({
  id: z.coerce.number().int().positive(),
});

/** An exemption the player panel lists: the whole LNB account, or one Minecraft account. */
export const playtimeExemptionRow = z.object({
  id: z.number().int(),
  scope: z.enum(['user', 'minecraft']),
  username: z.string().nullable(),
  reason: z.string(),
  until: isoDate.nullable(),
  setByName: z.string().nullable(),
  createdAt: isoDate,
});

export const playtimeGrantRow = z.object({
  id: z.number().int(),
  seconds: z.number().int(),
  reason: z.string(),
  grantedByName: z.string().nullable(),
  createdAt: isoDate,
});

const overridable = z.object({
  allowanceSeconds: z.number().int().nonnegative(),
  graceSeconds: z.number().int().nonnegative(),
  warningsMinutes: playtimeWarningMinutes,
});

/** One player's playtime as admins see it: the player's own view plus what can be changed. */
export const playtimeAdminPlayer = playtimeMe.extend({
  school: z.string().nullable(),
  /** The player's own overrides: null follows the school, then the defaults. */
  overrides: playtimePlayerOverridesBody,
  /** What each setting is without the player's overrides. */
  inherited: overridable,
  exemptions: z.array(playtimeExemptionRow),
  /** This week's grants that are still in force. */
  grants: z.array(playtimeGrantRow),
  /** The last 8 weeks, oldest first, with the current one last. */
  weeks: z.array(
    z.object({
      weekStart: z.string().meta({ format: 'date' }),
      countedSeconds: z.number().int().nonnegative(),
      allowanceSeconds: z.number().int().nonnegative(),
      /** A closure covers the whole week. */
      closed: z.boolean(),
    }),
  ),
});
export type PlaytimeAdminPlayer = z.infer<typeof playtimeAdminPlayer>;

/** An exemption from the player panel: the whole account, or one of their Minecraft accounts. */
export const playtimePlayerExemptionBody = z.object({
  minecraftUuid: z.uuid().optional(),
  reason,
  until: z.iso.datetime().nullable().optional(),
});
export type PlaytimePlayerExemptionBody = z.infer<typeof playtimePlayerExemptionBody>;
