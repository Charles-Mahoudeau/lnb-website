import { z } from 'zod';

// Anticheat contracts, shared by the routes, the services and the pages. See docs/anticheat.md.
// Responses are schemas too, so the API reference is built from the same definitions as the types.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const ANTICHEAT_FILE_KINDS = ['mod', 'resourcepack', 'shader', 'client'] as const;
export type AnticheatFileKind = (typeof ANTICHEAT_FILE_KINDS)[number];
export const anticheatFileKind = z.enum(ANTICHEAT_FILE_KINDS);

/** Kinds that are scored. Projects never hold `client` entries. */
export const ANTICHEAT_PROJECT_KINDS = ['mod', 'resourcepack', 'shader'] as const;
export type AnticheatProjectKind = (typeof ANTICHEAT_PROJECT_KINDS)[number];

export const ANTICHEAT_MODES = ['off', 'observe', 'enforce'] as const;
export type AnticheatMode = (typeof ANTICHEAT_MODES)[number];
export const anticheatMode = z.enum(ANTICHEAT_MODES);

/** From least to most severe: the verdict is the most severe over a session's files and player. */
export const ANTICHEAT_ACTIONS = [
  'allow',
  'flag',
  'warn',
  'hold',
  'refuse',
  'kick',
  'ban',
] as const;
export type AnticheatAction = (typeof ANTICHEAT_ACTIONS)[number];
export const anticheatAction = z.enum(ANTICHEAT_ACTIONS);

export const ANTICHEAT_FILE_BANDS = ['approved', 'accepted', 'middle', 'low', 'banned'] as const;
export type AnticheatFileBand = (typeof ANTICHEAT_FILE_BANDS)[number];
export const anticheatFileBand = z.enum(ANTICHEAT_FILE_BANDS);

export const ANTICHEAT_PLAYER_BANDS = ['trusted', 'normal', 'held', 'zero'] as const;
export type AnticheatPlayerBand = (typeof ANTICHEAT_PLAYER_BANDS)[number];
export const anticheatPlayerBand = z.enum(ANTICHEAT_PLAYER_BANDS);

/** The admin label of a file. Derived from its score, never stored. */
export const ANTICHEAT_STATUSES = [
  'approved',
  'accepted',
  'review',
  'refused',
  'banned',
  'pending',
] as const;
export type AnticheatStatus = (typeof ANTICHEAT_STATUSES)[number];
export const anticheatStatus = z.enum(ANTICHEAT_STATUSES);

export const ANTICHEAT_DECISIONS = ['approved', 'banned'] as const;
export type AnticheatDecision = (typeof ANTICHEAT_DECISIONS)[number];
export const anticheatDecision = z.enum(ANTICHEAT_DECISIONS);

export const ANTICHEAT_LOOKUP_STATES = [
  'pending',
  'found',
  'notFound',
  'timedOut',
  'skipped',
] as const;
export type AnticheatLookupState = (typeof ANTICHEAT_LOOKUP_STATES)[number];

/** Server events that move a player's trust score. */
export const ANTICHEAT_SERVER_EVENT_KINDS = [
  'challengeWrong',
  'challengeMissed',
  'modSetChanged',
  'channelMismatch',
] as const;
export type AnticheatServerEventKind = (typeof ANTICHEAT_SERVER_EVENT_KINDS)[number];

/** Every kind of player event on the timeline: the server's, the site's and the admins'. */
export const ANTICHEAT_PLAYER_EVENT_KINDS = [
  ...ANTICHEAT_SERVER_EVENT_KINDS,
  'modlistIncomplete',
  'playtime',
  'adminAdjust',
  'bulkPenalty',
  'holdSet',
  'holdCleared',
] as const;
export type AnticheatPlayerEventKind = (typeof ANTICHEAT_PLAYER_EVENT_KINDS)[number];

export const ANTICHEAT_ALERT_KINDS = [
  'fileRefused',
  'bannedFileSeen',
  'playerHeld',
  'factsDisputed',
  'banAffectsPlayers',
] as const;
export type AnticheatAlertKind = (typeof ANTICHEAT_ALERT_KINDS)[number];

export const ANTICHEAT_VERDICT_REASON_CODES = [
  'fileBanned',
  'fileRefused',
  'fileHeld',
  'packWarning',
  'fileFlagged',
  'playerHeld',
  'playerZero',
  'manualHold',
] as const;
export type AnticheatVerdictReasonCode = (typeof ANTICHEAT_VERDICT_REASON_CODES)[number];

/** Why an anticheat request was refused, in `data.problem`. */
export const ANTICHEAT_PROBLEMS = [
  'unknownSession',
  'noReport',
  'exists',
  'notFound',
  'invalidCursor',
] as const;
export type AnticheatProblem = (typeof ANTICHEAT_PROBLEMS)[number];

