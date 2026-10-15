import { z } from 'zod';

// Warden contracts, shared by the routes and the pages. See docs/warden.md.
// Responses are schemas too, so the API reference (server/openapi/) is built from the same
// definitions as the types. The server doesn't check its own responses with them.

/** A Minecraft UUID, with dashes, in lowercase. */
export const minecraftUuid = z
  .string()
  .regex(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)
  .transform((uuid) => uuid.toLowerCase());

export const minecraftUsername = z.string().regex(/^\w{3,16}$/);

/** The label in <token>.mc.bde-teknantes.fr: 26 characters of lowercase base32. */
export const SERVER_TOKEN_LENGTH = 26;
const SERVER_TOKEN_PATTERN = new RegExp(`^[a-z2-7]{${String(SERVER_TOKEN_LENGTH)}}$`);
export function isServerToken(value: string): boolean {
  return SERVER_TOKEN_PATTERN.test(value);
}

/**
 * A token as the server read it from the player's address. Anything goes: a malformed token is
 * an unknown one, and the player should hear that rather than get a 400.
 */
export const serverTokenInput = z.string().max(253);

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

/** Minecraft staff behind an action sent by the server. Without one, it's the console. */
export const wardenIssuer = z
  .object({ uuid: minecraftUuid, username: minecraftUsername })
  .describe("Minecraft staff behind the action. Without one, it's the console.");
export type WardenIssuer = z.infer<typeof wardenIssuer>;

/** Body of POST /api/warden/server/link-requests. */
export const wardenLinkRequestBody = z.object({
  uuid: minecraftUuid,
  username: minecraftUsername,
  cracked: z.boolean(),
  token: serverTokenInput
    .optional()
    .describe("From the player's address. An unknown token just leaves the request unbound."),
});
export type WardenLinkRequestBody = z.infer<typeof wardenLinkRequestBody>;

export const wardenLinkRequest = z.object({
  requestId: z.string(),
  userCode: z.string().describe('The 6-digit code the player enters on /link.'),
  expiresAt: isoDate,
  expiresIn: z.number().describe('Seconds until the code expires.'),
  interval: z.number().describe('Seconds to wait between two status checks.'),
  verificationUri: z.string(),
  verificationUriComplete: z.string().describe('/link with the code filled in.'),
  boundToUser: z
    .boolean()
    .describe('Only the player whose token came with the request can use it.'),
});
export type WardenLinkRequest = z.infer<typeof wardenLinkRequest>;

export const wardenLinkRequestStatus = z.object({
  status: z.enum(['pending', 'approved', 'denied', 'expired']),
  userId: z.string().nullable().describe('Set once approved.'),
});
export type WardenLinkRequestStatus = z.infer<typeof wardenLinkRequestStatus>['status'];

const wardenLimit = z.object({ used: z.number(), max: z.number() });

/** The Minecraft account behind a code, for the /link page. */
export const wardenLinkPreview = z.object({
  uuid: z.string(),
  username: z.string(),
  cracked: z.boolean(),
  limit: wardenLimit,
});
export type WardenLinkPreview = z.infer<typeof wardenLinkPreview>;

/** Body of POST /api/warden/server/login. */
export const wardenLoginBody = z.object({
  token: serverTokenInput,
  uuid: minecraftUuid,
  username: minecraftUsername,
  cracked: z.boolean(),
});
export type WardenLoginBody = z.infer<typeof wardenLoginBody>;

export const WARDEN_DENY_REASONS = [
  'unknownToken',
  'notLinked',
  'linkedElsewhere',
  'banned',
  'crackedNotAllowed',
  'crackedMismatch',
  'schoolNotAllowed',
] as const;

const banSummary = z.object({ reason: z.string(), expiresAt: isoDate.nullable() });

