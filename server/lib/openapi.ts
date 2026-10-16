import { z } from 'zod';

import * as admin from '../../shared/schemas/admin.ts';
import { avatarParams } from '../../shared/schemas/avatars.ts';
import * as flags from '../../shared/schemas/flags.ts';
import { linkApproveBody, linkApproveResult } from '../../shared/schemas/link.ts';
import * as mods from '../../shared/schemas/mods.ts';
import * as warden from '../../shared/schemas/warden.ts';

// The OpenAPI document behind the API reference at /api/docs. Schemas come from the shared Zod
// contracts, so they can't drift from the code. Every route in server/api/ needs an entry in
// `routes` below: test/unit/openapi.test.ts fails otherwise.
// No Nuxt imports, so unit tests can load it. Better Auth's part is passed in by the route.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Who may call a route. */
type Access = 'public' | 'user' | 'wardenAdmin' | 'admin' | 'wardenServer';

interface Problem {
  status: number;
  problems: readonly string[];
}

interface RouteDoc {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  params?: z.ZodObject;
  query?: z.ZodObject;
  headers?: Record<string, OpenApiObject>;
  /** A JSON body, registered in `requestSchemas`. */
  body?: z.ZodType;
  /** A JSON response, registered in `responseSchemas`, or the full 200 response. */
  response?: z.ZodType | OpenApiObject;
  /** For routes that answer with 204 No Content. */
  noContent?: true;
  /** For routes that answer with 201 Created and `response`. */
  created?: true;
  problems?: Problem[];
}

type OpenApiObject = Record<string, unknown>;

// Named schemas, listed under Models in the reference. Requests are described as they're sent,
// responses as they're returned.
const requestSchemas = {
  AdminRolesBody: admin.adminRolesBody,
  AdminBanBody: admin.adminBanBody,
  FlagPatchBody: flags.flagPatchBody,
  LinkApproveBody: linkApproveBody,
  WardenIssuer: warden.wardenIssuer,
  WardenLinkRequestBody: warden.wardenLinkRequestBody,
  WardenLoginBody: warden.wardenLoginBody,
  WardenHeartbeatBody: warden.wardenHeartbeatBody,
  WardenSessionEndBody: warden.wardenSessionEndBody,
  WardenServerBanBody: warden.wardenServerBanBody,
  WardenServerUnbanBody: warden.wardenServerUnbanBody,
  WardenServerWarningBody: warden.wardenServerWarningBody,
  WardenBanBody: warden.wardenBanBody,
  WardenRevokeBody: warden.wardenRevokeBody,
  WardenNoteBody: warden.wardenNoteBody,
  WardenAppealBody: warden.wardenAppealBody,
  WardenAppealDecisionBody: warden.wardenAppealDecisionBody,
  WardenMePatchBody: warden.wardenMePatchBody,
  WardenPlayerPatchBody: warden.wardenPlayerPatchBody,
  WardenRoleBody: warden.wardenRoleBody,
  WardenSettingsPatchBody: warden.wardenSettingsPatchBody,
  WardenManualLinkBody: warden.wardenManualLinkBody,
  ModVoteBody: mods.modVoteBody,
  ModSuggestBody: mods.modSuggestBody,
  ModReasonBody: mods.modReasonBody,
  ModAddBody: mods.modAddBody,
  ModRemoveBody: mods.modRemoveBody,
  ModSettingsPatchBody: mods.modSettingsPatchBody,
};

const responseSchemas = {
  AdminOverview: admin.adminOverview,
  AdminAuditView: admin.adminAuditView,
  AdminUserRow: admin.adminUserRow,
  AdminUserPage: admin.adminUserPage,
  FlagStates: flags.flagStates,
  AdminFlagList: flags.adminFlagList,
  LinkApproveResult: linkApproveResult,
  WardenLinkRequest: warden.wardenLinkRequest,
  WardenLinkRequestStatus: warden.wardenLinkRequestStatus,
  WardenLinkPreview: warden.wardenLinkPreview,
  WardenLogin: warden.wardenLogin,
  WardenHeartbeat: warden.wardenHeartbeat,
  WardenActorView: warden.wardenActorView,
  WardenBanView: warden.wardenBanView,
  WardenNoteView: warden.wardenNoteView,
  WardenAppealView: warden.wardenAppealView,
  WardenAppealListItem: warden.wardenAppealListItem,
  WardenAccountView: warden.wardenAccountView,
  WardenHistoryItem: warden.wardenHistoryItem,
  WardenSessionView: warden.wardenSessionView,
  WardenSessionPage: warden.wardenSessionPage,
  WardenMe: warden.wardenMe,
  WardenServerUrl: warden.wardenServerUrl,
  WardenServerPlayer: warden.wardenServerPlayer,
  WardenPlayerRow: warden.wardenPlayerRow,
  WardenPlayerPage: warden.wardenPlayerPage,
  WardenAuditView: warden.wardenAuditView,
  WardenAuditPage: warden.wardenAuditPage,
  WardenPlayerDetail: warden.wardenPlayerDetail,
  WardenSettingsView: warden.wardenSettingsView,
  WardenEvent: warden.wardenEvent,
  WardenMinecraftLookup: warden.wardenMinecraftLookup,
  WardenManualLinkView: warden.wardenManualLinkView,
  WardenUserOption: warden.wardenUserOption,
  ModView: mods.modView,
  ModRemovalNotice: mods.modRemovalNotice,
  ModListPage: mods.modListPage,
  ModVoteResult: mods.modVoteResult,
  ModSearchResult: mods.modSearchResult,
  ModSearchResults: mods.modSearchResults,
  ModCreated: mods.modCreated,
  ModSettingsView: mods.modSettingsView,
  ModAdminRow: mods.modAdminRow,
  ModAdminList: mods.modAdminList,
};