// Rules

const points = z.int().min(-200).max(200);
const positiveInt = z.int().min(0).max(1_000_000_000);

const policyRow = z.object({
  approved: anticheatAction,
  accepted: anticheatAction,
  middle: anticheatAction,
  low: anticheatAction,
  banned: anticheatAction,
});
export type AnticheatPolicyRow = z.infer<typeof policyRow>;

/**
 * The points, thresholds and action table. The site owns them; every save creates a new version
 * (anticheat_rules). Shared with the settings form.
 */
export const anticheatRules = z.object({
  criteria: z.object({
    moderationApproved: points,
    downloadsHigh: points,
    downloadsHighMin: positiveInt,
    downloadsMid: points,
    downloadsMidMin: positiveInt,
    projectAge: points,
    projectAgeDays: positiveInt,
    versionAge: points,
    versionAgeDays: positiveInt,
    bothPlatforms: points,
    identityMatch: points,
    serverSide: points,
    texturesClean: points,
    noCoreShaders: points,
    unknown: points,
    suspectedModified: points,
    texturesAltered: points,
    coreShaders: points,
  }),
  bands: z.object({ accepted: z.int().min(2).max(99), middle: z.int().min(2).max(99) }),
  policy: z.object({ mod: policyRow, resourcepack: policyRow, shader: policyRow }),
  player: z.object({
    start: z.int().min(0).max(100),
    trusted: z.int().min(1).max(100),
    held: z.int().min(1).max(100),
    challengeWrong: points,
    challengeMissed: points,
    challengeMissedSessionCap: points,
    modSetChanged: points,
    channelMismatch: points,
    modlistIncomplete: points,
    playPerHour: z.int().min(0).max(100),
    playDailyCap: z.int().min(0).max(100),
    adjustFactor: z.number().min(0).max(1),
  }),
  lookup: z.object({
    pendingTimeoutSeconds: z.int().min(1).max(3600),
    notFoundRetryHours: z.int().min(1).max(720),
    rescoreDays: z.int().min(1).max(365),
  }),
});
export type AnticheatRules = z.infer<typeof anticheatRules>;

// Scores

export const ANTICHEAT_CRITERION_KEYS = [
  'moderationApproved',
  'downloads',
  'projectAge',
  'versionAge',
  'bothPlatforms',
  'identityMatch',
  'serverSide',
  'texturesClean',
  'noCoreShaders',
] as const;
export type AnticheatCriterionKey = (typeof ANTICHEAT_CRITERION_KEYS)[number];

export const ANTICHEAT_PENALTY_KEYS = [
  'unknown',
  'suspectedModified',
  'texturesAltered',
  'coreShaders',
] as const;
export type AnticheatPenaltyKey = (typeof ANTICHEAT_PENALTY_KEYS)[number];

export const ANTICHEAT_SCORE_PATHS = [
  'client',
  'banned',
  'approved',
  'pending',
  'computed',
] as const;
export type AnticheatScorePath = (typeof ANTICHEAT_SCORE_PATHS)[number];

/** Why an override applied: which of the three matched, or where the approval came from. */
export const anticheatOverride = z.enum(['hash', 'project', 'modId', 'modpack']);
export type AnticheatOverride = z.infer<typeof anticheatOverride>;

/** What is stored on a file, and what the admin shows. Never recomputed for display. */
export const anticheatBreakdown = z.object({
  path: z.enum(ANTICHEAT_SCORE_PATHS),
  rulesVersion: z.int(),
  overrides: z.array(anticheatOverride),
  criteria: z.array(
    z.object({
      key: z.enum(ANTICHEAT_CRITERION_KEYS),
      state: z.enum(['earned', 'notEarned', 'unavailable']),
      points: z.number(),
    }),
  ),
  fullMax: z.number(),
  availableMax: z.number(),
  earned: z.number(),
  scaled: z.number(),
  penalties: z.array(z.object({ key: z.enum(ANTICHEAT_PENALTY_KEYS), points: z.number() })),
  raw: z.number(),
  score: z.number().nullable(),
});
export type AnticheatBreakdown = z.infer<typeof anticheatBreakdown>;

// Server contract

/** A report holds at most this many files. */
export const ANTICHEAT_MAX_REPORT_FILES = 1000;

const text128 = z.string().trim().min(1).max(128);

/** What the client reported about a resource pack. */
export const anticheatFacts = z.object({
  coreShaders: z.boolean(),
  alteredTextures: z.boolean(),
});
export type AnticheatFacts = z.infer<typeof anticheatFacts>;

/** A SHA-512 as 128 lowercase hex characters. */
export const anticheatSha512 = z
  .string()
  .regex(/^[\da-f]{128}$/i)
  .transform((hash) => hash.toLowerCase());