export const wardenLogin = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('allowed'),
    sessionId: z.string(),
    player: z.object({
      userId: z.string(),
      displayName: z
        .string()
        .nullable()
        .describe('"Charles M.", or null when the player hides their name.'),
      roles: z.array(z.string()),
    }),
    account: z.object({ uuid: z.string(), username: z.string() }),
    warnings: z
      .array(z.object({ id: z.string(), body: z.string(), createdAt: isoDate }))
      .describe('Warnings given since the account was last seen.'),
  }),
  z.object({
    result: z.literal('denied'),
    reason: z.enum(WARDEN_DENY_REASONS),
    ban: banSummary.optional(),
    link: wardenLinkRequest.optional().describe('For notLinked: a code to link the account.'),
  }),
]);
export type WardenLogin = z.infer<typeof wardenLogin>;

/** Body of POST /api/warden/server/sessions/heartbeat. The server sends it every 60 seconds. */
export const wardenHeartbeatBody = z.object({ sessionIds: z.array(z.uuid()).max(500) });

export const wardenHeartbeat = z.object({
  unknown: z
    .array(z.string())
    .describe('Sessions the site has closed. Treat them as ended, and usually kick the player.'),
});

/** Body of POST /api/warden/server/sessions/end. */
export const wardenSessionEndBody = z.object({
  sessionId: z.uuid(),
  reason: z.enum(['quit', 'kicked']),
});

/** Seconds, up to ten years, or null for a permanent ban. */
export const banDuration = z
  .number()
  .int()
  .positive()
  .max(10 * 365 * 24 * 3600)
  .nullable()
  .describe('Seconds, up to ten years, or null for a permanent ban.');

export const banReason = z.string().trim().min(1).max(500);
export const noteBody = z.string().trim().min(1).max(2000);

/** Body of POST /api/warden/server/players/:uuid/bans. */
export const wardenServerBanBody = z.object({
  reason: banReason,
  durationSeconds: banDuration,
  issuer: wardenIssuer.optional(),
});

/** Body of POST /api/warden/server/players/:uuid/unban. */
export const wardenServerUnbanBody = z.object({
  reason: z.string().trim().max(500).optional(),
  issuer: wardenIssuer.optional(),
});

/** Body of POST /api/warden/server/players/:uuid/warnings. */
export const wardenServerWarningBody = z.object({
  body: noteBody,
  issuer: wardenIssuer.optional(),
});

/** Body of POST /api/warden/admin/players/:userId/bans. */
export const wardenBanBody = z.object({ reason: banReason, durationSeconds: banDuration });
export type WardenBanBody = z.infer<typeof wardenBanBody>;

/** Body of POST /api/warden/admin/bans/:banId/revoke. */
export const wardenRevokeBody = z.object({ reason: z.string().trim().max(500).optional() });

/** Body of POST /api/warden/admin/players/:userId/notes. */
export const wardenNoteBody = z.object({
  kind: z
    .enum(['note', 'warning'])
    .describe('A note stays private. A warning is shown to the player.'),
  body: noteBody,
});
export type WardenNoteBody = z.infer<typeof wardenNoteBody>;

/** Body of POST /api/warden/me/bans/:banId/appeal. */
export const wardenAppealBody = z.object({ body: z.string().trim().min(1).max(2000) });

/** Body of POST /api/warden/admin/appeals/:id/decision. */
export const wardenAppealDecisionBody = z.object({
  accept: z.boolean().describe('Accepting lifts the ban.'),
  response: z.string().trim().min(1).max(2000),
});

export const wardenAppealsQuery = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']).optional(),
});

const wardenSource = z.enum(['web', 'minecraft', 'system']);

/** Who did something, as admins see it. */
export const wardenActorView = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), userId: z.string(), name: z.string().nullable() }),
  z.object({
    kind: z.literal('minecraft'),
    uuid: z.string(),
    username: z.string(),
    userId: z
      .string()
      .nullable()
      .describe("The staff member's LNB account, when their Minecraft account is linked."),
    name: z.string().nullable(),
  }),
  z.object({ kind: z.literal('console') }),
  z.object({ kind: z.literal('system') }),
]);
export type WardenActorView = z.infer<typeof wardenActorView>;

