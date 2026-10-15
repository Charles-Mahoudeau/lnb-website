import { z } from 'zod';

// Warden contracts, shared by the routes and the pages. See docs/warden.md.

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

/** Minecraft staff behind an action sent by the server. Without one, it's the console. */
export const wardenIssuer = z.object({ uuid: minecraftUuid, username: minecraftUsername });
export type WardenIssuer = z.infer<typeof wardenIssuer>;

/** Body of POST /api/warden/server/link-requests. */
export const wardenLinkRequestBody = z.object({
  uuid: minecraftUuid,
  username: minecraftUsername,
  cracked: z.boolean(),
  // From the player's address. An unknown token just leaves the request unbound.
  token: serverTokenInput.optional(),
});
export type WardenLinkRequestBody = z.infer<typeof wardenLinkRequestBody>;

export interface WardenLinkRequest {
  requestId: string;
  userCode: string;
  expiresAt: string;
  expiresIn: number;
  interval: number;
  verificationUri: string;
  verificationUriComplete: string;
  boundToUser: boolean;
}

export type WardenLinkRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** The Minecraft account behind a code, for the /link page. */
export interface WardenLinkPreview {
  uuid: string;
  username: string;
  cracked: boolean;
  limit: { used: number; max: number };
}

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

export type WardenLogin =
  | {
      result: 'allowed';
      sessionId: string;
      player: {
        userId: string;
        /** "Charles M.", or null when the player hides their name. */
        displayName: string | null;
        roles: string[];
      };
      account: { uuid: string; username: string };
      /** Warnings given since the account was last seen. */
      warnings: { id: string; body: string; createdAt: string }[];
    }
  | {
      result: 'denied';
      reason: (typeof WARDEN_DENY_REASONS)[number];
      ban?: { reason: string; expiresAt: string | null };
      /** For notLinked: a code to link the account. */
      link?: WardenLinkRequest;
    };

/** Body of POST /api/warden/server/sessions/heartbeat. The server sends it every 60 seconds. */
export const wardenHeartbeatBody = z.object({ sessionIds: z.array(z.uuid()).max(500) });

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
  .nullable();

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
export const wardenNoteBody = z.object({ kind: z.enum(['note', 'warning']), body: noteBody });
export type WardenNoteBody = z.infer<typeof wardenNoteBody>;

/** Body of POST /api/warden/me/bans/:banId/appeal. */
export const wardenAppealBody = z.object({ body: z.string().trim().min(1).max(2000) });

/** Body of POST /api/warden/admin/appeals/:id/decision. */
export const wardenAppealDecisionBody = z.object({
  accept: z.boolean(),
  response: z.string().trim().min(1).max(2000),
});

export const wardenAppealsQuery = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']).optional(),
});

/** Who did something, as admins see it. */
export type WardenActorView =
  | { kind: 'user'; userId: string; name: string | null }
  | {
      kind: 'minecraft';
      uuid: string;
      username: string;
      /** The staff member's LNB account, when their Minecraft account is linked. */
      userId: string | null;
      name: string | null;
    }
  | { kind: 'console' }
  | { kind: 'system' };

export interface WardenBanView {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
  source: 'web' | 'minecraft' | 'system';
  minecraftUuid: string | null;
  issuedBy: WardenActorView;
  revoked: {
    at: string;
    by: WardenActorView;
    source: 'web' | 'minecraft' | 'system';
    reason: string | null;
  } | null;
}

export interface WardenNoteView {
  id: string;
  kind: 'note' | 'warning';
  body: string;
  createdAt: string;
  source: 'web' | 'minecraft' | 'system';
  author: WardenActorView;
}

export interface WardenAppealView {
  id: string;
  body: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
  response: string | null;
  decidedAt: string | null;
  decidedBy: WardenActorView | null;
}

export const wardenUuidParams = z.object({ uuid: minecraftUuid });
export const wardenUserParams = z.object({ userId: z.string().min(1).max(64) });
export const wardenBanParams = z.object({ banId: z.uuid() });

export interface WardenAccountView {
  uuid: string;
  username: string;
  cracked: boolean;
  linkedAt: string;
  lastSeenAt: string | null;
  online: boolean;
  playtimeSeconds: number;
  /** Earlier usernames, newest first, without the current one. */
  pastUsernames: { username: string; firstSeenAt: string }[];
}

/** A past ban or a warning, as the player sees it: without staff names. */
export type WardenHistoryItem =
  | {
      kind: 'ban';
      id: string;
      reason: string;
      createdAt: string;
      expiresAt: string | null;
      revokedAt: string | null;
      active: boolean;
    }
  | { kind: 'warning'; id: string; body: string; createdAt: string };