const TAGS = {
  health: 'Health',
  users: 'Users',
  reference: 'API reference',
  link: 'App linking',
  admin: 'Admin',
  flags: 'Feature flags',
  wardenServer: 'Warden: Minecraft server',
  wardenPlayer: 'Warden: players',
  wardenAdmin: 'Warden: admins',
  mods: 'Mod list',
  modsAdmin: 'Mod list: admins',
  auth: 'Auth',
  authDevice: 'Auth: device authorization',
};

// Better Auth's tags, renamed to sit next to ours.
const AUTH_TAGS: Record<string, string> = {
  Default: TAGS.auth,
  'Device-authorization': TAGS.authDevice,
};

const routes: RouteDoc[] = [
  // Site
  {
    method: 'get',
    path: '/api/health',
    tag: TAGS.health,
    summary: 'Liveness check',
    description: 'For Coolify. Answers as long as the server runs, without checking the database.',
    access: 'public',
    response: z.object({ status: z.literal('ok') }),
  },
  {
    method: 'get',
    path: '/api/avatars/{key}',
    tag: TAGS.users,
    summary: 'A profile photo',
    description:
      "A user's Microsoft profile photo, saved by the site at sign-in. The URL is the user's `image`. Keyed by content, so it's cached for a year, by the browser only.",
    access: 'user',
    params: avatarParams,
    response: {
      description: 'The photo, 96×96.',
      content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
    },
    problems: [{ status: 404, problems: [] }],
  },
  {
    method: 'get',
    path: '/api/docs',
    tag: TAGS.reference,
    summary: 'This API reference',
    access: 'public',
    response: {
      description: 'The reference page, rendered by Scalar.',
      content: { 'text/html': { schema: { type: 'string' } } },
    },
  },
  {
    method: 'get',
    path: '/api/openapi.json',
    tag: TAGS.reference,
    summary: 'OpenAPI document',
    description: 'The OpenAPI 3.1 document behind this reference, Better Auth routes included.',
    access: 'public',
    response: {
      description: 'The OpenAPI document.',
      content: { 'application/json': { schema: { type: 'object' } } },
    },
  },
  {
    method: 'post',
    path: '/api/link/approve',
    tag: TAGS.link,
    summary: 'Approve a link code',
    description:
      "Links the app behind a 6-digit code to the signed-in account, after `GET /api/auth/device` has claimed the code. Replaces Better Auth's `/device/approve`, so the app's school and redirect rules can't be skipped. See `docs/authentication.md`.",
    access: 'user',
    body: linkApproveBody,
    response: linkApproveResult,
    problems: [
      { status: 400, problems: ['unknown', 'expired', 'used', 'invalidRedirect'] },
      { status: 403, problems: ['schoolNotAllowed'] },
      {
        status: 409,
        problems: ['accountLimitReached', 'minecraftAccountTaken', 'wrongAccount'],
      },
    ],
  },

  // Admin
  {
    method: 'get',
    path: '/api/admin/overview',
    tag: TAGS.admin,
    summary: 'Overview',
    description:
      'What needs an admin (Warden appeals waiting, accounts inactive for 24 months, site bans in force) and the 10 latest admin changes.',
    access: 'admin',
    response: admin.adminOverview,
  },
  {
    method: 'get',
    path: '/api/flags',
    tag: TAGS.flags,
    summary: 'Feature flags',
    description:
      'Whether each feature is on. A flag whose parent is off is off too. Gated routes answer 503 `disabled` while their flag is off.',
    access: 'public',
    response: flags.flagStates,
  },
  {
    method: 'get',
    path: '/api/admin/flags',
    tag: TAGS.admin,
    summary: 'Feature flags, for admins',
    description: 'Each flag with its own switch, what is applied, and who last changed it.',
    access: 'admin',
    response: flags.adminFlagList,
  },
  {
    method: 'patch',
    path: '/api/admin/flags/{key}',
    tag: TAGS.admin,
    summary: 'Switch a feature flag',
    description: 'Takes effect at once on this instance and within 10 seconds on the others.',
    access: 'admin',
    params: flags.flagParams,
    body: flags.flagPatchBody,
    response: flags.adminFlagList,
  },
  {
    method: 'get',
    path: '/api/admin/users',
    tag: TAGS.admin,
    summary: 'Accounts',
    description:
      'Every account, by name, with its school, roles, last sign-in and site ban. Search by name or email.',
    access: 'admin',
    query: admin.adminUsersQuery,
    response: admin.adminUserPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'put',
    path: '/api/admin/users/{userId}/roles',
    tag: TAGS.admin,
    summary: "Set an account's roles",
    description:
      "Sets `admin` and `warden-admin` together. Admins can't remove their own admin role.",
    access: 'admin',
    params: admin.adminUserParams,
    body: admin.adminRolesBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['self'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/users/{userId}/ban',
    tag: TAGS.admin,
    summary: 'Ban from the site',
    description:
      "Refuses sign-in until the ban ends, and signs out every session. Separate from Warden bans, which only block the Minecraft server. Admins can't be banned until their admin role is removed.",
    access: 'admin',
    params: admin.adminUserParams,
    body: admin.adminBanBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['self', 'targetIsAdmin'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/users/{userId}/unban',
    tag: TAGS.admin,
    summary: 'Lift a site ban',
    access: 'admin',
    params: admin.adminUserParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notBanned'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/users/{userId}/sign-out',
    tag: TAGS.admin,
    summary: 'Sign out everywhere',
    description: 'Ends every session of the account, on every device.',
    access: 'admin',
    params: admin.adminUserParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'delete',
    path: '/api/admin/users/{userId}',
    tag: TAGS.admin,
    summary: 'Delete an account',
    description:
      "Deletes the account and everything that belongs to it, Warden data included. It can't be undone. Admins can't be deleted until their admin role is removed.",
    access: 'admin',
    params: admin.adminUserParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['self', 'targetIsAdmin'] },
    ],
  },

  // Warden: Minecraft server
  {
    method: 'post',
    path: '/api/warden/server/link-requests',
    tag: TAGS.wardenServer,
    summary: 'Create a link code',
    description:
      'Creates a 6-digit code for a Minecraft account, which the player enters on `/link`. With a valid `token`, the request is bound to that player: only they can use it. A pending request for the same UUID is returned again instead of a new code. Codes last 10 minutes.',
    access: 'wardenServer',
    body: warden.wardenLinkRequestBody,
    response: warden.wardenLinkRequest,
    problems: [
      { status: 400, problems: ['invalidUuid'] },
      { status: 403, problems: ['crackedNotAllowed', 'banned'] },
      { status: 409, problems: ['alreadyLinked'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/server/link-requests/{id}',
    tag: TAGS.wardenServer,
    summary: 'Check a link code',
    description: 'Poll this, or wait for the `link` event.',
    access: 'wardenServer',
    params: warden.wardenIdParams,
    response: warden.wardenLinkRequestStatus,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/warden/server/login',
    tag: TAGS.wardenServer,
    summary: 'Let a player join',
    description:
      "Called when a player joins through `<token>.mc.bde-teknantes.fr`. `allowed` opens a session. `denied` comes with a reason, and with a link request bound to the player for `notLinked`. `linkedElsewhere`: the account belongs to another LNB account than the token's. `crackedMismatch`: the account was linked as premium and now joins as cracked, or the other way round.",
    access: 'wardenServer',
    body: warden.wardenLoginBody,
    response: warden.wardenLogin,
    problems: [{ status: 400, problems: ['invalidUuid'] }],
  },
  {
    method: 'post',
    path: '/api/warden/server/sessions/heartbeat',
    tag: TAGS.wardenServer,
    summary: 'Keep sessions open',
    description:
      'Send every 60 seconds with the sessions of online players. Sessions with no heartbeat for 3 minutes are closed at their last heartbeat.',
    access: 'wardenServer',
    body: warden.wardenHeartbeatBody,
    response: warden.wardenHeartbeat,
  },
  {
    method: 'post',
    path: '/api/warden/server/sessions/end',
    tag: TAGS.wardenServer,
    summary: 'End a session',
    access: 'wardenServer',
    body: warden.wardenSessionEndBody,
    noContent: true,
  },
  {
    method: 'get',
    path: '/api/warden/server/players/{uuid}',
    tag: TAGS.wardenServer,
    summary: 'Look up a player',
    description:
      'For staff commands: the LNB name and school, the linked accounts, the active ban, the number of warnings and the playtime.',
    access: 'wardenServer',
    params: warden.wardenUuidParams,
    response: warden.wardenServerPlayer,
    problems: [{ status: 404, problems: ['notLinked'] }],
  },
  {
    method: 'post',
    path: '/api/warden/server/players/{uuid}/bans',
    tag: TAGS.wardenServer,
    summary: 'Ban a player',
    description:
      "Bans the LNB account behind the Minecraft account, so all of its accounts. Replaces the active ban, if any. The `issuer` must be a linked account with the `warden-admin` or `admin` role. Without one, it's the console.",
    access: 'wardenServer',
    params: warden.wardenUuidParams,
    body: warden.wardenServerBanBody,
    response: warden.wardenBanView,
    problems: [
      { status: 403, problems: ['issuerNotAllowed'] },
      { status: 404, problems: ['notLinked'] },
    ],
  },
  {
    method: 'post',
    path: '/api/warden/server/players/{uuid}/unban',
    tag: TAGS.wardenServer,
    summary: 'Unban a player',
    description: 'Returns the revoked ban.',
    access: 'wardenServer',
    params: warden.wardenUuidParams,
    body: warden.wardenServerUnbanBody,
    response: warden.wardenBanView,
    problems: [
      { status: 403, problems: ['issuerNotAllowed'] },
      { status: 404, problems: ['notLinked'] },
      { status: 409, problems: ['notBanned'] },
    ],
  },
  {
    method: 'post',
    path: '/api/warden/server/players/{uuid}/warnings',
    tag: TAGS.wardenServer,
    summary: 'Warn a player',
    description: "The player sees it on `/minecraft/warden` and in the next login's `warnings`.",
    access: 'wardenServer',
    params: warden.wardenUuidParams,
    body: warden.wardenServerWarningBody,
    response: warden.wardenNoteView,
    problems: [
      { status: 403, problems: ['issuerNotAllowed'] },
      { status: 404, problems: ['notLinked'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/server/events',
    tag: TAGS.wardenServer,
    summary: 'Live changes',
    description: [
      'Server-Sent Events. Keep it open: when a player is banned, unlinked or gets a new token on the site, a `kick` event says whom to disconnect.',
      '',
      "Each event's `id` is its audit log ID, its `event` is the type, and its `data` is the JSON below. The site checks for new events every second, and sends a `ping` event after 25 quiet seconds so proxies keep the connection open.",
    ].join('\n'),
    access: 'wardenServer',
    headers: {
      'Last-Event-ID': {
        description:
          'The last event ID received, when reconnecting, to get the events missed. Without it, the stream starts from now.',
        schema: { type: 'integer', minimum: 0 },
      },
    },
    response: {
      description: 'An event stream. The `data` of each event is shown here.',
      content: {
        'text/event-stream': { schema: { $ref: '#/components/schemas/WardenEvent' } },
      },
    },
  },

  // Warden: players
  {
    method: 'get',
    path: '/api/warden/me',
    tag: TAGS.wardenPlayer,
    summary: 'My Warden page',
    description:
      'Everything `/minecraft/warden` shows: the server address, the limit, linked accounts, the active ban and its appeal, the history of bans and warnings (without staff names), and the first page of sessions.',
    access: 'user',
    response: warden.wardenMe,
    problems: [{ status: 403, problems: ['schoolNotAllowed'] }],
  },
  {
    method: 'patch',
    path: '/api/warden/me',
    tag: TAGS.wardenPlayer,
    summary: 'Show or hide my name in-game',
    access: 'user',
    body: warden.wardenMePatchBody,
    noContent: true,
    problems: [{ status: 403, problems: ['schoolNotAllowed'] }],
  },
  {
    method: 'post',
    path: '/api/warden/me/token',
    tag: TAGS.wardenPlayer,
    summary: 'Get a new server address',
    description: 'Regenerates the token in the address, which signs out the online sessions.',
    access: 'user',
    response: warden.wardenServerUrl,
    problems: [{ status: 403, problems: ['schoolNotAllowed'] }],
  },
  {
    method: 'delete',
    path: '/api/warden/me/accounts/{uuid}',
    tag: TAGS.wardenPlayer,
    summary: 'Unlink one of my accounts',
    description: "Kicks the account if it's online.",
    access: 'user',
    params: warden.wardenUuidParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notLinked'] }],
  },
  {
    method: 'get',
    path: '/api/warden/me/sessions',
    tag: TAGS.wardenPlayer,
    summary: 'My sessions',
    description: 'Newest first, 20 per page.',
    access: 'user',
    query: warden.wardenCursorQuery,
    response: warden.wardenSessionPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'post',
    path: '/api/warden/me/bans/{banId}/appeal',
    tag: TAGS.wardenPlayer,
    summary: 'Appeal my ban',
    description: "Once per ban, while it's active.",
    access: 'user',
    params: warden.wardenBanParams,
    body: warden.wardenAppealBody,
    response: warden.wardenAppealView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['appealExists'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/link-requests/{userCode}',
    tag: TAGS.wardenPlayer,
    summary: 'Preview a link code',
    description:
      'For `/link`: the Minecraft account behind a code the player has claimed, and their limit.',
    access: 'user',
    params: warden.wardenUserCodeParams,
    response: warden.wardenLinkPreview,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'get',
    path: '/api/warden/heads/{uuid}',
    tag: TAGS.wardenPlayer,
    summary: 'Skin head',
    description:
      "The account's skin head, 64 px, for linked accounts and pending link requests only. Fetched from Crafatar (or mc-heads.net) and cached for a day, so visitors never contact these services. Cracked accounts get Steve.",
    access: 'public',
    params: warden.wardenUuidParams,
    response: {
      description: 'A PNG image, cached for a day.',
      content: { 'image/png': { schema: { type: 'string', contentMediaType: 'image/png' } } },
    },
  },

  // Warden: admins
  {
    method: 'get',
    path: '/api/warden/admin/players',
    tag: TAGS.wardenAdmin,
    summary: 'List players',
    access: 'wardenAdmin',
    query: warden.wardenPlayersQuery,
    response: warden.wardenPlayerPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'get',
    path: '/api/warden/admin/players/{userId}',
    tag: TAGS.wardenAdmin,
    summary: 'One player',
    description: 'Accounts, username history, bans, notes, sessions and audit trail.',
    access: 'wardenAdmin',
    params: warden.wardenUserParams,
    response: warden.wardenPlayerDetail,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'patch',
    path: '/api/warden/admin/players/{userId}',
    tag: TAGS.wardenAdmin,
    summary: "Set a player's account limit",
    access: 'wardenAdmin',
    params: warden.wardenUserParams,
    body: warden.wardenPlayerPatchBody,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'put',
    path: '/api/warden/admin/players/{userId}/role',
    tag: TAGS.wardenAdmin,
    summary: 'Give or remove the warden-admin role',
    description: "Site admins only: Warden admins can't make more Warden admins.",
    access: 'admin',
    params: warden.wardenUserParams,
    body: warden.wardenRoleBody,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/warden/admin/players/{userId}/token',
    tag: TAGS.wardenAdmin,
    summary: "Regenerate a player's address",
    description: 'For a leaked address. Signs out their online sessions.',
    access: 'wardenAdmin',
    params: warden.wardenUserParams,
    noContent: true,
  },
  {
    method: 'delete',
    path: '/api/warden/admin/players/{userId}/accounts/{uuid}',
    tag: TAGS.wardenAdmin,
    summary: "Unlink a player's account",
    access: 'wardenAdmin',
    params: warden.wardenUserAccountParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notLinked'] }],
  },
  {
    method: 'post',
    path: '/api/warden/admin/players/{userId}/bans',
    tag: TAGS.wardenAdmin,
    summary: 'Ban a player',
    description: 'Replaces the active ban, if any.',
    access: 'wardenAdmin',
    params: warden.wardenUserParams,
    body: warden.wardenBanBody,
    response: warden.wardenBanView,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/warden/admin/players/{userId}/notes',
    tag: TAGS.wardenAdmin,
    summary: 'Add a note or a warning',
    access: 'wardenAdmin',
    params: warden.wardenUserParams,
    body: warden.wardenNoteBody,
    response: warden.wardenNoteView,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/warden/admin/bans/{banId}/revoke',
    tag: TAGS.wardenAdmin,
    summary: 'Revoke a ban',
    access: 'wardenAdmin',
    params: warden.wardenBanParams,
    body: warden.wardenRevokeBody,
    response: warden.wardenBanView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notBanned'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/admin/appeals',
    tag: TAGS.wardenAdmin,
    summary: 'List appeals',
    description: 'Newest first, with their ban, up to 200.',
    access: 'wardenAdmin',
    query: warden.wardenAppealsQuery,
    response: z.array(warden.wardenAppealListItem),
  },
  {
    method: 'post',
    path: '/api/warden/admin/appeals/{id}/decision',
    tag: TAGS.wardenAdmin,
    summary: 'Answer an appeal',
    access: 'wardenAdmin',
    params: warden.wardenIdParams,
    body: warden.wardenAppealDecisionBody,
    response: warden.wardenAppealView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['appealClosed'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/admin/minecraft/{username}',
    tag: TAGS.wardenAdmin,
    summary: 'Look up a Minecraft username',
    description:
      'The account a username names: its UUID from Mojang for premium accounts, or worked out from the name for cracked ones, and who linked it, if anyone.',
    access: 'wardenAdmin',
    params: warden.wardenMinecraftLookupParams,
    query: warden.wardenMinecraftLookupQuery,
    response: warden.wardenMinecraftLookup,
    problems: [
      { status: 404, problems: ['unknownMinecraftUsername'] },
      { status: 502, problems: ['mojangUnavailable'] },
    ],
  },
  {
    method: 'post',
    path: '/api/warden/admin/link-requests',
    tag: TAGS.wardenAdmin,
    summary: 'Make a link code by hand',
    description:
      "For a player who can't get one from the server. With `userId`, only that player can use it.",
    access: 'wardenAdmin',
    body: warden.wardenManualLinkBody,
    response: warden.wardenManualLinkView,
    problems: [
      { status: 403, problems: ['schoolNotAllowed', 'crackedNotAllowed', 'banned'] },
      { status: 404, problems: ['unknownMinecraftUsername', 'notFound'] },
      { status: 409, problems: ['alreadyLinked'] },
      { status: 502, problems: ['mojangUnavailable'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/admin/link-requests',
    tag: TAGS.wardenAdmin,
    summary: 'Codes made by hand',
    description: "The last 7 days, with who made them, who they're for and whether they were used.",
    access: 'wardenAdmin',
    response: z.array(warden.wardenManualLinkView),
  },
  {
    method: 'delete',
    path: '/api/warden/admin/link-requests/{id}',
    tag: TAGS.wardenAdmin,
    summary: 'Cancel a code made by hand',
    description: "While it's still waiting. Returns the cancelled code.",
    access: 'wardenAdmin',
    params: warden.wardenIdParams,
    response: warden.wardenManualLinkView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['linkRequestClosed'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/admin/users',
    tag: TAGS.wardenAdmin,
    summary: 'Search LNB players',
    description: "Players of Warden's schools, by name or email, to make a code for.",
    access: 'wardenAdmin',
    query: warden.wardenUserSearchQuery,
    response: z.array(warden.wardenUserOption),
  },
  {
    method: 'get',
    path: '/api/warden/admin/audit',
    tag: TAGS.wardenAdmin,
    summary: 'Audit log',
    description: 'Newest first. `cursor` is the `nextCursor` of the previous page.',
    access: 'wardenAdmin',
    query: warden.wardenAuditQuery,
    response: warden.wardenAuditPage,
  },
  {
    method: 'get',
    path: '/api/warden/admin/settings',
    tag: TAGS.wardenAdmin,
    summary: 'Warden settings',
    access: 'wardenAdmin',
    response: warden.wardenSettingsView,
  },
  {
    method: 'patch',
    path: '/api/warden/admin/settings',
    tag: TAGS.wardenAdmin,
    summary: 'Change Warden settings',
    description: 'Sends a `settings` event to the Minecraft server.',
    access: 'wardenAdmin',
    body: warden.wardenSettingsPatchBody,
    response: warden.wardenSettingsView,
  },
  // Mod list
  {
    method: 'get',
    path: '/api/minecraft/mods',
    tag: TAGS.mods,
    summary: 'The mod list',
    description:
      "Both tabs, sorted by score then newest, with the settings the page shows. Signed in, it adds the viewer's votes, their suggestions left, and the removal notices they haven't dismissed. Removed suggestions are left out.",
    access: 'public',
    response: mods.modListPage,
  },
  {
    method: 'get',
    path: '/api/minecraft/mods/search',
    tag: TAGS.mods,
    summary: 'Search Modrinth and CurseForge',
    description:
      "Modrinth first, then CurseForge mods that aren't on Modrinth (only when the site has a CurseForge key). Each result says whether it can be added. Cached for an hour, and limited to 20 searches a minute per account.",
    access: 'user',
    query: mods.modSearchQuery,
    response: mods.modSearchResults,
    problems: [
      { status: 429, problems: ['rateLimited'] },
      { status: 502, problems: ['sourceUnavailable'] },
    ],
  },
  {
    method: 'get',
    path: '/api/minecraft/mods/catalog-icon',
    tag: TAGS.mods,
    summary: "A search result's icon",
    description:
      "The `iconUrl` of search results: the site fetches the icon from Modrinth's or CurseForge's image host, and nowhere else, so visitors never contact them. Cached for a day.",
    access: 'user',
    query: mods.modCatalogIconQuery,
    response: {
      description: 'The icon: PNG, JPEG, WebP or GIF.',
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
    },
    problems: [{ status: 404, problems: [] }],
  },
  {
    method: 'post',
    path: '/api/minecraft/mods',
    tag: TAGS.mods,
    summary: 'Suggest a mod',
    description:
      'Adds a mod from a search result to the Suggestions tab. The project is fetched again, so its details and compatibility come from the source. Each account can have `maxSuggestions` suggestions in the list, removed ones included.',
    access: 'user',
    body: mods.modSuggestBody,
    response: mods.modCreated,
    created: true,
    problems: [
      { status: 403, problems: ['banned'] },
      { status: 404, problems: ['notFound'] },
      {
        status: 409,
        problems: ['closed', 'limitReached', 'duplicate', 'removed', 'incompatible'],
      },
      { status: 502, problems: ['sourceUnavailable'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/minecraft/mods/{id}',
    tag: TAGS.mods,
    summary: 'Edit the reason of your suggestion',
    description: 'The votes stay.',
    access: 'user',
    params: mods.modIdParams,
    body: mods.modReasonBody,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'delete',
    path: '/api/minecraft/mods/{id}',
    tag: TAGS.mods,
    summary: 'Withdraw your suggestion',
    description:
      "Deletes it with its votes, which frees the slot and the mod. Removed suggestions can't be withdrawn.",
    access: 'user',
    params: mods.modIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'put',
    path: '/api/minecraft/mods/{id}/vote',
    tag: TAGS.mods,
    summary: 'Vote on a mod',
    description: '1 or -1 sets the vote, 0 clears it. Nobody can vote on their own suggestion.',
    access: 'user',
    params: mods.modIdParams,
    body: mods.modVoteBody,
    response: mods.modVoteResult,
    problems: [
      { status: 403, problems: ['banned', 'ownMod'] },
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['closed'] },
    ],
  },
  {
    method: 'post',
    path: '/api/minecraft/mods/{id}/dismiss-removal',
    tag: TAGS.mods,
    summary: 'Dismiss a removal notice',
    access: 'user',
    params: mods.modIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'get',
    path: '/api/minecraft/mods/{id}/icon',
    tag: TAGS.mods,
    summary: "A mod's icon",
    description:
      'Downloaded once by the site when the mod was added, so visitors never contact the source. Cached for a year.',
    access: 'public',
    params: mods.modIdParams,
    response: {
      description: 'The icon: PNG, JPEG, WebP or GIF.',
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
    },
  },

  // Mod list: admins
  {
    method: 'get',
    path: '/api/minecraft/admin/settings',
    tag: TAGS.modsAdmin,
    summary: 'Mod list settings',
    access: 'wardenAdmin',
    response: mods.modSettingsView,
  },
  {
    method: 'patch',
    path: '/api/minecraft/admin/settings',
    tag: TAGS.modsAdmin,
    summary: 'Change the mod list settings',
    description: "Changing the version or loader doesn't re-check the mods already in the list.",
    access: 'wardenAdmin',
    body: mods.modSettingsPatchBody,
    response: mods.modSettingsView,
  },
  {
    method: 'get',
    path: '/api/minecraft/admin/mods',
    tag: TAGS.modsAdmin,
    summary: 'Mods of one tab',
    description: 'By score, with who suggested each one.',
    access: 'wardenAdmin',
    query: mods.modAdminQuery,
    response: mods.modAdminList,
  },
  {
    method: 'post',
    path: '/api/minecraft/admin/mods',
    tag: TAGS.modsAdmin,
    summary: 'Add an official mod',
    description:
      'From a search result, checked like a suggestion, or by hand for mods on neither source.',
    access: 'wardenAdmin',
    body: mods.modAddBody,
    response: mods.modCreated,
    created: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['duplicate', 'removed', 'incompatible'] },
      { status: 502, problems: ['sourceUnavailable'] },
    ],
  },
  {
    method: 'post',
    path: '/api/minecraft/admin/mods/{id}/promote',
    tag: TAGS.modsAdmin,
    summary: 'Add a suggestion to the official list',
    description: 'Keeps its votes and its proposer, and frees their slot.',
    access: 'wardenAdmin',
    params: mods.modIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notSuggestion'] }],
  },
  {
    method: 'post',
    path: '/api/minecraft/admin/mods/{id}/remove',
    tag: TAGS.modsAdmin,
    summary: 'Remove a suggestion',
    description:
      "Hides it, and shows the reason to its proposer. The mod can't be suggested again until it's restored, and it still counts toward the proposer's limit.",
    access: 'wardenAdmin',
    params: mods.modIdParams,
    body: mods.modRemoveBody,
    noContent: true,
    problems: [{ status: 404, problems: ['notSuggestion'] }],
  },
  {
    method: 'post',
    path: '/api/minecraft/admin/mods/{id}/restore',
    tag: TAGS.modsAdmin,
    summary: 'Restore a removed suggestion',
    access: 'wardenAdmin',
    params: mods.modIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'delete',
    path: '/api/minecraft/admin/mods/{id}',
    tag: TAGS.modsAdmin,
    summary: 'Delete an official mod',
    description: 'Deletes it with its votes.',
    access: 'wardenAdmin',
    params: mods.modIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notOfficial'] }],
  },
];

const ACCESS: Record<Access, { security?: OpenApiObject[]; note?: string; errors: Problem[] }> = {
  public: { security: [], errors: [] },
  user: {
    security: [{ session: [] }],
    errors: [{ status: 401, problems: [] }],
  },
  wardenAdmin: {
    security: [{ session: [] }],
    note: 'Warden admins and site admins only.',
    errors: [
      { status: 401, problems: [] },
      { status: 403, problems: [] },
    ],
  },
  admin: {
    security: [{ session: [] }],
    note: 'Site admins only.',
    errors: [
      { status: 401, problems: [] },
      { status: 403, problems: [] },
    ],
  },
  wardenServer: {
    security: [{ wardenServer: [] }],
    errors: [{ status: 401, problems: [] }],
  },
};

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
};

// The body of every error from our routes (h3's format). Better Auth's routes have their own.
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'boolean', const: true },
    url: { type: 'string' },
    statusCode: { type: 'integer' },
    statusMessage: {
      type: 'string',
      description: 'The problem code when there is one, else the status text.',
    },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'Why the request was refused.' },
      },
    },
  },
  required: ['error', 'statusCode', 'statusMessage', 'message'],
};

/** Component names by schema, for $refs. */
function namesOf(schemas: Record<string, z.ZodType>): Map<z.ZodType, string> {
  return new Map(Object.entries(schemas).map(([name, schema]) => [schema, name]));
}

const requestNames = namesOf(requestSchemas);
const responseNames = namesOf(responseSchemas);

/** Named schemas as JSON Schema, with $refs between them. */
function components(schemas: Record<string, z.ZodType>, io: 'input' | 'output') {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(schemas)) registry.add(schema, { id });
  const { schemas: json } = z.toJSONSchema(registry, {
    io,
    uri: (id) => `#/components/schemas/${id}`,
  });
  return Object.fromEntries(
    Object.entries(json).map(([id, { $id: _id, $schema: _schema, ...schema }]) => [id, schema]),
  );
}

/** A schema reference, or an inline schema for one-offs such as arrays of a named schema. */
function schemaFor(
  schema: z.ZodType,
  names: Map<z.ZodType, string>,
  io: 'input' | 'output',
): OpenApiObject {
  const name = names.get(schema);
  if (name) return { $ref: `#/components/schemas/${name}` };
  if (schema instanceof z.ZodArray && names.has(schema.element as z.ZodType)) {
    return { type: 'array', items: schemaFor(schema.element as z.ZodType, names, io) };
  }
  const { $schema: _schema, ...json } = z.toJSONSchema(schema, { io });
  return json;
}

function parameters(location: 'path' | 'query', schema: z.ZodObject | undefined) {
  if (!schema) return [];
  const json = z.toJSONSchema(schema, { io: 'input' }) as {
    properties?: Record<string, OpenApiObject>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, { description, ...property }]) => ({
    name,
    in: location,
    required: location === 'path' || (json.required?.includes(name) ?? false),
    ...(description ? { description } : {}),
    schema: property,
  }));
}

function errorResponses(route: RouteDoc) {
  const byStatus = new Map<number, Set<string>>();
  const add = ({ status, problems }: Problem) => {
    const set = byStatus.get(status) ?? new Set<string>();
    for (const problem of problems) set.add(problem);
    byStatus.set(status, set);
  };
  // Invalid parameters are a 404, and an invalid body or query a 400 (server/utils/validation.ts).
  if (route.body || route.query) add({ status: 400, problems: [] });
  if (route.params) add({ status: 404, problems: [] });
  ACCESS[route.access].errors.forEach(add);
  route.problems?.forEach(add);

  return Object.fromEntries(
    [...byStatus.entries()]
      .sort(([a], [b]) => a - b)
      .map(([status, problems]) => [
        String(status),
        {
          description: problems.size
            ? `${STATUS_TEXT[status] ?? 'Error'}. Problems: ${[...problems].map((p) => `\`${p}\``).join(', ')}.`
            : (STATUS_TEXT[status] ?? 'Error'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      ]),
  );
}

function operation(route: RouteDoc) {
  const access = ACCESS[route.access];
  const success = route.noContent
    ? { 204: { description: 'No Content' } }
    : route.response instanceof z.ZodType
      ? {
          [route.created ? 201 : 200]: {
            description: route.created ? 'Created' : 'OK',
            content: {
              'application/json': { schema: schemaFor(route.response, responseNames, 'output') },
            },
          },
        }
      : { 200: route.response ?? { description: 'OK' } };

  return {
    tags: [route.tag],
    summary: route.summary,
    description: [route.description, access.note].filter(Boolean).join('\n\n') || undefined,
    operationId: `${route.method}${route.path.replace(/[^a-z\d]+(.)?/gi, (_, c?: string) => c?.toUpperCase() ?? '')}`,
    security: access.security,
    parameters: [
      ...parameters('path', route.params),
      ...parameters('query', route.query),
      ...Object.entries(route.headers ?? {}).map(([name, header]) => ({
        name,
        in: 'header',
        ...header,
      })),
    ],
    requestBody: route.body
      ? {
          required: true,
          content: {
            'application/json': { schema: schemaFor(route.body, requestNames, 'input') },
          },
        }
      : undefined,
    responses: { ...success, ...errorResponses(route) },
  };
}

/** The routes this document covers, as `METHOD /path`, for the coverage test. */
export function documentedRoutes(): string[] {
  return routes.map((route) => `${route.method.toUpperCase()} ${route.path}`);
}

/** The parts of Better Auth's generated document that we use. */
export interface AuthOpenApi {
  /** Operations by method, by path. */
  paths: Record<string, object>;
  components: { schemas: Record<string, unknown> };
}

const DESCRIPTION = `
The API of the La Nuit Blanche website. Everything is JSON unless a route says otherwise.

## Authentication

| Caller | How |
| --- | --- |
| Signed-in users | The site session cookie, set by signing in with Microsoft on \`/sign-in\` |
| Admins | The same cookie, on an account with the \`admin\` or \`warden-admin\` role |
| The Minecraft server | \`Authorization: Bearer <WARDEN_SERVER_SECRET>\` |

To try a route that needs a session from this page, sign in on the site in the same browser first.

## Conventions

- Dates are ISO 8601 strings in UTC. UUIDs are written with dashes.
- Errors have an HTTP status, and a \`data.problem\` code when the reason matters. Each route lists its codes.
- An invalid body or query is a 400, and an invalid path parameter a 404.
- Lists take \`cursor\` and return \`{ items, nextCursor }\`, with \`nextCursor\` null on the last page.

Warden's flows are described in \`docs/warden.md\`, and sign-in and app linking in \`docs/authentication.md\`.
`.trim();

const AUTH_TAG_DESCRIPTION =
  "Better Auth's routes, under `/api/auth`. Sign-in is Microsoft only: the email and password routes are listed by Better Auth but are turned off, and answer with an error.";

/** OpenAPI 3.0's `nullable`, which Better Auth still writes in places, as a 3.1 type. */
function withoutNullable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNullable);
  if (!value || typeof value !== 'object') return value;
  const { nullable, ...rest } = value as OpenApiObject;
  const object = Object.fromEntries(
    Object.entries(rest).map(([key, child]) => [key, withoutNullable(child)]),
  );
  if (nullable === true && typeof object.type === 'string') object.type = [object.type, 'null'];
  return object;
}

/** The full OpenAPI document: our routes, then Better Auth's under /api/auth. */
export function buildOpenApiDocument(authDocument: AuthOpenApi) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    paths[route.path] = { ...paths[route.path], [route.method]: operation(route) };
  }

  for (const [path, operations] of Object.entries(authDocument.paths)) {
    paths[`/api/auth${path}`] = Object.fromEntries(
      Object.entries(operations as Record<string, OpenApiObject>).map(([method, op]) => [
        method,
        {
          ...(withoutNullable(op) as OpenApiObject),
          // Better Auth only writes descriptions, which read as summaries in the sidebar.
          summary: op.summary ?? (op.description as string | undefined)?.replace(/\.$/, '') ?? path,
          tags: ((op.tags as string[] | undefined) ?? ['Default']).map(
            (tag) => AUTH_TAGS[tag] ?? `Auth: ${tag}`,
          ),
          // Better Auth lists its bearer scheme, but the bearer plugin is off: it's the cookie.
          security: op.security ? [{ session: [] }] : undefined,
        },
      ]),
    );
  }

  return {
    openapi: '3.1.1',
    info: {
      title: 'La Nuit Blanche API',
      version: '2',
      description: DESCRIPTION,
      license: { name: 'AGPL-3.0-or-later', identifier: 'AGPL-3.0-or-later' },
    },
    tags: [
      { name: TAGS.health },
      { name: TAGS.reference },
      { name: TAGS.link, description: 'Linking apps to an account with a 6-digit code.' },
      { name: TAGS.admin, description: 'The admin area at `/admin`. Site admins only.' },
      { name: TAGS.wardenServer, description: 'Called by the LNB Minecraft server only.' },
      { name: TAGS.wardenPlayer, description: 'The `/minecraft/warden` and `/link` pages.' },
      {
        name: TAGS.wardenAdmin,
        description: 'The Warden section of the admin area, `/admin/warden`.',
      },
      { name: TAGS.mods, description: 'The `/minecraft/mod-list` page. See `docs/mods.md`.' },
      {
        name: TAGS.modsAdmin,
        description: 'The Mods section of the admin area, `/admin/mods`.',
      },
      { name: TAGS.auth, description: AUTH_TAG_DESCRIPTION },
      {
        name: TAGS.authDevice,
        description:
          'Codes for apps, entered on `/link` ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)). Approving goes through `POST /api/link/approve`.',
      },
    ],
    'x-tagGroups': [
      { name: 'Site', tags: [TAGS.health, TAGS.link, TAGS.admin, TAGS.reference] },
      { name: 'Auth', tags: [TAGS.auth, TAGS.authDevice] },
      { name: 'Warden', tags: [TAGS.wardenServer, TAGS.wardenPlayer, TAGS.wardenAdmin] },
      { name: 'Minecraft', tags: [TAGS.mods, TAGS.modsAdmin] },
    ],
    paths,
    components: {
      schemas: {
        ...(withoutNullable(authDocument.components.schemas) as OpenApiObject),
        ...components(requestSchemas, 'input'),
        ...components(responseSchemas, 'output'),
        Error: errorSchema,
      } as Record<string, unknown>,
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'better-auth.session_token',
          description:
            'The site session cookie. Over HTTPS it is named `__Secure-better-auth.session_token`.',
        },
        wardenServer: {
          type: 'http',
          scheme: 'bearer',
          description: 'The Minecraft server, with `WARDEN_SERVER_SECRET`.',
        },
      },
    },
  };
}