export const wardenBanView = z.object({
  id: z.string(),
  reason: z.string(),
  createdAt: isoDate,
  expiresAt: isoDate.nullable(),
  active: z.boolean(),
  source: wardenSource,
  minecraftUuid: z.string().nullable(),
  issuedBy: wardenActorView,
  revoked: z
    .object({
      at: isoDate,
      by: wardenActorView,
      source: wardenSource,
      reason: z.string().nullable(),
    })
    .nullable(),
});
export type WardenBanView = z.infer<typeof wardenBanView>;

export const wardenNoteView = z.object({
  id: z.string(),
  kind: z.enum(['note', 'warning']),
  body: z.string(),
  createdAt: isoDate,
  source: wardenSource,
  author: wardenActorView,
});
export type WardenNoteView = z.infer<typeof wardenNoteView>;

export const wardenAppealView = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: isoDate,
  status: z.enum(['pending', 'accepted', 'rejected']),
  response: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  decidedBy: wardenActorView.nullable(),
});
export type WardenAppealView = z.infer<typeof wardenAppealView>;

/** GET /api/warden/admin/appeals: an appeal with its ban. */
export const wardenAppealListItem = z.object({
  appeal: wardenAppealView,
  ban: wardenBanView,
  player: z.object({ userId: z.string(), name: z.string() }),
});
export type WardenAppealListItem = z.infer<typeof wardenAppealListItem>;

export const wardenUuidParams = z.object({ uuid: minecraftUuid });
export const wardenUserParams = z.object({ userId: z.string().min(1).max(64) });
export const wardenBanParams = z.object({ banId: z.uuid() });

export const wardenAccountView = z.object({
  uuid: z.string(),
  username: z.string(),
  cracked: z.boolean(),
  linkedAt: isoDate,
  lastSeenAt: isoDate.nullable(),
  online: z.boolean(),
  playtimeSeconds: z.number(),
  pastUsernames: z
    .array(z.object({ username: z.string(), firstSeenAt: isoDate }))
    .describe('Earlier usernames, newest first, without the current one.'),
});
export type WardenAccountView = z.infer<typeof wardenAccountView>;

/** A past ban or a warning, as the player sees it: without staff names. */
export const wardenHistoryItem = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ban'),
    id: z.string(),
    reason: z.string(),
    createdAt: isoDate,
    expiresAt: isoDate.nullable(),
    revokedAt: isoDate.nullable(),
    active: z.boolean(),
  }),
  z.object({ kind: z.literal('warning'), id: z.string(), body: z.string(), createdAt: isoDate }),
]);
export type WardenHistoryItem = z.infer<typeof wardenHistoryItem>;

export interface WardenPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** A page of a list. Pass `nextCursor` as `?cursor=` for the next one. */
export function wardenPage<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().describe('Null on the last page.'),
  });
}

export const wardenSessionView = z.object({
  id: z.string(),
  minecraftUuid: z.string(),
  username: z.string(),
  startedAt: isoDate,
  endedAt: isoDate.nullable(),
  durationSeconds: z.number(),
  online: z.boolean(),
});
export type WardenSessionView = z.infer<typeof wardenSessionView>;
export const wardenSessionPage = wardenPage(wardenSessionView);

/** GET /api/warden/me: everything the /warden page shows. */
export const wardenMe = z.object({
  serverUrl: z.string(),
  tokenRotatedAt: isoDate,
  showRealName: z.boolean(),
  shortName: z
    .string()
    .describe('What other players see when the name is shown, such as "Charles M.".'),
  limit: wardenLimit,
  accounts: z.array(wardenAccountView),
  totals: z.object({ playtimeSeconds: z.number(), lastSeenAt: isoDate.nullable() }),
  activeBan: z
    .object({
      id: z.string(),
      reason: z.string(),
      createdAt: isoDate,
      expiresAt: isoDate.nullable(),
      appeal: wardenAppealView.nullable(),
    })
    .nullable(),
  history: z.array(wardenHistoryItem),
  sessions: wardenSessionPage.describe(
    'The first page of sessions. More come from GET /api/warden/me/sessions.',
  ),
});
export type WardenMe = z.infer<typeof wardenMe>;

