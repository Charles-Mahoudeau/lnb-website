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
  'unavailable',
  'notLinked',
  'sameProject',
  'notScored',
  'rateLimited',
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
  nestedIn: anticheatSha512
    .optional()
    .describe(
      'Set on a jar found inside another file of the report (jar-in-jar): the SHA-512 of that top-level file. A nested entry is not looked up, scored or linked to the player; the top-level file stands for it.',
    ),
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
    })
    .refine(
      (files) => {
        const topLevel = new Set(files.filter((file) => !file.nestedIn).map((file) => file.sha512));
        return files.every((file) => !file.nestedIn || topLevel.has(file.nestedIn));
      },
      { message: 'nestedIn must be the sha512 of a file of the report that is not nested itself' },
    ),
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

export const anticheatSessionParams = z.object({ sessionId: z.uuid() });

/** A player in a list: the account and its latest Minecraft username. */
export const anticheatPlayerRef = z.object({
  userId: z.string(),
  name: z.string(),
  username: z.string().nullable(),
});
export type AnticheatPlayerRef = z.infer<typeof anticheatPlayerRef>;

/** A page of a list. Pass `nextCursor` as `?cursor=` for the next one. */
function anticheatPage<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().describe('Null on the last page.'),
  });
}

const cursor = z.string().max(200).optional().describe('`nextCursor` of the previous page.');

export const anticheatFileParams = z.object({ sha512: anticheatSha512 });
export const anticheatProjectParams = z.object({ id: z.uuid() });

export const anticheatFilesQuery = z.object({
  kind: z.enum(ANTICHEAT_PROJECT_KINDS).optional(),
  status: anticheatStatus.optional(),
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('A hash prefix, a filename, a declared mod ID or a project name.'),
  userId: z.string().min(1).optional().describe('Only files this player used.'),
  sort: z.enum(['recent', 'queue']).default('recent'),
  cursor,
});
export type AnticheatFilesQuery = z.infer<typeof anticheatFilesQuery>;

/** A project (with its file count) or a file without a project. */
export const anticheatFileRow = z.object({
  projectId: z.uuid().nullable(),
  sha512: z.string().nullable().describe('Set on a file without a project.'),
  kind: z.enum(ANTICHEAT_PROJECT_KINDS),
  name: z.string(),
  fileCount: z.int(),
  platforms: z.array(z.enum(['modrinth', 'curseforge'])),
  status: anticheatStatus.nullable(),
  score: z.int().nullable().describe('The lowest score among the files.'),
  decision: anticheatDecision.nullable(),
  usingNow: z.int().describe('Open sessions whose latest report has one of the files.'),
  everUsed: z.int().describe('Players who ever used one of the files.'),
  waiting: z.int().describe('Open sessions waiting for a score of one of the files.'),
  firstSeenAt: isoDate,
  lastScoredAt: isoDate.nullable(),
});
export type AnticheatFileRow = z.infer<typeof anticheatFileRow>;
export const anticheatFilePage = anticheatPage(anticheatFileRow);