export const anticheatReportFileInput = z.object({
  kind: anticheatFileKind,
  sha512: anticheatSha512,
  fingerprint: z
    .int()
    .min(0)
    .max(0xffffffff)
    .optional()
    .describe('The CurseForge fingerprint, an unsigned 32-bit integer.'),
  filename: z.string().min(1).max(255),
  modId: text128.optional(),
  name: text128.optional(),
  version: text128.optional(),
  loader: text128.optional(),
  facts: anticheatFacts.optional().describe('Only read for resource packs.'),
});
export type AnticheatReportFileInput = z.infer<typeof anticheatReportFileInput>;

/** Body of POST /api/warden/server/anticheat/reports. */
export const anticheatReportBody = z.object({
  sessionId: z.uuid(),
  files: z
    .array(anticheatReportFileInput)
    .min(1)
    .max(ANTICHEAT_MAX_REPORT_FILES)
    .refine((files) => new Set(files.map((file) => file.sha512)).size === files.length, {
      message: 'duplicate sha512',
    }),
});
export type AnticheatReportBody = z.infer<typeof anticheatReportBody>;

export const anticheatVerdictReason = z.object({
  code: z.enum(ANTICHEAT_VERDICT_REASON_CODES),
  sha512: z.string().optional(),
  name: z.string().optional(),
  action: anticheatAction,
});
export type AnticheatVerdictReason = z.infer<typeof anticheatVerdictReason>;

export const anticheatVerdict = z.object({
  action: anticheatAction,
  wouldBe: anticheatAction
    .optional()
    .describe('In observe mode, the action that enforce mode would have taken.'),
  reasons: z.array(anticheatVerdictReason),
});
export type AnticheatVerdict = z.infer<typeof anticheatVerdict>;

export const anticheatPlayerSummary = z.object({
  score: z.int(),
  band: anticheatPlayerBand,
});
export type AnticheatPlayerSummary = z.infer<typeof anticheatPlayerSummary>;

export const anticheatReportFileResult = z.object({
  sha512: z.string(),
  kind: anticheatFileKind,
  name: z.string(),
  state: z.enum(['scored', 'pending', 'ignored']),
  score: z.int().nullable(),
  effectiveScore: z.int().nullable(),
  band: anticheatFileBand.nullable(),
  status: anticheatStatus.nullable(),
  action: anticheatAction,
});
export type AnticheatReportFileResult = z.infer<typeof anticheatReportFileResult>;

/** Answer to a report, and body of GET .../sessions/:sessionId. */
export const anticheatReportResponse = z.object({
  reportId: z.uuid().nullable().describe('Null when the mode is off: nothing is stored.'),
  mode: anticheatMode,
  verdict: anticheatVerdict,
  player: anticheatPlayerSummary.optional().describe('Absent when the mode is off.'),
  files: z.array(anticheatReportFileResult),
  pending: z.int().describe('Files still being looked up.'),
  pendingTimeoutSeconds: z.int().optional(),
});
export type AnticheatReportResponse = z.infer<typeof anticheatReportResponse>;

/** Body of POST /api/warden/server/anticheat/events. */
export const anticheatEventsBody = z.object({
  sessionId: z.uuid(),
  events: z
    .array(
      z.object({
        id: z.uuid().describe('Makes the call idempotent: a stored event is skipped.'),
        kind: z.enum(ANTICHEAT_SERVER_EVENT_KINDS),
        data: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(50),
});
export type AnticheatEventsBody = z.infer<typeof anticheatEventsBody>;

export const anticheatEventsResponse = z.object({
  player: anticheatPlayerSummary,
  verdict: anticheatVerdict,
});
export type AnticheatEventsResponse = z.infer<typeof anticheatEventsResponse>;

/** Body of POST /api/warden/server/anticheat/actions: what the server did. */
export const anticheatActionBody = z.object({
  sessionId: z.uuid(),
  reportId: z.uuid().nullable(),
  action: anticheatAction,
  reason: z.string().min(1).max(64).describe('A rule code, such as fileRefused.'),
  sha512: anticheatSha512.nullable(),
});
export type AnticheatActionBody = z.infer<typeof anticheatActionBody>;

// Admin

export const anticheatSettingsResponse = z.object({
  mode: anticheatMode,
  rulesVersion: z.int(),
  rules: anticheatRules,
  updatedAt: isoDate,
});
export type AnticheatSettings = z.infer<typeof anticheatSettingsResponse>;

/** Body of PATCH /api/anticheat/admin/settings. */
export const anticheatSettingsPatch = z
  .object({ mode: anticheatMode, rules: anticheatRules })
  .partial()
  .refine((patch) => patch.mode !== undefined || patch.rules !== undefined, {
    message: 'nothing to change',
  });
export type AnticheatSettingsPatch = z.infer<typeof anticheatSettingsPatch>;