/** Body of PATCH /api/warden/me. */
export const wardenMePatchBody = z.object({ showRealName: z.boolean() });

/** POST /api/warden/me/token: the player's new address. */
export const wardenServerUrl = z.object({ serverUrl: z.string() });

/** ?cursor= on lists: the opaque value of the previous page's nextCursor. */
export const wardenCursorQuery = z.object({
  cursor: z.string().max(200).optional().describe("The previous page's nextCursor."),
});

/** GET /api/warden/server/players/:uuid, for staff commands in-game. */
export const wardenServerPlayer = z.object({
  userId: z.string(),
  name: z.string(),
  school: z.string().nullable(),
  roles: z.array(z.string()),
  accounts: z.array(z.object({ uuid: z.string(), username: z.string(), cracked: z.boolean() })),
  activeBan: z
    .object({ id: z.string(), reason: z.string(), expiresAt: isoDate.nullable() })
    .nullable(),
  warnings: z.number().describe('How many warnings the player has had.'),
  playtimeSeconds: z.number(),
});
export type WardenServerPlayer = z.infer<typeof wardenServerPlayer>;

/** GET /api/warden/admin/players query. */
export const wardenPlayersQuery = z.object({
  q: z.string().trim().max(100).optional().describe('Name, email or Minecraft username.'),
  status: z.enum(['all', 'banned', 'online']).default('all'),
  cursor: z.string().max(200).optional(),
});
export type WardenPlayersQuery = z.input<typeof wardenPlayersQuery>;

export const wardenPlayerRow = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
  wardenAdmin: z.boolean(),
  accounts: z.array(
    z.object({ uuid: z.string(), username: z.string(), cracked: z.boolean(), online: z.boolean() }),
  ),
  ban: z.object({ id: z.string(), expiresAt: isoDate.nullable() }).nullable(),
  lastSeenAt: isoDate.nullable(),
  playtimeSeconds: z.number(),
});
export type WardenPlayerRow = z.infer<typeof wardenPlayerRow>;
export const wardenPlayerPage = wardenPage(wardenPlayerRow);

export const wardenAuditView = z.object({
  id: z.number(),
  at: isoDate,
  action: z.string(),
  source: wardenSource,
  actor: wardenActorView,
  target: z.object({ userId: z.string(), name: z.string().nullable() }).nullable(),
  targetMinecraftUuid: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type WardenAuditView = z.infer<typeof wardenAuditView>;
export const wardenAuditPage = wardenPage(wardenAuditView);

/** GET /api/warden/admin/players/:userId */
export const wardenPlayerDetail = z.object({
  player: z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    school: z.string().nullable(),
    admin: z.boolean(),
    wardenAdmin: z.boolean(),
    showRealName: z.boolean(),
    tokenRotatedAt: isoDate.nullable(),
    maxAccounts: z
      .number()
      .nullable()
      .describe("The player's own limit, or null for the global one."),
    defaultMaxAccounts: z
      .number()
      .describe('The global limit, which applies when maxAccounts is null.'),
    limit: wardenLimit,
  }),
  accounts: z.array(wardenAccountView),
  bans: z.array(wardenBanView.extend({ appeal: wardenAppealView.nullable() })),
  notes: z.array(wardenNoteView),
  sessions: wardenSessionPage,
  audit: z.array(wardenAuditView),
});
export type WardenPlayerDetail = z.infer<typeof wardenPlayerDetail>;

/** Body of PATCH /api/warden/admin/players/:userId. */
export const wardenPlayerPatchBody = z.object({
  maxAccounts: z.number().int().min(0).max(20).nullable().describe('Null to use the global limit.'),
});

/** Body of PUT /api/warden/admin/players/:userId/role. */
export const wardenRoleBody = z.object({ wardenAdmin: z.boolean() });

/** GET /api/warden/admin/audit query. */
export const wardenAuditQuery = z.object({
  userId: z.string().max(64).optional(),
  action: z.string().max(40).optional(),
  source: wardenSource.optional(),
  cursor: z.coerce.number().int().positive().optional(),
});