export const anticheatHistoryEntry = z.object({
  id: z.int(),
  kind: z.enum(['score', 'approve', 'ban', 'clear', 'reviewed', 'note', 'link', 'unlink']),
  at: isoDate,
  actor: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type AnticheatHistoryEntry = z.infer<typeof anticheatHistoryEntry>;

export const anticheatFilePlayerRow = z.object({
  player: anticheatPlayerRef,
  sha512: z.string(),
  firstSeenAt: isoDate,
  lastSeenAt: isoDate,
  sessionCount: z.int(),
  version: z.string().nullable(),
  afterBan: z.boolean().describe('Used the file after it was banned.'),
});
export type AnticheatFilePlayerRow = z.infer<typeof anticheatFilePlayerRow>;
export const anticheatFilePlayerPage = anticheatPage(anticheatFilePlayerRow);

export const anticheatFilePlayersQuery = z.object({
  project: z.enum(['1']).optional().describe('`1`: across every file of the file’s project.'),
  cursor,
});

const decisionInfo = z.object({
  decision: anticheatDecision.nullable(),
  decidedAt: isoDate.nullable(),
  decidedBy: z.string().nullable(),
  note: z.string().nullable(),
});

export const anticheatFileDetail = z.object({
  sha512: z.string(),
  kind: anticheatFileKind,
  filename: z.string(),
  declared: z.object({
    modId: z.string().optional(),
    name: z.string().optional(),
    version: z.string().optional(),
    loader: z.string().optional(),
  }),
  fingerprint: z.int().nullable(),
  score: z.int().nullable(),
  band: anticheatFileBand.nullable(),
  status: anticheatStatus.nullable(),
  breakdown: anticheatBreakdown.nullable(),
  rulesVersion: z.int().nullable(),
  lookupState: z.enum(ANTICHEAT_LOOKUP_STATES),
  facts: anticheatFacts.nullable(),
  factsDisputed: z.boolean(),
  platformVersion: z.record(z.string(), z.unknown()).nullable(),
  project: z
    .object({ id: z.uuid(), name: z.string(), decision: anticheatDecision.nullable() })
    .nullable(),
  decision: decisionInfo,
  reviewedAt: isoDate.nullable(),
  reviewedBand: anticheatFileBand.nullable(),
  firstSeenAt: isoDate,
  lastSeenAt: isoDate,
  scoredAt: isoDate.nullable(),
  rescoreAt: isoDate.nullable(),
  history: z.array(anticheatHistoryEntry),
  players: anticheatFilePlayerPage,
});
export type AnticheatFileDetail = z.infer<typeof anticheatFileDetail>;

export const anticheatProjectDetail = z.object({
  id: z.uuid(),
  kind: z.enum(ANTICHEAT_PROJECT_KINDS),
  name: z.string(),
  modrinthId: z.string().nullable(),
  curseforgeId: z.string().nullable(),
  declaredModId: z.string().nullable(),
  modIds: z.array(z.string()),
  modrinth: z.record(z.string(), z.unknown()).nullable(),
  curseforge: z.record(z.string(), z.unknown()).nullable(),
  decision: decisionInfo,
  files: z.array(
    z.object({
      sha512: z.string(),
      filename: z.string(),
      version: z.string().nullable(),
      score: z.int().nullable(),
      band: anticheatFileBand.nullable(),
      status: anticheatStatus.nullable(),
    }),
  ),
  history: z.array(anticheatHistoryEntry),
});
export type AnticheatProjectDetail = z.infer<typeof anticheatProjectDetail>;

/** Body of POST .../decision on a file or a project. `null` clears the decision. */
export const anticheatDecisionBody = z.object({
  decision: anticheatDecision.nullable(),
  note: z.string().trim().max(500).optional(),
});
export type AnticheatDecisionBody = z.infer<typeof anticheatDecisionBody>;

export const anticheatDecisionResult = z.object({
  affectedPlayers: z
    .int()
    .describe('Players who used a file of the project. Set when the decision is a ban.'),
});
export type AnticheatDecisionResult = z.infer<typeof anticheatDecisionResult>;

/** Body of POST /api/anticheat/admin/projects. */
export const anticheatProjectCreateBody = z.object({
  source: z.enum(['modrinth', 'curseforge']),
  sourceId: z.string().trim().min(1).max(64),
  kind: z.enum(ANTICHEAT_PROJECT_KINDS),
  decision: anticheatDecision,
});
export type AnticheatProjectCreateBody = z.infer<typeof anticheatProjectCreateBody>;

export const anticheatProjectCreated = z.object({ id: z.uuid() });

/** GET /api/anticheat/admin/projects/search?q=&kind= */
export const anticheatProjectSearchQuery = z.object({
  q: z.string().trim().min(2).max(80),
  kind: z.enum(ANTICHEAT_PROJECT_KINDS),
});

export const anticheatProjectSearchResult = z.object({
  source: z.enum(['modrinth', 'curseforge']),
  sourceId: z.string(),
  name: z.string(),
  summary: z.string(),
  author: z.string(),
  downloads: z.number(),
  pageUrl: z.string(),
  iconUrl: z.string().nullable().describe('Served by this site, from the platform.'),
  registered: z.boolean().describe('The project already has a decision or files here.'),
});
export type AnticheatProjectSearchResult = z.infer<typeof anticheatProjectSearchResult>;

export const anticheatProjectSearchResults = z.object({
  items: z.array(anticheatProjectSearchResult),
});

export const anticheatNoteBody = z.object({ body: z.string().trim().min(1).max(1000) });
export const anticheatLinkBody = z.object({ otherProjectId: z.uuid() });
export const anticheatUnlinkBody = z.object({ platform: z.enum(['modrinth', 'curseforge']) });

export const anticheatRescoreResult = z.object({ files: z.int() });

export const anticheatModIdParams = z.object({
  modId: z.string().trim().toLowerCase().min(1).max(128),
});
export const anticheatModIdBanBody = z.object({
  modId: z.string().trim().toLowerCase().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
});
export const anticheatModIdBanRow = z.object({
  modId: z.string(),
  reason: z.string(),
  createdAt: isoDate,
  createdBy: z.string().nullable(),
});
export type AnticheatModIdBanRow = z.infer<typeof anticheatModIdBanRow>;
export const anticheatModIdBanList = z.array(anticheatModIdBanRow);

// Admin: players

export const anticheatPlayerParams = z.object({ userId: z.string().min(1) });

export const anticheatPlayersQuery = z.object({
  q: z.string().trim().min(1).max(100).optional().describe('A name, an email or a username.'),
  band: anticheatPlayerBand.optional(),
  cursor,
});
export type AnticheatPlayersQuery = z.infer<typeof anticheatPlayersQuery>;

export const anticheatPlayerRow = z.object({
  player: anticheatPlayerRef,
  score: z.int(),
  band: anticheatPlayerBand,
  manualHold: z.boolean(),
  lastSeenAt: isoDate.nullable(),
});
export type AnticheatPlayerRow = z.infer<typeof anticheatPlayerRow>;
export const anticheatPlayerRowPage = anticheatPage(anticheatPlayerRow);

export const anticheatEventsQuery = z.object({ cursor });

export const anticheatTimelineEvent = z.object({
  id: z.int(),
  kind: z.enum(ANTICHEAT_PLAYER_EVENT_KINDS),
  delta: z.int(),
  applied: z.boolean().describe('False in observe mode: the score stayed.'),
  scoreAfter: z.int(),
  actor: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  at: isoDate,
});
export type AnticheatTimelineEvent = z.infer<typeof anticheatTimelineEvent>;
export const anticheatTimelinePage = anticheatPage(anticheatTimelineEvent);

export const anticheatPlayerDetail = z.object({
  player: anticheatPlayerRef,
  score: z.int(),
  band: anticheatPlayerBand,
  adjustment: z
    .int()
    .describe('Points the score adds to the files of a report with a score from 1 to 99.'),
  manualHold: z.boolean(),
  holdReason: z.string().nullable(),
  holdAt: isoDate.nullable(),
  events: anticheatTimelinePage,
  files: z.array(
    z.object({
      sha512: z.string(),
      kind: anticheatFileKind,
      filename: z.string(),
      score: z.int().nullable(),
      effectiveScore: z.int().nullable(),
      band: anticheatFileBand.nullable(),
      status: anticheatStatus.nullable(),
      action: anticheatAction.nullable(),
    }),
  ),
  reportAt: isoDate.nullable().describe('When the latest report was sent.'),
  usage: z.array(
    z.object({
      sha512: z.string(),
      kind: anticheatFileKind,
      filename: z.string(),
      score: z.int().nullable(),
      status: anticheatStatus.nullable(),
      otherUsers: z.int().describe('Other players who used the file.'),
      firstSeenAt: isoDate,
      lastSeenAt: isoDate,
      sessionCount: z.int(),
    }),
  ),
  actions: z.array(
    z.object({
      id: z.int(),
      action: anticheatAction,
      reason: z.string(),
      sha512: z.string().nullable(),
      at: isoDate,
    }),
  ),
});
export type AnticheatPlayerDetail = z.infer<typeof anticheatPlayerDetail>;

/** Body of POST /api/anticheat/admin/players/:userId/score. */
export const anticheatScoreBody = z.object({
  score: z.int().min(0).max(100),
  reason: z.string().trim().min(1).max(500),
});

/** Body of POST /api/anticheat/admin/players/:userId/hold. */
export const anticheatHoldBody = z.object({
  hold: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

export const ANTICHEAT_BULK_MAX_PLAYERS = 200;

/** Body of POST /api/anticheat/admin/files/:sha512/players/bulk. */
export const anticheatBulkBody = z
  .object({
    userIds: z.array(z.string().min(1)).min(1).max(ANTICHEAT_BULK_MAX_PLAYERS),
    action: z.enum(['ban', 'hold', 'penalty']),
    reason: z.string().trim().min(1).max(500),
    durationSeconds: z
      .int()
      .positive()
      .max(10 * 365 * 24 * 3600)
      .nullable()
      .optional()
      .describe('For `ban`: seconds, or leave out for a permanent ban.'),
    points: z.int().min(1).max(50).optional().describe('For `penalty`: the points to take.'),
  })
  .refine((body) => body.action !== 'penalty' || body.points !== undefined, {
    message: 'points are required for a penalty',
    path: ['points'],
  });
export type AnticheatBulkBody = z.infer<typeof anticheatBulkBody>;

export const anticheatBulkResult = z.object({
  applied: z.int(),
  skipped: z.array(
    z.object({
      userId: z.string(),
      why: z.enum(['notAPlayer', 'alreadyBanned', 'alreadyHeld']),
    }),
  ),
});
export type AnticheatBulkResult = z.infer<typeof anticheatBulkResult>;

// Admin: alerts and summary

export const anticheatAlertParams = z.object({ id: z.coerce.number().int().positive() });

export const anticheatAlertsQuery = z.object({ cursor });

export const anticheatAlertRow = z.object({
  id: z.int(),
  kind: z.enum(ANTICHEAT_ALERT_KINDS),
  createdAt: isoDate,
  dismissedAt: isoDate.nullable(),
  dismissedBy: z.string().nullable(),
  player: anticheatPlayerRef.nullable(),
  file: z.object({ sha512: z.string(), name: z.string() }).nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type AnticheatAlertRow = z.infer<typeof anticheatAlertRow>;
export const anticheatAlertPage = anticheatPage(anticheatAlertRow);

/** For the nav badge and the Overview tile. */
export const anticheatSummary = z.object({
  review: z.int().describe('Files that wait for an admin to look at them.'),
  waiting: z.int().describe('Open sessions waiting for the score of a file.'),
  alerts: z.int().describe('Open alerts.'),
  mode: anticheatMode,
});
export type AnticheatSummary = z.infer<typeof anticheatSummary>;