/** GET /api/warden/me: everything the /warden page shows. */
export interface WardenMe {
  serverUrl: string;
  tokenRotatedAt: string;
  showRealName: boolean;
  /** What other players see when the name is shown, such as "Charles M.". */
  shortName: string;
  limit: { used: number; max: number };
  accounts: WardenAccountView[];
  totals: { playtimeSeconds: number; lastSeenAt: string | null };
  activeBan: {
    id: string;
    reason: string;
    createdAt: string;
    expiresAt: string | null;
    appeal: WardenAppealView | null;
  } | null;
  history: WardenHistoryItem[];
  /** The first page of sessions. More come from GET /api/warden/me/sessions. */
  sessions: WardenPage<WardenSessionView>;
}

/** Body of PATCH /api/warden/me. */
export const wardenMePatchBody = z.object({ showRealName: z.boolean() });

export interface WardenSessionView {
  id: string;
  minecraftUuid: string;
  username: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  online: boolean;
}

export interface WardenPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** ?cursor= on lists: the opaque value of the previous page's nextCursor. */
export const wardenCursorQuery = z.object({ cursor: z.string().max(200).optional() });

/** GET /api/warden/server/players/:uuid, for staff commands in-game. */
export interface WardenServerPlayer {
  userId: string;
  name: string;
  school: string | null;
  roles: string[];
  accounts: { uuid: string; username: string; cracked: boolean }[];
  activeBan: { id: string; reason: string; expiresAt: string | null } | null;
  warnings: number;
  playtimeSeconds: number;
}

/** GET /api/warden/admin/players query. */
export const wardenPlayersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'banned', 'online']).default('all'),
  cursor: z.string().max(200).optional(),
});
export type WardenPlayersQuery = z.input<typeof wardenPlayersQuery>;

export interface WardenPlayerRow {
  userId: string;
  name: string;
  email: string;
  school: string | null;
  wardenAdmin: boolean;
  accounts: { uuid: string; username: string; cracked: boolean; online: boolean }[];
  ban: { id: string; expiresAt: string | null } | null;
  lastSeenAt: string | null;
  playtimeSeconds: number;
}

export interface WardenAuditView {
  id: number;
  at: string;
  action: string;
  source: 'web' | 'minecraft' | 'system';
  actor: WardenActorView;
  target: { userId: string; name: string | null } | null;
  targetMinecraftUuid: string | null;
  data: Record<string, unknown>;
}

/** GET /api/warden/admin/players/:userId */
export interface WardenPlayerDetail {
  player: {
    userId: string;
    name: string;
    email: string;
    school: string | null;
    admin: boolean;
    wardenAdmin: boolean;
    showRealName: boolean;
    tokenRotatedAt: string | null;
    /** The player's own limit, or null for the global one. */
    maxAccounts: number | null;
    limit: { used: number; max: number };
  };
  accounts: WardenAccountView[];
  bans: (WardenBanView & { appeal: WardenAppealView | null })[];
  notes: WardenNoteView[];
  sessions: WardenPage<WardenSessionView>;
  audit: WardenAuditView[];
}

/** Body of PATCH /api/warden/admin/players/:userId. */
export const wardenPlayerPatchBody = z.object({
  maxAccounts: z.number().int().min(0).max(20).nullable(),
});

/** Body of PUT /api/warden/admin/players/:userId/role. */
export const wardenRoleBody = z.object({ wardenAdmin: z.boolean() });

/** GET /api/warden/admin/audit query. */
export const wardenAuditQuery = z.object({
  userId: z.string().max(64).optional(),
  action: z.string().max(40).optional(),
  source: z.enum(['web', 'minecraft', 'system']).optional(),
  cursor: z.coerce.number().int().positive().optional(),
});

export interface WardenSettingsView {
  defaultMaxAccounts: number;
  allowCracked: boolean;
}

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
export type WardenEvent =
  | {
      type: 'kick';
      data: {
        uuids: string[];
        reason: 'banned' | 'unlinked' | 'tokenRotated';
        ban?: { reason: string; expiresAt: string | null };
      };
    }
  | { type: 'unban'; data: { uuids: string[] } }
  | { type: 'link'; data: { requestId: string | null; uuid: string; userId: string } }
  | { type: 'settings'; data: { defaultMaxAccounts: number; allowCracked: boolean } };

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
] as const;
export type WardenProblem = (typeof WARDEN_PROBLEMS)[number];