export const wardenSettingsView = z.object({
  defaultMaxAccounts: z.number(),
  allowCracked: z.boolean(),
});
export type WardenSettingsView = z.infer<typeof wardenSettingsView>;

/** Body of PATCH /api/warden/admin/settings. */
export const wardenSettingsPatchBody = z
  .object({
    defaultMaxAccounts: z.number().int().min(0).max(20),
    allowCracked: z.boolean(),
  })
  .partial();

export const wardenUserAccountParams = z.object({
  userId: z.string().min(1).max(64),
  uuid: minecraftUuid,
});

/** Events on GET /api/warden/server/events. */
export const wardenEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('kick'),
    data: z.object({
      uuids: z.array(z.string()),
      reason: z.enum(['banned', 'unlinked', 'tokenRotated']),
      ban: banSummary.optional(),
    }),
  }),
  z.object({ type: z.literal('unban'), data: z.object({ uuids: z.array(z.string()) }) }),
  z.object({
    type: z.literal('link'),
    data: z.object({ requestId: z.string().nullable(), uuid: z.string(), userId: z.string() }),
  }),
  z.object({ type: z.literal('settings'), data: wardenSettingsView }),
]);
export type WardenEvent = z.infer<typeof wardenEvent>;

/** GET /api/warden/admin/minecraft/:username?cracked=: the account a username names. */
export const wardenMinecraftLookupParams = z.object({ username: minecraftUsername });
export const wardenMinecraftLookupQuery = z.object({
  cracked: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export const wardenMinecraftLookup = z.object({
  uuid: z.string(),
  username: z.string().describe('As Mojang spells it, for premium accounts.'),
  cracked: z.boolean(),
  linkedTo: z
    .object({ userId: z.string(), name: z.string() })
    .nullable()
    .describe('The LNB player who already linked it, if anyone.'),
});
export type WardenMinecraftLookup = z.infer<typeof wardenMinecraftLookup>;

/** Body of POST /api/warden/admin/link-requests: a link code made by hand. */
export const wardenManualLinkBody = z.object({
  username: minecraftUsername,
  cracked: z.boolean(),
  userId: z.string().min(1).max(64).optional().describe('Only this LNB player can use the code.'),
});
export type WardenManualLinkBody = z.infer<typeof wardenManualLinkBody>;

const userRef = z.object({ userId: z.string(), name: z.string() });

export const wardenManualLinkView = z.object({
  id: z.string(),
  userCode: z.string(),
  createdAt: isoDate,
  expiresAt: isoDate,
  verificationUriComplete: z.string(),
  account: z.object({ uuid: z.string(), username: z.string(), cracked: z.boolean() }),
  for: userRef.nullable(),
  by: userRef.nullable(),
  status: z.enum(['pending', 'linked', 'expired', 'cancelled', 'denied']),
  linkedBy: userRef.nullable().describe('Who linked the account, once linked.'),
});
export type WardenManualLinkView = z.infer<typeof wardenManualLinkView>;

/** GET /api/warden/admin/users?q=: LNB players to make a code for. */
export const wardenUserSearchQuery = z.object({
  q: z.string().trim().min(1).max(100).describe('Name or email.'),
});
export const wardenUserOption = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
});
export type WardenUserOption = z.infer<typeof wardenUserOption>;

export const wardenIdParams = z.object({ id: z.uuid() });
export const wardenUserCodeParams = z.object({ userCode: z.string().regex(/^\d{6}$/) });

/** Why a Warden request was refused, in `data.problem`. */
export const WARDEN_PROBLEMS = [
  'invalidUuid',
  'alreadyLinked',
  'crackedNotAllowed',
  'banned',
  'notFound',
  'notLinked',
  'notBanned',
  'issuerNotAllowed',
  'appealExists',
  'appealClosed',
  'schoolNotAllowed',
  'invalidCursor',
  'unknownMinecraftUsername',
  'mojangUnavailable',
  'linkRequestClosed',
] as const;
export type WardenProblem = (typeof WARDEN_PROBLEMS)[number];
