import { z } from 'zod';

import type { ApiKeyPermission } from '../../shared/api-keys.ts';
import * as admin from '../../shared/schemas/admin.ts';
import * as apiKeys from '../../shared/schemas/api-keys.ts';
import { avatarParams } from '../../shared/schemas/avatars.ts';
import * as economy from '../../shared/schemas/economy.ts';
import * as eventTeams from '../../shared/schemas/event-teams.ts';
import * as events from '../../shared/schemas/events.ts';
import * as flags from '../../shared/schemas/flags.ts';
import { linkApproveBody, linkApproveResult, linkDenyBody } from '../../shared/schemas/link.ts';
import * as mods from '../../shared/schemas/mods.ts';
import * as partnerEvents from '../../shared/schemas/partner-events.ts';
import * as partners from '../../shared/schemas/partners.ts';
import * as posters from '../../shared/schemas/posters.ts';
import * as push from '../../shared/schemas/push.ts';
import * as rateLimit from '../../shared/schemas/rate-limit.ts';
import * as shortLinks from '../../shared/schemas/short-links.ts';
import * as team from '../../shared/schemas/team.ts';
import * as warden from '../../shared/schemas/warden.ts';

// The OpenAPI document behind the API reference at /api/docs. Schemas come from the shared Zod
// contracts, so they can't drift from the code. Every route in server/api/ needs an entry in
// `routes` below: test/unit/openapi.test.ts fails otherwise.
// No Nuxt imports, so unit tests can load it. Better Auth's part is passed in by the route.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Who may call a route. */
type Access =
  | 'public'
  | 'user'
  | 'wardenAdmin'
  | 'eventsManager'
  | 'economyAdmin'
  | 'admin'
  | 'wardenServer'
  | 'wardenClient';

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
  /** The API key permission that also lets a caller in (see `requireAccess`). */
  key?: ApiKeyPermission;
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
  ApiKeyBody: apiKeys.apiKeyBody,
  ApiKeyRotateBody: apiKeys.apiKeyRotateBody,
  AdminBanBody: admin.adminBanBody,
  AdminBulkBody: admin.adminBulkBody,
  FlagPatchBody: flags.flagPatchBody,
  RateLimitModeBody: rateLimit.rateLimitModeBody,
  LinkApproveBody: linkApproveBody,
  LinkDenyBody: linkDenyBody,
  EconomyCreateBody: economy.economyCreateBody,
  EconomyMePatchBody: economy.economyMePatchBody,
  EconomyInviteBody: economy.economyInviteBody,
  EconomyTransferBody: economy.economyTransferBody,
  EconomyAdjustBody: economy.economyAdjustBody,
  EconomyFreezeBody: economy.economyFreezeBody,
  EconomySettingsBody: economy.economySettingsBody,
  WardenIssuer: warden.wardenIssuer,
  WardenClientLinkRequestBody: warden.wardenClientLinkRequestBody,
  WardenClientPollBody: warden.wardenClientPollBody,
  WardenJoinTicketBody: warden.wardenJoinTicketBody,
  WardenPresenceBody: warden.wardenPresenceBody,
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
  ModVoteBody: mods.modVoteBody,
  ModSuggestBody: mods.modSuggestBody,
  ModReasonBody: mods.modReasonBody,
  ModAddBody: mods.modAddBody,
  ModAdminPatchBody: mods.modAdminPatchBody,
  ModConvertBody: mods.modConvertBody,
  ModRemoveBody: mods.modRemoveBody,
  ModRefreshBody: mods.modRefreshBody,
  ModSettingsPatchBody: mods.modSettingsPatchBody,
  EventRoomBody: events.eventRoomBody,
  EventRoomPatchBody: events.eventRoomPatchBody,
  EventTypeBody: events.eventTypeBody,
  EventTypePatchBody: events.eventTypePatchBody,
  EventBody: events.eventBody,
  EventDuplicateBody: events.eventDuplicateBody,
  EventTeamCreateBody: eventTeams.eventTeamCreateBody,
  EventTeamPatchBody: eventTeams.eventTeamPatchBody,
  EventTeamCaptainBody: eventTeams.eventTeamCaptainBody,
  EventLookingBody: eventTeams.eventLookingBody,
  EventRegistrationAddBody: events.eventRegistrationAddBody,
  EventImageImportBody: events.eventImageImportBody,
  EventImageInput: events.eventImageInput,
  PushSubscribeBody: push.pushSubscribeBody,
  PushUnsubscribeBody: push.pushUnsubscribeBody,
  PushLocaleBody: push.pushLocaleBody,
  PushPreferencesPatch: push.pushPreferencesPatch,
  PushSettings: push.pushSettings,
  PushImpactBody: push.pushImpactBody,
  PartnerBody: partners.partnerBody,
  PartnerInterestBody: partnerEvents.partnerInterestBody,
  PartnerPatchBody: partners.partnerPatchBody,
  PartnerMoveBody: partners.partnerMoveBody,
  PartnerSettingsBody: partners.partnerSettingsBody,
  ShortLinkBody: shortLinks.shortLinkBody,
  ShortLinkPatchBody: shortLinks.shortLinkPatchBody,
  TeamMePatch: team.teamMePatch,
  TeamPoleBody: team.teamPoleBody,
  TeamPolePatchBody: team.teamPolePatchBody,
  TeamMemberBody: team.teamMemberBody,
  TeamMemberPatchBody: team.teamMemberPatchBody,
  TeamMoveBody: team.teamMoveBody,
  TeamSettingsBody: team.teamSettingsBody,
};

const responseSchemas = {
  EconomyAccountView: economy.economyAccountView,
  EconomyMe: economy.economyMe,
  EconomyAccountDetail: economy.economyAccountDetail,
  EconomyTransactionPage: economy.economyTransactionPage,
  EconomyBaltop: economy.economyBaltop,
  EconomyServerPlayer: economy.economyServerPlayer,
  EconomyServerAccount: economy.economyServerAccount,
  EconomyTransferResult: economy.economyTransferResult,
  EconomyStats: economy.economyStats,
  EconomyBalanceHistory: economy.economyBalanceHistory,
  EconomyAdminAccountPage: economy.economyAdminAccountPage,
  EconomyAdminAccountDetail: economy.economyAdminAccountDetail,
  EconomyLedgerPage: economy.economyLedgerPage,
  EconomySettingsView: economy.economySettingsView,
  EconomyExport: economy.economyExport,
  AdminOverview: admin.adminOverview,
  AdminAuditView: admin.adminAuditView,
  AdminUserRow: admin.adminUserRow,
  AdminUserPage: admin.adminUserPage,
  AdminBulkResult: admin.adminBulkResult,
  FlagStates: flags.flagStates,
  AdminFlagList: flags.adminFlagList,
  AdminRateLimit: rateLimit.adminRateLimit,
  LinkApproveResult: linkApproveResult,
  WardenClientLinkRequest: warden.wardenClientLinkRequest,
  WardenClientPoll: warden.wardenClientPoll,
  WardenClientMe: warden.wardenClientMe,
  WardenJoinTicket: warden.wardenJoinTicket,
  WardenDeviceView: warden.wardenDeviceView,
  WardenDeviceList: warden.wardenDeviceList,
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
  WardenServerPlayer: warden.wardenServerPlayer,
  WardenPlayerRow: warden.wardenPlayerRow,
  WardenPlayerPage: warden.wardenPlayerPage,
  WardenAuditView: warden.wardenAuditView,
  WardenAuditPage: warden.wardenAuditPage,
  WardenPlayerDetail: warden.wardenPlayerDetail,
  WardenSettingsView: warden.wardenSettingsView,
  WardenEvent: warden.wardenEvent,
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
  ModRefreshCheck: mods.modRefreshCheck,
  EventRoomView: events.eventRoomView,
  EventRoomList: events.eventRoomList,
  EventTypeView: events.eventTypeView,
  EventTypeList: events.eventTypeList,
  EventAdminRow: events.eventAdminRow,
  EventAdminList: events.eventAdminList,
  EventAdminView: events.eventAdminView,
  EventCreated: events.eventCreated,
  EventSummary: events.eventSummary,
  EventList: events.eventList,
  EventView: events.eventView,
  EventRegistrationResult: events.eventRegistrationResult,
  MyEventList: events.myEventList,
  EventTeamsView: eventTeams.eventTeamsView,
  EventTeamView: eventTeams.eventTeamView,
  EventTeamCreated: eventTeams.eventTeamCreated,
  EventTeamInviteBody: eventTeams.eventTeamInviteBody,
  EventInviteAnswerBody: eventTeams.eventInviteAnswerBody,
  EventPlayerOptions: eventTeams.eventPlayerOptions,
  AdminTeamsView: eventTeams.adminTeamsView,
  AdminTeamCreateBody: eventTeams.adminTeamCreateBody,
  AdminTeamPatchBody: eventTeams.adminTeamPatchBody,
  AdminTeamMemberBody: eventTeams.adminTeamMemberBody,
  EventRegistrationRow: events.eventRegistrationRow,
  EventRegistrationList: events.eventRegistrationList,
  EventUserOptions: events.eventUserOptions,
  EventStoredImage: events.eventStoredImage,
  ImageProviders: events.imageProviders,
  BdeSettings: events.bdeSettings,
  ProviderGames: events.providerGames,
  ProviderImages: events.providerImages,
  PushStatus: push.pushStatusView,
  PushPreferences: push.pushPreferences,
  PushOverview: push.pushOverview,
  PushSubscriberList: push.pushSubscriberList,
  PushImpact: push.pushImpactView,
  PushAnnounced: push.pushAnnounced,
  PartnerEvent: partnerEvents.partnerEventView,
  PartnersPublic: partners.partnerPublicView,
  PartnersAdmin: partners.partnerAdminView,
  PartnerLogo: partners.partnerLogoView,
  PartnerSettings: partners.partnerSettingsView,
  ApiKeyList: apiKeys.apiKeyList,
  ApiKeyDetail: apiKeys.apiKeyDetail,
  ApiKeyCreated: apiKeys.apiKeyCreated,
  ShortLinksAdmin: shortLinks.shortLinkList,
  ShortLinkDetail: shortLinks.shortLinkDetail,
  ShortLinkPublic: shortLinks.shortLinkPublic,
  PosterView: posters.posterView,
  PosterList: posters.posterList,
  PosterEvent: posters.posterEvent,
  TeamPublic: team.teamPublicView,
  TeamMe: team.teamMeView,
  TeamAdmin: team.teamAdminView,
  TeamSettings: team.teamSettingsView,
  TeamUserOptions: team.teamUserOptions,
};

const TAGS = {
  health: 'Health',
  users: 'Users',
  reference: 'API reference',
  link: 'App linking',
  admin: 'Admin',
  flags: 'Feature flags',
  wardenServer: 'Warden: Minecraft server',
  economy: 'Economy: players',
  economyServer: 'Economy: Minecraft server',
  economyAdmin: 'Economy: admins',
  wardenClient: 'Warden: clients',
  wardenPlayer: 'Warden: players',
  wardenAdmin: 'Warden: admins',
  mods: 'Mod list',
  modsAdmin: 'Mod list: admins',
  events: 'Events',
  eventsAdmin: 'Events: managers',
  push: 'Push notifications',
  pushAdmin: 'Push: admins',
  team: 'Team',
  teamAdmin: 'Team: admins',
  partners: 'Partners',
  partnerEvents: 'Partner events',
  partnersAdmin: 'Partners: admins',
  partnerEventsAdmin: 'Partner events: managers',
  shortLinks: 'Short links',
  shortLinksAdmin: 'Short links: managers',
  postersAdmin: 'Posters: managers',
  apiKeysAdmin: 'API keys: admins',
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
    summary: 'Health check',
    description:
      'For Coolify. Answers 200 once the startup migration is done and the database responds, and 503 before that or if either fails.',
    access: 'public',
    response: z.object({ status: z.literal('ok') }),
    problems: [{ status: 503, problems: ['migrating', 'migrationFailed', 'database'] }],
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
    ],
  },
  {
    method: 'post',
    path: '/api/link/deny',
    tag: TAGS.link,
    summary: 'Deny a link code',
    description:
      "Refuses the code the signed-in account claimed, so the app stops waiting. Replaces Better Auth's `/device/deny`, so the denial of a Warden device is recorded like its approval.",
    access: 'user',
    body: linkDenyBody,
    noContent: true,
    problems: [{ status: 400, problems: ['unknown', 'expired', 'used'] }],
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
    path: '/api/admin/rate-limit',
    tag: TAGS.admin,
    summary: 'Rate limiting mode',
    description: 'The mode (`normal`, `event` or `off`), who last changed it and when.',
    access: 'admin',
    response: rateLimit.adminRateLimit,
  },
  {
    method: 'put',
    path: '/api/admin/rate-limit',
    tag: TAGS.admin,
    summary: 'Set the rate limiting mode',
    description:
      '`event` multiplies the per-IP ceilings by 5 and keeps the per-account limits. `off` applies no limit. Takes effect at once on this instance and within 10 seconds on the others.',
    access: 'admin',
    body: rateLimit.rateLimitModeBody,
    response: rateLimit.adminRateLimit,
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
    method: 'post',
    path: '/api/admin/users/bulk',
    tag: TAGS.admin,
    summary: 'Act on many accounts',
    description:
      "Signs out, bans, unbans, deletes or changes the Warden-admin, events-manager or economy-admin role of many accounts, picked by ID or by the Users list's filters. The rules of the single-account routes apply to each account, and one that can't take the action is skipped, not failed: admins and the caller for `ban` and `delete`, accounts not banned for `unban`, accounts that already have the role (or lack it) for `roles`. Every change is logged as for a single account. With `dryRun`, nothing changes and the result says who the action would apply to.",
    access: 'admin',
    body: admin.adminBulkBody,
    response: admin.adminBulkResult,
    problems: [{ status: 400, problems: ['tooMany'] }],
  },
  {
    method: 'put',
    path: '/api/admin/users/{userId}/roles',
    tag: TAGS.admin,
    summary: "Set an account's roles",
    description:
      "Sets `admin`, `warden-admin`, `events-manager` and `economy-admin` together. Admins can't remove their own admin role.",
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

  // Warden: clients (the LNB Warden mod)
  {
    method: 'post',
    path: '/api/warden/client/link-requests',
    tag: TAGS.wardenClient,
    summary: 'Ask to link a device',
    description:
      'Starts linking a device to an LNB account. The mod shows `userCode`, or opens `verificationUriComplete`; the player approves or denies it on `/link`, and the mod polls with `pollSecret`. The code is 6 digits, valid for 10 minutes and single use. Limited per IP.',
    access: 'public',
    body: warden.wardenClientLinkRequestBody,
    response: warden.wardenClientLinkRequest,
  },
  {
    method: 'post',
    path: '/api/warden/client/link-requests/{id}/poll',
    tag: TAGS.wardenClient,
    summary: 'Poll a device link request',
    description:
      'Answers `pending`, `denied` or `expired`, or once approved `approved` with the device `token`, exactly once: the device is created then, and later polls answer `expired`. An approved request can be collected for 5 minutes after its code expired. A wrong `pollSecret` looks like an unknown request. Polling more often than `interval` seconds gets a 429 `slowDown`.',
    access: 'public',
    params: warden.wardenIdParams,
    body: warden.wardenClientPollBody,
    response: warden.wardenClientPoll,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 429, problems: ['slowDown'] },
    ],
  },
  {
    method: 'get',
    path: '/api/warden/client/me',
    tag: TAGS.wardenClient,
    summary: 'The signed-in player',
    description:
      "The player's name, linked accounts, limit and active ban, and the calling device.",
    access: 'wardenClient',
    response: warden.wardenClientMe,
  },
  {
    method: 'post',
    path: '/api/warden/client/join-tickets',
    tag: TAGS.wardenClient,
    summary: 'Get a ticket to join the server',
    description:
      'A single-use ticket, valid for 60 seconds, bound to the device, its owner, `nonce`, `username` and `link`. The mod sends it to the Minecraft server, which presents it to `POST /api/warden/server/login`. Bans and links are decided there, not here. Limited to 10 a minute per device.',
    access: 'wardenClient',
    body: warden.wardenJoinTicketBody,
    response: warden.wardenJoinTicket,
    problems: [{ status: 429, problems: ['rateLimited'] }],
  },
  {
    method: 'put',
    path: '/api/warden/client/presence',
    tag: TAGS.wardenClient,
    summary: 'Show the player in the menu',
    description:
      'Tells the site the player is in the mod’s menu. It holds for 3 minutes, so the mod sends it again while the menu is open. A player on the server counts as on the server.',
    access: 'wardenClient',
    body: warden.wardenPresenceBody,
    noContent: true,
  },
  {
    method: 'delete',
    path: '/api/warden/client/presence',
    tag: TAGS.wardenClient,
    summary: 'Clear the menu presence',
    access: 'wardenClient',
    noContent: true,
  },
  {
    method: 'post',
    path: '/api/warden/client/sign-out',
    tag: TAGS.wardenClient,
    summary: 'Sign this device out',
    description:
      'Revokes the calling device. Its sessions on the Minecraft server are kicked with the reason `deviceRevoked`.',
    access: 'wardenClient',
    noContent: true,
  },
  // Warden: Minecraft server
  {
    method: 'post',
    path: '/api/warden/server/login',
    tag: TAGS.wardenServer,
    summary: 'Let a player join',
    description:
      'Called when a player joins, with the `ticket` their mod got from `POST /api/warden/client/join-tickets`. The server runs in offline mode, so `uuid` must be the offline UUID of `username` (`UUID.nameUUIDFromBytes(("OfflinePlayer:" + username).getBytes(UTF_8))`, case-sensitive), else the answer is a 400 `invalidUuid`. The ticket is used up whatever the outcome. Checks, in order, each stopping with `denied` and its `reason`: `invalidTicket` (unknown, used, expired, another `nonce` or `username`, or its device revoked or expired), `schoolNotAllowed`, `banned` (with `ban`, checked before linking), `linkedElsewhere` (the account belongs to another LNB account), `notLinked` (with `limit`, when the ticket did not ask to link), `accountLimitReached` (with `limit`, when it did). Otherwise the account is linked if the ticket asked to (`linked` is true, recorded as `link`), and `allowed` opens a session for the device.',
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
    path: '/api/warden/me/devices',
    tag: TAGS.wardenPlayer,
    summary: 'My devices',
    description: 'The devices of the LNB Warden mod signed in to the account. Active ones only.',
    access: 'user',
    response: warden.wardenDeviceList,
    problems: [{ status: 403, problems: ['schoolNotAllowed'] }],
  },
  {
    method: 'delete',
    path: '/api/warden/me/devices/{id}',
    tag: TAGS.wardenPlayer,
    summary: 'Revoke one of my devices',
    description:
      'Signs the device out. Its sessions on the Minecraft server are kicked with the reason `deviceRevoked`.',
    access: 'user',
    params: warden.wardenIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
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
      'For `/link`: the device of the LNB Warden mod behind a code the player has claimed, with the name it gave.',
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
      "The account's skin head, 64 px, for linked accounts only. Fetched from Crafatar (or mc-heads.net) and cached for a day, so visitors never contact these services. The server runs in offline mode, so every account gets Steve.",
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
    key: 'warden:read',
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
    key: 'warden:read',
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
    method: 'delete',
    path: '/api/warden/admin/players/{userId}/devices/{deviceId}',
    tag: TAGS.wardenAdmin,
    summary: "Revoke a player's device",
    description:
      'Kicks the device’s sessions on the Minecraft server. Recorded as `device.revoke`.',
    access: 'wardenAdmin',
    params: warden.wardenUserDeviceParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
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
    path: '/api/warden/admin/transfers/{transferId}/dismiss',
    tag: TAGS.wardenAdmin,
    summary: 'Dismiss an account takeover warning',
    description:
      'A takeover is when a player links a Minecraft account that another player had unlinked. The warning shows on both players in the admin until one admin dismisses it. Players never see it. Recorded as `transfer.dismiss`.',
    access: 'wardenAdmin',
    params: warden.wardenTransferParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['alreadyDismissed'] },
    ],
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
    path: '/api/warden/admin/users',
    tag: TAGS.wardenAdmin,
    summary: 'Search LNB players',
    description:
      "Players of Warden's schools, by name or email, for pickers such as the mod editor's.",
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
    method: 'patch',
    path: '/api/minecraft/admin/mods/{id}',
    tag: TAGS.modsAdmin,
    summary: 'Edit a mod',
    description:
      "Changes the reason, which can be emptied, and who suggested the mod (or nobody). Works on any mod. The new proposer's own vote on it is cleared.",
    access: 'wardenAdmin',
    params: mods.modIdParams,
    body: mods.modAdminPatchBody,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/minecraft/admin/mods/{id}/convert',
    tag: TAGS.modsAdmin,
    summary: 'Convert a mod to another source',
    description:
      'Turns a manual mod into a Modrinth or CurseForge one, or the reverse, in place. The votes, proposer, reason, tab and status stay. The details are replaced, checked like adding a mod.',
    access: 'wardenAdmin',
    params: mods.modIdParams,
    body: mods.modConvertBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['duplicate', 'removed', 'incompatible'] },
      { status: 502, problems: ['sourceUnavailable'] },
    ],
  },
  {
    method: 'get',
    path: '/api/minecraft/admin/mods/{id}/refresh',
    tag: TAGS.modsAdmin,
    summary: 'Check what a refresh would change',
    description:
      'Fetches the mod from Modrinth or CurseForge again and lists the differences in its name, summary, page link and icon, and whether it still runs on the server. Writes nothing. Mods added by hand have no source and are refused.',
    access: 'wardenAdmin',
    params: mods.modIdParams,
    response: mods.modRefreshCheck,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['manual'] },
      { status: 502, problems: ['sourceUnavailable'] },
    ],
  },
  {
    method: 'post',
    path: '/api/minecraft/admin/mods/{id}/refresh',
    tag: TAGS.modsAdmin,
    summary: 'Refresh a mod from its source',
    description:
      'Applies the accepted fields. The values come from the source again, not from the request. Fields that no longer differ are skipped.',
    access: 'wardenAdmin',
    params: mods.modIdParams,
    body: mods.modRefreshBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['manual'] },
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
  // Events
  {
    method: 'get',
    path: '/api/events',
    tag: TAGS.events,
    summary: 'Events',
    description:
      'Published events. `upcoming` includes events under way and cancelled ones, which keep their page.',
    access: 'public',
    query: events.eventQuery,
    response: events.eventList,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'get',
    path: '/api/events/{id}',
    tag: TAGS.events,
    summary: 'An event',
    description: 'A draft answers 404, except to events managers.',
    access: 'public',
    params: events.eventIdParams,
    response: events.eventView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/events/{id}/calendar.ics',
    tag: TAGS.events,
    summary: 'Add an event to a calendar',
    description:
      'The event as an iCalendar file. Its UID stays the same, so importing it again updates the entry.',
    access: 'public',
    params: events.eventIdParams,
    response: {
      description: 'The .ics file.',
      content: { 'text/calendar': { schema: { type: 'string' } } },
    },
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 503, problems: ['disabled'] },
    ],
  },

  {
    method: 'post',
    path: '/api/events/{id}/registration',
    tag: TAGS.events,
    summary: 'Register',
    description:
      'Registers the caller, or puts them on the waitlist when the event is full. Registering again changes nothing and returns where they stand. The school and the registration window are checked.',
    access: 'user',
    params: events.eventIdParams,
    response: events.eventRegistrationResult,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['cancelled', 'started', 'notYet', 'closed', 'wrongSchool'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/events/{id}/registration',
    tag: TAGS.events,
    summary: 'Cancel a registration',
    description:
      'Cancels the registration, or leaves the waitlist, until the event starts. The first person waiting gets the place.',
    access: 'user',
    params: events.eventIdParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['started', 'notRegistered'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/events/{id}/teams',
    tag: TAGS.events,
    summary: 'The teams of a tournament',
    description:
      'The teams with their size and place, and the registered players who are in no team and did not hide themselves. Team names and sizes are public; member names and the list of players are for signed-in members and null otherwise.',
    access: 'public',
    params: events.eventIdParams,
    response: eventTeams.eventTeamsView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notTeamEvent'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/events/{id}/teams',
    tag: TAGS.events,
    summary: 'Create a team',
    description:
      'Creates a team with the caller as captain and only member. The caller must be registered, in no team yet, and the roster open (until the registration window closes). The team is validated once it has enough players.',
    access: 'user',
    params: events.eventIdParams,
    body: eventTeams.eventTeamCreateBody,
    response: eventTeams.eventTeamCreated,
    created: true,
    problems: [
      { status: 400, problems: ['invalidTeamName'] },
      { status: 404, problems: ['notFound'] },
      {
        status: 409,
        problems: [
          'notTeamEvent',
          'cancelled',
          'rosterLocked',
          'notRegistered',
          'alreadyInTeam',
          'teamNameTaken',
        ],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/events/{id}/teams/{teamId}',
    tag: TAGS.events,
    summary: 'Rename a team or switch requests',
    description: 'The captain only, until the event starts. Only what is sent changes.',
    access: 'user',
    params: eventTeams.eventTeamParams,
    body: eventTeams.eventTeamPatchBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['invalidTeamName'] },
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['notFound', 'teamNotFound'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled', 'started', 'teamNameTaken'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/events/{id}/teams/{teamId}',
    tag: TAGS.events,
    summary: 'Disband a team',
    description:
      'The captain only, until the event starts. Its players stay registered and look for another team.',
    access: 'user',
    params: eventTeams.eventTeamParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['notFound', 'teamNotFound'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled', 'started'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/events/{id}/team-players',
    tag: TAGS.events,
    summary: 'Find players to invite',
    description:
      'Players matching a name or an email, 3 characters at least, up to 8. Only people who signed in once, of a school the event is open to, in no team of the event, not banned. Shows emails, so it is for signed-in people. Limited to 30 a minute per account.',
    access: 'user',
    params: events.eventIdParams,
    query: eventTeams.eventPlayerSearchQuery,
    response: eventTeams.eventPlayerOptions,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/events/{id}/teams/{teamId}/invites',
    tag: TAGS.events,
    summary: 'Invite a player to a team',
    description:
      'The captain only, until the registration window closes. A team can have at most its free places in pending invitations, and a player at most 10 pending invitations per event. The player is notified if they opted in to team notifications.',
    access: 'user',
    params: eventTeams.eventTeamParams,
    body: eventTeams.eventTeamInviteBody,
    response: eventTeams.eventTeamCreated.extend({ id: z.number() }),
    created: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['notFound', 'teamNotFound', 'userNotFound'] },
      {
        status: 409,
        problems: [
          'notTeamEvent',
          'cancelled',
          'rosterLocked',
          'wrongSchool',
          'alreadyInTeam',
          'teamFull',
          'tooManyInvites',
          'alreadyInvited',
        ],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/events/{id}/teams/{teamId}/requests',
    tag: TAGS.events,
    summary: 'Ask to join a team',
    description:
      'A registered player in no team, until the registration window closes. The team must accept requests and have room. At most 3 requests wait at once. The captain is notified if they opted in.',
    access: 'user',
    params: eventTeams.eventTeamParams,
    response: eventTeams.eventTeamCreated.extend({ id: z.number() }),
    created: true,
    problems: [
      { status: 404, problems: ['notFound', 'teamNotFound'] },
      {
        status: 409,
        problems: [
          'notTeamEvent',
          'cancelled',
          'rosterLocked',
          'notRegistered',
          'alreadyInTeam',
          'requestsClosed',
          'teamFull',
          'alreadyRequested',
          'tooManyRequests',
        ],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/events/{id}/invites/{inviteId}',
    tag: TAGS.events,
    summary: 'Answer an invitation or a request',
    description:
      'The invited player answers an invitation, the captain answers a request. Accepting adds the player to the team, registers them to the event first if they were not (school and window checked), and cancels their other pending invitations and requests. A declined request is answered with a notification, a declined invitation is silent.',
    access: 'user',
    params: eventTeams.eventInviteParams,
    body: eventTeams.eventInviteAnswerBody,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain', 'notYourInvite'] },
      { status: 404, problems: ['notFound', 'inviteNotFound'] },
      {
        status: 409,
        problems: [
          'notTeamEvent',
          'cancelled',
          'rosterLocked',
          'teamFull',
          'alreadyInTeam',
          'closed',
          'notYet',
          'started',
          'wrongSchool',
        ],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/events/{id}/invites/{inviteId}',
    tag: TAGS.events,
    summary: 'Withdraw an invitation or a request',
    description:
      'The captain withdraws an invitation, a player withdraws their own request. Nobody is notified.',
    access: 'user',
    params: eventTeams.eventInviteParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain', 'notYourInvite'] },
      { status: 404, problems: ['notFound', 'inviteNotFound'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/events/{id}/teams/{teamId}/leave',
    tag: TAGS.events,
    summary: 'Leave a team',
    description:
      'Until the event starts. If the caller was the captain, the member who joined first takes over. The last player out ends the team. A team that drops under its minimum loses its place.',
    access: 'user',
    params: eventTeams.eventTeamParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound', 'notInTeam'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled', 'started'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/events/{id}/teams/{teamId}/captain',
    tag: TAGS.events,
    summary: 'Hand over the captain role',
    description: 'The captain only, to another member of the team.',
    access: 'user',
    params: eventTeams.eventTeamParams,
    body: eventTeams.eventTeamCaptainBody,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['notFound', 'teamNotFound', 'notInTeam'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled', 'started'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/events/{id}/teams/{teamId}/members/{userId}',
    tag: TAGS.events,
    summary: 'Remove a player from a team',
    description:
      'The captain only, until the event starts. The captain leaves with the leave route.',
    access: 'user',
    params: eventTeams.eventTeamMemberParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['notFound', 'teamNotFound', 'notInTeam'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled', 'started'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/events/{id}/looking',
    tag: TAGS.events,
    summary: 'Show or hide myself in the looking-for-a-team list',
    description:
      'Registered players in no team appear in the list for signed-in members. Hiding removes the caller from it; organizers still see them.',
    access: 'user',
    params: events.eventIdParams,
    body: eventTeams.eventLookingBody,
    noContent: true,
    problems: [
      { status: 409, problems: ['notRegistered'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/account/events',
    tag: TAGS.events,
    summary: 'My events',
    description:
      "The caller's registrations and waitlist places, upcoming soonest first, then the 50 latest past ones.",
    access: 'user',
    response: events.myEventList,
    problems: [{ status: 503, problems: ['disabled'] }],
  },

  {
    method: 'get',
    path: '/api/media/{key}',
    tag: TAGS.events,
    summary: 'An event image',
    description:
      'A banner, thumbnail or embed image, or a picked original. Keyed by content, so cached for a year by everyone.',
    access: 'public',
    params: events.mediaParams,
    response: {
      description: 'The image.',
      content: {
        'image/webp': { schema: { type: 'string', format: 'binary' } },
        'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      },
    },
    problems: [{ status: 404, problems: [] }],
  },

  // Events: managers
  {
    method: 'get',
    path: '/api/admin/events/bde',
    tag: TAGS.eventsAdmin,
    summary: 'BDE website settings',
    description:
      'Whether events can be pushed to the BDE website: a token is set, and the flag is on.',
    access: 'eventsManager',
    response: events.bdeSettings,
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/bde-sync',
    tag: TAGS.eventsAdmin,
    summary: 'Push to the BDE website again',
    description:
      "Marks the event for a push and tries at once, such as after fixing what the BDE refused. The event's `bdeStatus` says how it went.",
    access: 'eventsManager',
    params: events.eventIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/events/images',
    tag: TAGS.eventsAdmin,
    summary: 'Upload an event image',
    description:
      'Multipart form data with a `file` field: PNG, JPEG, WebP or GIF (first frame), up to 10 MB. It is re-encoded, without its metadata, and kept until no event uses it.',
    access: 'eventsManager',
    response: events.eventStoredImage,
    created: true,
    problems: [{ status: 400, problems: ['imageTooLarge', 'imageUnreadable'] }],
  },
  {
    method: 'post',
    path: '/api/admin/events/images/import',
    tag: TAGS.eventsAdmin,
    summary: 'Import an event image from a link',
    description:
      'The server downloads the image once: https only, within 10 seconds, never from a private address, and for a provider only from its own hosts.',
    access: 'eventsManager',
    body: events.eventImageImportBody,
    response: events.eventStoredImage,
    created: true,
    problems: [{ status: 400, problems: ['imageTooLarge', 'imageUnreadable', 'imageUnreachable'] }],
  },
  {
    method: 'get',
    path: '/api/admin/events/images/providers',
    tag: TAGS.eventsAdmin,
    summary: 'Image providers',
    description: 'Which providers the picker can offer: set up, and with their flag on.',
    access: 'eventsManager',
    response: events.imageProviders,
  },
  {
    method: 'get',
    path: '/api/admin/events/images/{provider}/search',
    tag: TAGS.eventsAdmin,
    summary: 'Search games for art',
    description: 'Up to 8 games, cached for an hour per search.',
    access: 'eventsManager',
    params: events.imageProviderParams,
    query: events.imageSearchQuery,
    response: events.providerGames,
    problems: [
      { status: 502, problems: ['providerUnavailable'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/admin/events/images/{provider}/{gameId}',
    tag: TAGS.eventsAdmin,
    summary: "A game's art",
    description:
      'Banners (1920 × 620 or 3840 × 1240) or covers, without NSFW, humor or epilepsy-warning art. Cached for an hour.',
    access: 'eventsManager',
    params: events.imageProviderGameParams,
    query: events.imageListQuery,
    response: events.providerImages,
    problems: [
      { status: 502, problems: ['providerUnavailable'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/admin/events/images/thumb',
    tag: TAGS.eventsAdmin,
    summary: 'A preview of provider art',
    description: "Fetched from the provider's hosts only, and cached for a day.",
    access: 'eventsManager',
    query: events.imageThumbQuery,
    response: {
      description: 'The preview.',
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
    },
    problems: [{ status: 404, problems: [] }],
  },
  {
    method: 'get',
    path: '/api/admin/events/{id}/registrations',
    tag: TAGS.eventsAdmin,
    summary: 'Registrations',
    description: 'Everyone registered, then the waitlist in order, with their email and school.',
    access: 'eventsManager',
    key: 'registrations:read',
    params: events.eventIdParams,
    response: events.eventRegistrationList,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/events/{id}/teams',
    tag: TAGS.eventsAdmin,
    summary: 'Teams of a tournament',
    description:
      'The teams with their players and emails, the counts by state, and the registered players in no team.',
    access: 'eventsManager',
    params: events.eventIdParams,
    response: eventTeams.adminTeamsView,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notTeamEvent'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/teams',
    tag: TAGS.eventsAdmin,
    summary: 'Create a team',
    description:
      'Makes a team by hand around a registered player, who is its captain unless `captain` is false: a team without a captain can only be changed by managers. Logged in the audit log.',
    access: 'eventsManager',
    params: events.eventIdParams,
    body: eventTeams.adminTeamCreateBody,
    response: eventTeams.eventTeamCreated,
    created: true,
    problems: [
      { status: 400, problems: ['invalidTeamName'] },
      { status: 404, problems: ['notFound'] },
      {
        status: 409,
        problems: ['notTeamEvent', 'cancelled', 'teamNameTaken', 'notRegistered', 'alreadyInTeam'],
      },
    ],
  },
  {
    method: 'patch',
    path: '/api/admin/events/{id}/teams/{teamId}',
    tag: TAGS.eventsAdmin,
    summary: 'Change a team',
    description:
      'Renames it, validates it by hand with `forced` (it stops being forced once valid by size), or changes its captain to one of its players. Logged in the audit log.',
    access: 'eventsManager',
    params: eventTeams.adminTeamParams,
    body: eventTeams.adminTeamPatchBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['invalidTeamName'] },
      { status: 404, problems: ['notFound', 'teamNotFound', 'notInTeam'] },
      { status: 409, problems: ['notTeamEvent', 'cancelled', 'teamNameTaken'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/admin/events/{id}/teams/{teamId}',
    tag: TAGS.eventsAdmin,
    summary: 'Delete a team',
    description: 'Its players stay registered, in no team. Logged in the audit log.',
    access: 'eventsManager',
    params: eventTeams.adminTeamParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound', 'teamNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/teams/{teamId}/members',
    tag: TAGS.eventsAdmin,
    summary: 'Add a player to a team',
    description:
      'The player must be registered. The window and the start are ignored. A full team, or a player already in another team, is refused with `teamFull` or `alreadyInTeam` unless `force` is set; a player in two teams counts for both. Logged in the audit log.',
    access: 'eventsManager',
    params: eventTeams.adminTeamParams,
    body: eventTeams.adminTeamMemberBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound', 'teamNotFound'] },
      {
        status: 409,
        problems: ['notTeamEvent', 'cancelled', 'notRegistered', 'alreadyInTeam', 'teamFull'],
      },
    ],
  },
  {
    method: 'delete',
    path: '/api/admin/events/{id}/teams/{teamId}/members/{userId}',
    tag: TAGS.eventsAdmin,
    summary: 'Remove a player from a team',
    description: 'They stay registered. Logged in the audit log.',
    access: 'eventsManager',
    params: eventTeams.adminTeamMemberParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound', 'teamNotFound', 'notInTeam'] }],
  },
  {
    method: 'get',
    path: '/api/admin/events/{id}/registrations.csv',
    tag: TAGS.eventsAdmin,
    summary: 'Registrations as CSV',
    access: 'eventsManager',
    params: events.eventIdParams,
    response: {
      description: 'The same list as a CSV file, UTF-8 with a byte order mark for spreadsheets.',
      content: { 'text/csv': { schema: { type: 'string' } } },
    },
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/registrations',
    tag: TAGS.eventsAdmin,
    summary: 'Register someone',
    description:
      "Registers an account by hand, whatever its school or the registration window. Past the limit it's refused with `full`, unless `force` is set. Someone on the waitlist is moved up.",
    access: 'eventsManager',
    key: 'registrations:write',
    params: events.eventIdParams,
    body: events.eventRegistrationAddBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound', 'userNotFound'] },
      { status: 409, problems: ['cancelled', 'alreadyRegistered', 'full'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/admin/events/{id}/registrations/{userId}',
    tag: TAGS.eventsAdmin,
    summary: 'Remove someone',
    description: 'Removes a registration or a waitlist place. The waitlist moves up.',
    access: 'eventsManager',
    key: 'registrations:write',
    params: events.eventRegistrationParams,
    noContent: true,
    problems: [{ status: 404, problems: ['notFound', 'notRegistered'] }],
  },
  {
    method: 'get',
    path: '/api/admin/events/users',
    tag: TAGS.eventsAdmin,
    summary: 'Find an account',
    description: 'Up to 10 accounts by name or email, to register someone by hand.',
    access: 'eventsManager',
    query: events.eventUserQuery,
    response: events.eventUserOptions,
  },
  {
    method: 'get',
    path: '/api/admin/event-rooms',
    tag: TAGS.eventsAdmin,
    summary: 'Rooms',
    description: 'Every room, those in use first, by name.',
    access: 'eventsManager',
    response: events.eventRoomList,
  },
  {
    method: 'post',
    path: '/api/admin/event-rooms',
    tag: TAGS.eventsAdmin,
    summary: 'Add a room',
    access: 'eventsManager',
    body: events.eventRoomBody,
    response: events.eventRoomView,
    created: true,
    problems: [{ status: 409, problems: ['duplicateName'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/event-rooms/{id}',
    tag: TAGS.eventsAdmin,
    summary: 'Rename or archive a room',
    description:
      'Rooms are archived, never deleted: events keep their room, and the form stops offering it.',
    access: 'eventsManager',
    params: events.eventIdParams,
    body: events.eventRoomPatchBody,
    response: events.eventRoomView,
    problems: [
      { status: 404, problems: ['roomNotFound'] },
      { status: 409, problems: ['duplicateName'] },
    ],
  },
  {
    method: 'get',
    path: '/api/admin/event-types',
    tag: TAGS.eventsAdmin,
    summary: 'Event types',
    description: 'Every type, those in use first, by English name.',
    access: 'eventsManager',
    response: events.eventTypeList,
  },
  {
    method: 'post',
    path: '/api/admin/event-types',
    tag: TAGS.eventsAdmin,
    summary: 'Add an event type',
    access: 'eventsManager',
    body: events.eventTypeBody,
    response: events.eventTypeView,
    created: true,
    problems: [{ status: 409, problems: ['duplicateName'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/event-types/{id}',
    tag: TAGS.eventsAdmin,
    summary: 'Rename or archive an event type',
    access: 'eventsManager',
    params: events.eventIdParams,
    body: events.eventTypePatchBody,
    response: events.eventTypeView,
    problems: [
      { status: 404, problems: ['typeNotFound'] },
      { status: 409, problems: ['duplicateName'] },
    ],
  },
  {
    method: 'get',
    path: '/api/admin/events',
    tag: TAGS.eventsAdmin,
    summary: 'Events',
    description:
      'One tab of the admin list: upcoming events soonest first, drafts and past events latest first.',
    access: 'eventsManager',
    key: 'events:read-hidden',
    query: events.eventAdminQuery,
    response: events.eventAdminList,
  },
  {
    method: 'post',
    path: '/api/admin/events',
    tag: TAGS.eventsAdmin,
    summary: 'Create an event',
    access: 'eventsManager',
    body: events.eventBody,
    response: events.eventCreated,
    created: true,
    problems: [{ status: 400, problems: ['roomNotFound', 'typeNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/events/{id}',
    tag: TAGS.eventsAdmin,
    summary: 'An event, for managers',
    access: 'eventsManager',
    key: 'events:read-hidden',
    params: events.eventIdParams,
    response: events.eventAdminView,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'put',
    path: '/api/admin/events/{id}',
    tag: TAGS.eventsAdmin,
    summary: 'Edit an event',
    description: "Replaces the whole event. A cancelled event can't be edited.",
    access: 'eventsManager',
    params: events.eventIdParams,
    body: events.eventBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['roomNotFound', 'typeNotFound'] },
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['cancelled', 'teamModeLocked'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/admin/events/{id}',
    tag: TAGS.eventsAdmin,
    summary: 'Delete an event',
    description:
      'Only drafts and events nobody registered to. Cancel the others, so their page stays. An event on the BDE website is taken down there first: while the BDE website is unreachable, deleting is refused.',
    access: 'eventsManager',
    params: events.eventIdParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['hasRegistrations'] },
      { status: 502, problems: ['bdeUnavailable'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/cancel',
    tag: TAGS.eventsAdmin,
    summary: 'Cancel an event',
    description: "The page stays, marked cancelled, and registrations close. It can't be undone.",
    access: 'eventsManager',
    params: events.eventIdParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['cancelled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/duplicate',
    tag: TAGS.eventsAdmin,
    summary: 'Duplicate an event',
    description:
      'A draft copy at new dates, without its registrations. The registration window moves with the start.',
    access: 'eventsManager',
    params: events.eventIdParams,
    body: events.eventDuplicateBody,
    response: events.eventCreated,
    created: true,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'get',
    path: '/api/push/status',
    tag: TAGS.push,
    summary: 'My notification settings',
    description:
      "The caller's four switches, devices, how many notifications they received in the last 7 days, and the VAPID public key to subscribe with. `enabled` is false while an admin has switched push off, `configured` is false when the server has no VAPID keys.",
    access: 'user',
    response: push.pushStatusView,
  },
  {
    method: 'post',
    path: '/api/push/subscription',
    tag: TAGS.push,
    summary: 'Turn notifications on for this browser',
    description:
      "Saves what the browser's `PushManager.subscribe()` returned, with the language to write notifications in. Again from the same browser: updates it.",
    access: 'user',
    body: push.pushSubscribeBody,
    noContent: true,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'delete',
    path: '/api/push/subscription',
    tag: TAGS.push,
    summary: 'Turn notifications off for this browser',
    description: 'Always works, even while push is switched off.',
    access: 'user',
    body: push.pushUnsubscribeBody,
    noContent: true,
  },
  {
    method: 'patch',
    path: '/api/push/subscription',
    tag: TAGS.push,
    summary: 'Change the language of this browser’s notifications',
    access: 'user',
    body: push.pushLocaleBody,
    noContent: true,
  },
  {
    method: 'delete',
    path: '/api/push/devices/{id}',
    tag: TAGS.push,
    summary: 'Remove one of my devices',
    access: 'user',
    params: z.object({ id: z.coerce.number().int().positive() }),
    noContent: true,
  },
  {
    method: 'patch',
    path: '/api/push/preferences',
    tag: TAGS.push,
    summary: 'Choose which notifications I get',
    description: 'New events, reminders, waitlist spots and changes to my events. On every device.',
    access: 'user',
    body: push.pushPreferencesPatch,
    response: push.pushPreferences,
  },
  {
    method: 'get',
    path: '/api/admin/push/overview',
    tag: TAGS.pushAdmin,
    summary: 'Notifications this week',
    description:
      'Counts only, so events managers can read it too: sent in the last 7 days, the most one person received, and how many went over the weekly limit. The limit only warns, it never blocks.',
    access: 'eventsManager',
    response: push.pushOverview,
  },
  {
    method: 'get',
    path: '/api/admin/push/subscribers',
    tag: TAGS.pushAdmin,
    summary: 'Who turned notifications on',
    access: 'admin',
    response: push.pushSubscriberList,
  },
  {
    method: 'get',
    path: '/api/admin/push/settings',
    tag: TAGS.pushAdmin,
    summary: 'Push settings',
    access: 'admin',
    response: push.pushSettings,
  },
  {
    method: 'patch',
    path: '/api/admin/push/settings',
    tag: TAGS.pushAdmin,
    summary: 'Change the push settings',
    description:
      'The weekly limit that triggers warnings, how many days the prompt stays quiet after "Not now" (null: never ask again), and the quiet hours that hold new-event announcements: a switch and a from and an until hour in Paris time.',
    access: 'admin',
    body: push.pushSettings,
    response: push.pushSettings,
  },
  {
    method: 'get',
    path: '/api/short-links/{shortId}',
    tag: TAGS.shortLinks,
    summary: 'What a short link needs from a visitor',
    description:
      'For the page shown when `/go/{shortId}` can’t be followed: whether the link is available, who can open it and the names of the allowed schools. It never returns the destination. `state: off` covers an unknown, turned-off or switched-off link. The link itself is `GET /go/{shortId}` (outside `/api`): a 302 to the destination after the access check, or to `/short-link` with the reason. Link previews and crawlers are redirected but not counted.',
    access: 'public',
    params: shortLinks.shortLinkPublicParams,
    response: shortLinks.shortLinkPublic,
  },
  {
    method: 'get',
    path: '/api/admin/short-links',
    tag: TAGS.shortLinksAdmin,
    summary: 'The short links',
    description: 'Every short link, newest first, with its clicks and the people who clicked.',
    access: 'eventsManager',
    key: 'links:read',
    response: shortLinks.shortLinkList,
  },
  {
    method: 'post',
    path: '/api/admin/short-links',
    tag: TAGS.shortLinksAdmin,
    summary: 'Create a short link',
    description:
      'An empty `shortId` gets a random one. `access: schools` needs at least one school. Recording who clicks needs sign-in, so `access: any` can’t.',
    access: 'eventsManager',
    key: 'links:create',
    body: shortLinks.shortLinkBody,
    response: z.object({ id: z.uuid(), shortId: z.string() }),
    created: true,
    problems: [{ status: 409, problems: ['shortIdTaken'] }],
  },
  {
    method: 'get',
    path: '/api/admin/short-links/{id}',
    tag: TAGS.shortLinksAdmin,
    summary: 'A short link with its statistics',
    description:
      'Clicks per day for 30 days, and for links that record clicks, the people by school and the people who clicked last.',
    access: 'eventsManager',
    key: 'links:read',
    params: shortLinks.shortLinkIdParams,
    response: shortLinks.shortLinkDetail,
    problems: [{ status: 404, problems: ['shortLinkNotFound'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/short-links/{id}',
    tag: TAGS.shortLinksAdmin,
    summary: 'Change a short link',
    description:
      'The short ID can’t change, so printed links keep working. Turning access to `any` stops recording who clicks. Clicks already recorded stay.',
    access: 'eventsManager',
    params: shortLinks.shortLinkIdParams,
    body: shortLinks.shortLinkPatchBody,
    noContent: true,
    problems: [{ status: 404, problems: ['shortLinkNotFound'] }],
  },
  {
    method: 'delete',
    path: '/api/admin/short-links/{id}',
    tag: TAGS.shortLinksAdmin,
    summary: 'Delete a short link',
    description: 'Its clicks go with it.',
    access: 'eventsManager',
    params: shortLinks.shortLinkIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['shortLinkNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/short-links/{id}/export',
    tag: TAGS.shortLinksAdmin,
    summary: 'Download who clicked',
    description:
      'A CSV with the date, name, email and school of each click on a link that records clicks. It is written to the admin log.',
    access: 'eventsManager',
    params: shortLinks.shortLinkIdParams,
    response: {
      description: 'A CSV file.',
      content: { 'text/csv': { schema: { type: 'string' } } },
    },
    problems: [{ status: 404, problems: ['shortLinkNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/posters',
    tag: TAGS.postersAdmin,
    summary: 'The posters',
    description:
      'Every poster, last saved first, with what it needs to be drawn: its pinned fields, the values of its event, and its QR short link with the clicks.',
    access: 'eventsManager',
    response: posters.posterList,
  },
  {
    method: 'post',
    path: '/api/admin/posters',
    tag: TAGS.postersAdmin,
    summary: 'Create a poster',
    description:
      "Fields missing from `overrides` follow the event. With the QR code on, a short link is made to `qrUrl`, or to the event's page when it is null. A standalone poster with the QR code on needs `qrUrl`. A treatment is kept only on Art title.",
    access: 'eventsManager',
    body: posters.posterBody,
    response: posters.posterCreated,
    created: true,
    problems: [{ status: 400, problems: ['eventNotFound', 'qrUrlNeeded'] }],
  },
  {
    method: 'get',
    path: '/api/admin/posters/events',
    tag: TAGS.postersAdmin,
    summary: 'Events for a poster',
    description:
      'The events a poster can follow, soonest first: those not over, or over for less than 30 days. Each comes with the values a poster takes from it, drafts and cancelled events included.',
    access: 'eventsManager',
    response: posters.posterEventList,
  },
  {
    method: 'get',
    path: '/api/admin/posters/art',
    tag: TAGS.postersAdmin,
    summary: 'Treated art',
    description:
      'A stored image as the background of an Art title poster: duotone (navy to the tint), dark medium or dark strong. Made on first use, then kept.',
    access: 'eventsManager',
    query: posters.posterArtQuery,
    response: {
      description: 'A WebP image.',
      content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
    },
    problems: [{ status: 404, problems: ['imageNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/posters/{id}',
    tag: TAGS.postersAdmin,
    summary: 'A poster',
    access: 'eventsManager',
    params: posters.posterIdParams,
    response: posters.posterView,
    problems: [{ status: 404, problems: ['posterNotFound'] }],
  },
  {
    method: 'put',
    path: '/api/admin/posters/{id}',
    tag: TAGS.postersAdmin,
    summary: 'Save a poster',
    description:
      'Replaces the whole poster: the last save wins. A changed `qrUrl` moves its short link, which printed copies follow.',
    access: 'eventsManager',
    params: posters.posterIdParams,
    body: posters.posterBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['eventNotFound', 'qrUrlNeeded'] },
      { status: 404, problems: ['posterNotFound'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/admin/posters/{id}',
    tag: TAGS.postersAdmin,
    summary: 'Delete a poster',
    description: 'Its short link stays, so printed copies keep working.',
    access: 'eventsManager',
    params: posters.posterIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['posterNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/posters/{id}/duplicate',
    tag: TAGS.postersAdmin,
    summary: 'Duplicate a poster',
    description:
      'A copy under a new name. It shares the short link, so both print the same QR code.',
    access: 'eventsManager',
    params: posters.posterIdParams,
    body: posters.posterDuplicateBody,
    response: posters.posterCreated,
    created: true,
    problems: [{ status: 404, problems: ['posterNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/partners',
    tag: TAGS.partners,
    summary: 'The partners',
    description:
      'The visible partners grouped by kind (sponsor, game, prize) in the page’s order, with their logo URLs and descriptions in both languages. Kinds with no visible partner are left out. `contactUrl` is null while the `partners.contact` flag is off.',
    access: 'public',
    response: partners.partnerPublicView,
  },
  {
    method: 'get',
    path: '/api/partner-events/{slug}',
    tag: TAGS.partnerEvents,
    summary: 'A partner event',
    description:
      'The page of an event another organization runs (such as Arena League Université 2027): its links, date wording, hero art, and its games with their status, team sizes and the number of interested students. Signed-in students also get their own interest in `mine`; visitors get null. Behind the `partnerEvents` flag.',
    access: 'public',
    params: partnerEvents.partnerEventParams,
    response: partnerEvents.partnerEventView,
    problems: [{ status: 404, problems: ['partnerEventNotFound'] }],
  },
  {
    method: 'put',
    path: '/api/partner-events/{slug}/interest',
    tag: TAGS.partnerEvents,
    summary: 'Save my interest',
    description:
      'Replaces the signed-in student’s interest: the games listed are kept or added with their in-game name and rank, and the games left out are withdrawn. An empty `games` list withdraws everything, and needs no consent and stays possible while interest is paused. Saving needs `consent: true`, the agreement to share the data with the organizer. Behind the `partnerEvents` and `partnerEvents.interest` flags.',
    access: 'user',
    params: partnerEvents.partnerEventParams,
    body: partnerEvents.partnerInterestBody,
    response: partnerEvents.partnerEventView,
    problems: [
      { status: 400, problems: ['consentRequired'] },
      { status: 404, problems: ['partnerEventNotFound'] },
      { status: 409, problems: ['interestClosed', 'partnerEventClosed'] },
    ],
  },
  {
    method: 'get',
    path: '/api/partner-events/{slug}/games/{game}',
    tag: TAGS.partnerEvents,
    summary: 'A game’s teams',
    description:
      'The teams of a confirmed game with their starters and substitutes, and the students looking for a team (those who showed interest, have no team and did not hide themselves). Visitors only get counts: members and players are null. Signed-in students also get `me`: their team, the invitations they received and the requests they sent. The captain sees the pending invitations and requests of their team. Behind the `partnerEvents` flag.',
    access: 'public',
    params: partnerEvents.partnerGameParams,
    response: partnerEvents.partnerGameTeamsView,
    problems: [
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/partner-events/{slug}/games/{game}/teams',
    tag: TAGS.partnerEvents,
    summary: 'Create a team',
    description:
      'Creates a team with the caller as captain and first starter. The caller must have shown interest in the game and be in no team of it. The name is 3 to 30 characters and the abbreviation 2 to 5 letters or digits, both unique within the game. The date of birth goes to the organizer. Behind the `partnerEvents` and `partnerEvents.teams` flags.',
    access: 'user',
    params: partnerEvents.partnerGameParams,
    body: partnerEvents.partnerTeamCreateBody,
    response: partnerEvents.partnerCreated,
    created: true,
    problems: [
      { status: 400, problems: ['invalidTeamName', 'invalidAbbreviation', 'invalidBirthDate'] },
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound'] },
      { status: 503, problems: ['disabled'] },
      {
        status: 409,
        problems: [
          'partnerEventClosed',
          'gameNotConfirmed',
          'teamsClosed',
          'interestRequired',
          'alreadyInTeam',
          'teamNameTaken',
          'abbreviationTaken',
        ],
      },
    ],
  },
  {
    method: 'patch',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}',
    tag: TAGS.partnerEvents,
    summary: 'Edit a team',
    description:
      'The captain only. Only what is sent changes: the name, the abbreviation, or whether students can ask to join.',
    access: 'user',
    params: partnerEvents.partnerTeamParams,
    body: partnerEvents.partnerTeamPatchBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['invalidTeamName', 'invalidAbbreviation'] },
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'teamNotFound'] },
      {
        status: 409,
        problems: ['partnerEventClosed', 'gameNotConfirmed', 'teamNameTaken', 'abbreviationTaken'],
      },
    ],
  },
  {
    method: 'delete',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}',
    tag: TAGS.partnerEvents,
    summary: 'Disband a team',
    description: 'The captain only. Its players keep their interest and look for another team.',
    access: 'user',
    params: partnerEvents.partnerTeamParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'teamNotFound'] },
      { status: 409, problems: ['partnerEventClosed', 'gameNotConfirmed'] },
    ],
  },
  {
    method: 'post',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}/leave',
    tag: TAGS.partnerEvents,
    summary: 'Leave a team',
    description:
      'Leaves the caller’s team, even while teams are paused. The captain’s role passes to the member who joined first, and the last one out ends the team.',
    access: 'user',
    params: partnerEvents.partnerTeamParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'notInTeam'] },
      { status: 409, problems: ['partnerEventClosed', 'gameNotConfirmed'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}/members/{userId}',
    tag: TAGS.partnerEvents,
    summary: 'Move a player or hand over captaincy',
    description:
      'The captain only. `role` moves a player between starter and substitute (the captain is always a starter and a role with no free place is refused); `captain: true` makes the player the captain, as a starter.',
    access: 'user',
    params: partnerEvents.partnerTeamMemberParams,
    body: partnerEvents.partnerMemberPatchBody,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      {
        status: 404,
        problems: ['partnerEventNotFound', 'gameNotFound', 'teamNotFound', 'notInTeam'],
      },
      {
        status: 409,
        problems: ['partnerEventClosed', 'gameNotConfirmed', 'notCaptain', 'teamFull'],
      },
    ],
  },
  {
    method: 'delete',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}/members/{userId}',
    tag: TAGS.partnerEvents,
    summary: 'Remove a player',
    description: 'The captain only.',
    access: 'user',
    params: partnerEvents.partnerTeamMemberParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      {
        status: 404,
        problems: ['partnerEventNotFound', 'gameNotFound', 'teamNotFound', 'notInTeam'],
      },
      { status: 409, problems: ['partnerEventClosed', 'gameNotConfirmed', 'notCaptain'] },
    ],
  },
  {
    method: 'post',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}/invites',
    tag: TAGS.partnerEvents,
    summary: 'Invite a student',
    description:
      'The captain only. Invites a student of the looking-for-a-team list. A team can have at most its free places in pending invitations, and a student at most 10 per game.',
    access: 'user',
    params: partnerEvents.partnerTeamParams,
    body: partnerEvents.partnerInviteBody,
    response: partnerEvents.partnerCreated.extend({ id: z.number() }),
    created: true,
    problems: [
      { status: 403, problems: ['notCaptain'] },
      {
        status: 404,
        problems: ['partnerEventNotFound', 'gameNotFound', 'teamNotFound', 'notLooking'],
      },
      {
        status: 409,
        problems: [
          'partnerEventClosed',
          'gameNotConfirmed',
          'teamsClosed',
          'alreadyInTeam',
          'teamFull',
          'tooManyInvites',
          'alreadyInvited',
        ],
      },
    ],
  },
  {
    method: 'post',
    path: '/api/partner-events/{slug}/games/{game}/teams/{teamId}/requests',
    tag: TAGS.partnerEvents,
    summary: 'Ask to join a team',
    description:
      'A student with interest and no team asks the captain to be let in, with their date of birth. At most 3 pending requests per game, and only to a team that accepts requests and has a free place.',
    access: 'user',
    params: partnerEvents.partnerTeamParams,
    body: partnerEvents.partnerRequestBody,
    response: partnerEvents.partnerCreated.extend({ id: z.number() }),
    created: true,
    problems: [
      { status: 400, problems: ['invalidBirthDate'] },
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'teamNotFound'] },
      {
        status: 409,
        problems: [
          'partnerEventClosed',
          'gameNotConfirmed',
          'teamsClosed',
          'interestRequired',
          'alreadyInTeam',
          'requestsClosed',
          'teamFull',
          'alreadyRequested',
          'tooManyRequests',
        ],
      },
    ],
  },
  {
    method: 'post',
    path: '/api/partner-events/{slug}/games/{game}/invites/{inviteId}',
    tag: TAGS.partnerEvents,
    summary: 'Answer an invitation or a request',
    description:
      'The invited student answers an invitation (accepting needs `birthDate`), the captain answers a request. Accepting adds the student as a starter while a starter place is free, then as a substitute, and cancels their other pending items for the game. Declining is silent.',
    access: 'user',
    params: partnerEvents.partnerInviteParams,
    body: partnerEvents.partnerInviteAnswerBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['invalidBirthDate'] },
      { status: 403, problems: ['notYourInvite', 'notCaptain'] },
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'inviteNotFound'] },
      {
        status: 409,
        problems: [
          'partnerEventClosed',
          'gameNotConfirmed',
          'teamsClosed',
          'interestRequired',
          'alreadyInTeam',
          'teamFull',
        ],
      },
    ],
  },
  {
    method: 'delete',
    path: '/api/partner-events/{slug}/games/{game}/invites/{inviteId}',
    tag: TAGS.partnerEvents,
    summary: 'Withdraw an invitation or a request',
    description: 'The captain withdraws an invitation, a student withdraws their request. Silent.',
    access: 'user',
    params: partnerEvents.partnerInviteParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notYourInvite', 'notCaptain'] },
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'inviteNotFound'] },
      { status: 409, problems: ['partnerEventClosed', 'gameNotConfirmed'] },
    ],
  },
  {
    method: 'get',
    path: '/api/admin/partner-events/{slug}',
    tag: TAGS.partnerEventsAdmin,
    summary: 'A partner event, for managers',
    description:
      'Settings, each game with its referent, the teams with their referent, and the interest list with names, emails and schools. Personal data.',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    response: partnerEvents.partnerAdminView,
    problems: [{ status: 404, problems: ['partnerEventNotFound'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/partner-events/{slug}',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Change a partner event',
    description:
      'Only what is sent changes: the links, the date wording in both languages, the date-confirmed, interest-open and teams-open switches, and the hero image (a key from the upload route, or null).',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    body: partnerEvents.partnerEventSettingsBody,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerEventNotFound', 'imageNotFound'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/partner-events/{slug}/games/{game}',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Change a game',
    description:
      'Only what is sent changes: status, starters, substitutes, card art and the referent for the organizer. A game with teams cannot return to under study, and places below what a team uses are refused.',
    access: 'eventsManager',
    params: partnerEvents.partnerGameParams,
    body: partnerEvents.partnerGameSettingsBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['partnerEventNotFound', 'gameNotFound', 'imageNotFound'] },
      { status: 409, problems: ['gameHasTeams', 'placesInUse'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/admin/partner-events/{slug}/teams/{teamId}',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Set a team’s referent',
    description:
      'Replaces the game’s referent for this team in the export. A null `referent` clears it.',
    access: 'eventsManager',
    params: partnerEvents.partnerAdminTeamParams,
    body: partnerEvents.partnerTeamReferentBody,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerEventNotFound', 'teamNotFound'] }],
  },
  {
    method: 'delete',
    path: '/api/admin/partner-events/{slug}/teams/{teamId}',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Disband a team',
    description: 'Its players keep their interest.',
    access: 'eventsManager',
    params: partnerEvents.partnerAdminTeamParams,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerEventNotFound', 'teamNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/partner-events/{slug}/close',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Close a partner event',
    description:
      'The page becomes read-only and the 60-day countdown to the deletion of interest, teams, invitations and dates of birth starts. Closing twice changes nothing.',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerEventNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/partner-events/{slug}/announce-impact',
    tag: TAGS.partnerEventsAdmin,
    summary: 'What announcing a partner event would notify',
    description:
      'For the confirmation before announcing. Only accounts that turned partner event notifications on can receive it. Writes nothing.',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    body: partnerEvents.partnerAnnounceImpactBody,
    response: push.pushImpactView,
    problems: [{ status: 404, problems: ['partnerEventNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/partner-events/{slug}/announce',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Announce a partner event',
    description:
      'Queues the push notification for accounts that turned partner event notifications on. Once per event, and not once it is closed. At night (22:00 to 08:00 in Paris) it waits for 08:00; `sendAt` says when. Behind the `push` and `push.partnerEvents` flags.',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    response: push.pushAnnounced,
    problems: [
      { status: 404, problems: ['partnerEventNotFound'] },
      { status: 409, problems: ['partnerEventClosed', 'alreadyAnnounced'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/partner-events/{slug}/reopen',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Reopen a partner event',
    description: 'Cancels the countdown. Data already deleted does not come back.',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerEventNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/partner-events/{slug}/export',
    tag: TAGS.partnerEventsAdmin,
    summary: 'Spreadsheet for the organizer',
    description:
      'The organizer’s template as .xlsx: `Manager` (one row per team, with the team’s referent or its game’s), `Joueur` (one row per player with role and date of birth) and `Intérêt` (the interest list, for LNB). Logged, and never cached.',
    access: 'eventsManager',
    params: partnerEvents.partnerEventParams,
    response: {
      description: 'An .xlsx file.',
      content: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    },
    problems: [{ status: 404, problems: ['partnerEventNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/partners/logos/{key}',
    tag: TAGS.partners,
    summary: 'A partner logo',
    description:
      'A stored logo, without sign-in. SVG files are served as images with a policy that stops scripts.',
    access: 'public',
    params: partners.partnerLogoParams,
    response: {
      description: 'A WebP or SVG image.',
      content: { 'image/webp': {}, 'image/svg+xml': {} },
    },
    problems: [{ status: 404, problems: [] }],
  },
  {
    method: 'get',
    path: '/api/admin/partners',
    tag: TAGS.partnersAdmin,
    summary: 'The partners, as admins edit them',
    description: 'Every partner, hidden ones too, by kind and order, and the contact link.',
    access: 'admin',
    response: partners.partnerAdminView,
  },
  {
    method: 'post',
    path: '/api/admin/partners/logo',
    tag: TAGS.partnersAdmin,
    summary: 'Upload a logo',
    description:
      'Multipart form data with a `file` field: PNG, WebP or SVG, up to 1 MB. PNG and WebP are re-encoded as WebP. It is stored right away and attached when the partner is saved; unused ones are removed after a day.',
    access: 'admin',
    response: partners.partnerLogoView,
    created: true,
    problems: [{ status: 400, problems: ['imageTooLarge', 'imageUnreadable'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/partners/settings',
    tag: TAGS.partnersAdmin,
    summary: 'Change the contact link',
    description:
      'An https link or a mailto: address, or null for none. The "Want to support LNB?" band shows only with a link.',
    access: 'admin',
    body: partners.partnerSettingsBody,
    response: partners.partnerSettingsView,
  },
  {
    method: 'post',
    path: '/api/admin/partners',
    tag: TAGS.partnersAdmin,
    summary: 'Add a partner',
    description: 'It goes last in its kind. The logo must have been uploaded first.',
    access: 'admin',
    body: partners.partnerBody,
    response: z.object({ id: z.uuid() }),
    created: true,
    problems: [{ status: 400, problems: ['logoNotFound'] }],
  },
  {
    method: 'patch',
    path: '/api/admin/partners/{id}',
    tag: TAGS.partnersAdmin,
    summary: 'Change a partner',
    description: 'Another kind puts the partner last there.',
    access: 'admin',
    params: partners.partnerIdParams,
    body: partners.partnerPatchBody,
    noContent: true,
    problems: [
      { status: 400, problems: ['logoNotFound'] },
      { status: 404, problems: ['partnerNotFound'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/admin/partners/{id}',
    tag: TAGS.partnersAdmin,
    summary: 'Delete a partner',
    access: 'admin',
    params: partners.partnerIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/partners/{id}/move',
    tag: TAGS.partnersAdmin,
    summary: 'Move a partner',
    description: 'One step up or down inside its kind. At the end of the list nothing happens.',
    access: 'admin',
    params: partners.partnerIdParams,
    body: partners.partnerMoveBody,
    noContent: true,
    problems: [{ status: 404, problems: ['partnerNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/team',
    tag: TAGS.team,
    summary: 'The team',
    description:
      'The poles with at least one visible member, in order, in both languages. Members hidden by a manager, by themselves or by a site ban are left out. `joinUrl` is null while the `team.join` flag is off.',
    access: 'public',
    response: team.teamPublicView,
  },
  {
    method: 'get',
    path: '/api/team/photos/{key}',
    tag: TAGS.team,
    summary: 'A team member’s photo',
    description:
      'The stored profile photo of a visible team member, without sign-in. Any other photo answers 404.',
    access: 'public',
    params: team.teamPhotoParams,
    response: { description: 'A JPEG image.', content: { 'image/jpeg': {} } },
    problems: [{ status: 404, problems: [] }],
  },
  {
    method: 'get',
    path: '/api/team/me',
    tag: TAGS.team,
    summary: 'Your place on the team page',
    access: 'user',
    response: team.teamMeView,
  },
  {
    method: 'patch',
    path: '/api/team/me',
    tag: TAGS.team,
    summary: 'Show or hide yourself',
    description: 'A member’s own switch. Off hides them from the page and keeps their role.',
    access: 'user',
    body: team.teamMePatch,
    response: team.teamMeView,
    problems: [{ status: 404, problems: ['memberNotFound'] }],
  },
  {
    method: 'get',
    path: '/api/admin/team',
    tag: TAGS.teamAdmin,
    summary: 'The team, as admins edit it',
    description: 'Every pole with all its members, hidden ones too, and the join link.',
    access: 'admin',
    response: team.teamAdminView,
  },
  {
    method: 'get',
    path: '/api/admin/team/users',
    tag: TAGS.teamAdmin,
    summary: 'Find an account',
    description: 'Up to 10 accounts by name or email that are not on the team yet.',
    access: 'admin',
    query: team.teamUserQuery,
    response: team.teamUserOptions,
  },
  {
    method: 'patch',
    path: '/api/admin/team/settings',
    tag: TAGS.teamAdmin,
    summary: 'Change the join link',
    description: 'An https link, or null for none. The button shows only with a link.',
    access: 'admin',
    body: team.teamSettingsBody,
    response: team.teamSettingsView,
  },
  {
    method: 'post',
    path: '/api/admin/team/poles',
    tag: TAGS.teamAdmin,
    summary: 'Add a pole',
    description: 'It goes last. Featuring it un-features the pole that was.',
    access: 'admin',
    body: team.teamPoleBody,
    response: z.object({ id: z.uuid() }),
    created: true,
  },
  {
    method: 'patch',
    path: '/api/admin/team/poles/{id}',
    tag: TAGS.teamAdmin,
    summary: 'Change a pole',
    access: 'admin',
    params: team.teamIdParams,
    body: team.teamPolePatchBody,
    noContent: true,
    problems: [{ status: 404, problems: ['poleNotFound'] }],
  },
  {
    method: 'delete',
    path: '/api/admin/team/poles/{id}',
    tag: TAGS.teamAdmin,
    summary: 'Delete a pole',
    description: 'Only an empty pole.',
    access: 'admin',
    params: team.teamIdParams,
    noContent: true,
    problems: [
      { status: 404, problems: ['poleNotFound'] },
      { status: 409, problems: ['hasMembers'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/team/poles/{id}/move',
    tag: TAGS.teamAdmin,
    summary: 'Move a pole',
    description: 'One step up or down. At the end of the list nothing happens.',
    access: 'admin',
    params: team.teamIdParams,
    body: team.teamMoveBody,
    noContent: true,
    problems: [{ status: 404, problems: ['poleNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/team/members',
    tag: TAGS.teamAdmin,
    summary: 'Add an account to the team',
    description: 'It goes last in its pole. An account is in one pole only.',
    access: 'admin',
    body: team.teamMemberBody,
    noContent: true,
    problems: [
      { status: 404, problems: ['userNotFound', 'poleNotFound'] },
      { status: 409, problems: ['alreadyMember'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/admin/team/members/{userId}',
    tag: TAGS.teamAdmin,
    summary: 'Change a member',
    description: 'Another pole puts them last there.',
    access: 'admin',
    params: team.teamUserParams,
    body: team.teamMemberPatchBody,
    noContent: true,
    problems: [{ status: 404, problems: ['memberNotFound', 'poleNotFound'] }],
  },
  {
    method: 'delete',
    path: '/api/admin/team/members/{userId}',
    tag: TAGS.teamAdmin,
    summary: 'Remove a member',
    access: 'admin',
    params: team.teamUserParams,
    noContent: true,
    problems: [{ status: 404, problems: ['memberNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/team/members/{userId}/move',
    tag: TAGS.teamAdmin,
    summary: 'Move a member',
    description: 'One step up or down in their pole.',
    access: 'admin',
    params: team.teamUserParams,
    body: team.teamMoveBody,
    noContent: true,
    problems: [{ status: 404, problems: ['memberNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/push-impact',
    tag: TAGS.pushAdmin,
    summary: 'What an action would notify',
    description:
      'For the confirmation before announcing, cancelling, moving, raising the capacity or adding someone. Writes nothing. Nothing is blocked by the weekly limit.',
    access: 'eventsManager',
    params: events.eventIdParams,
    body: push.pushImpactBody,
    response: push.pushImpactView,
    problems: [{ status: 404, problems: ['notFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/announce',
    tag: TAGS.pushAdmin,
    summary: 'Announce an event',
    description:
      'Queues the new-event notification for followers in the schools the event is open to. Once per event, and only for a published event that has not started or been cancelled. At night (22:00 to 08:00 in Paris) it waits for 08:00; `sendAt` says when.',
    access: 'eventsManager',
    params: events.eventIdParams,
    response: push.pushAnnounced,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notAnnounceable', 'alreadyAnnounced'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/events/{id}/announce-resend',
    tag: TAGS.pushAdmin,
    summary: 'Resend an event announcement',
    description:
      'Queues the new-event notification again, for an event that was already announced, to everyone it would reach, including people who got it. The same rules as the announcement apply, quiet hours included. Recorded as `event.announceResend`.',
    access: 'eventsManager',
    params: events.eventIdParams,
    response: push.pushAnnounced,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notAnnounceable', 'notAnnouncedYet'] },
    ],
  },
  // API keys
  {
    method: 'get',
    path: '/api/admin/api-keys',
    tag: TAGS.apiKeysAdmin,
    summary: 'The API keys',
    description:
      'Every key, newest first, with its permissions, status and calls in the last 7 days. The secret is never returned again after it is made. `enabled` is false while the `apiKeys` flag is off.',
    access: 'admin',
    response: apiKeys.apiKeyList,
  },
  {
    method: 'post',
    path: '/api/admin/api-keys',
    tag: TAGS.apiKeysAdmin,
    summary: 'Create an API key',
    description:
      'A key has a name, at least one permission and an expiry within a year. The whole key is in `secret` of this answer and nowhere else: only a hash is kept.',
    access: 'admin',
    body: apiKeys.apiKeyBody,
    response: apiKeys.apiKeyCreated,
    created: true,
  },
  {
    method: 'get',
    path: '/api/admin/api-keys/{id}',
    tag: TAGS.apiKeysAdmin,
    summary: 'An API key with its usage',
    description: 'The routes it called in the last 7 days, most called first.',
    access: 'admin',
    params: apiKeys.apiKeyIdParams,
    response: apiKeys.apiKeyDetail,
    problems: [{ status: 404, problems: ['apiKeyNotFound'] }],
  },
  {
    method: 'post',
    path: '/api/admin/api-keys/{id}/rotate',
    tag: TAGS.apiKeysAdmin,
    summary: 'Rotate an API key',
    description:
      'Makes a new key with the same name and permissions, valid for a year. The old key keeps working for `overlapDays`, then stops. A revoked, expired or already replaced key can’t be rotated.',
    access: 'admin',
    params: apiKeys.apiKeyIdParams,
    body: apiKeys.apiKeyRotateBody,
    response: apiKeys.apiKeyCreated,
    created: true,
    problems: [
      { status: 404, problems: ['apiKeyNotFound'] },
      { status: 409, problems: ['apiKeyNotUsable'] },
    ],
  },
  {
    method: 'post',
    path: '/api/admin/api-keys/{id}/revoke',
    tag: TAGS.apiKeysAdmin,
    summary: 'Revoke an API key',
    description: 'It stops working at once and can’t be turned back on.',
    access: 'admin',
    params: apiKeys.apiKeyIdParams,
    noContent: true,
    problems: [{ status: 404, problems: ['apiKeyNotFound'] }],
  },
  // ---- Economy (docs/economy.md) ----
  {
    method: 'get',
    path: '/api/economy/server/players/{uuid}',
    tag: TAGS.economyServer,
    summary: "A player's accounts",
    description:
      'For the balance in the inventory and "My accounts": the personal account first (opened on first need, with the starting balance), then the shared accounts the player is in, and the account that pays by default.',
    access: 'wardenServer',
    params: economy.economyUuidParams,
    response: economy.economyServerPlayer,
    problems: [
      { status: 403, problems: ['notEligible'] },
      { status: 404, problems: ['notLinked'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'put',
    path: '/api/economy/server/players/{uuid}/default-account',
    tag: TAGS.economyServer,
    summary: 'Pick the account that pays',
    description:
      'The account used when the player names none (`/pay`, shops). It must be one the player can spend from. `null` goes back to the personal account.',
    access: 'wardenServer',
    params: economy.economyUuidParams,
    body: economy.economyServerDefaultBody,
    response: economy.economyServerPlayer,
    problems: [
      { status: 404, problems: ['notLinked', 'notFound'] },
      { status: 409, problems: ['notAllowed'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/server/accounts/{handle}',
    tag: TAGS.economyServer,
    summary: 'A shared account',
    description: 'For `/pay #handle` and casino machines. A leading `#` is accepted.',
    access: 'wardenServer',
    params: economy.economyHandleParams,
    response: economy.economyServerAccount,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/economy/server/transfers',
    tag: TAGS.economyServer,
    summary: 'Move money',
    description:
      'A `/pay`, a bet or a casino payout, in one call. The paying player must be able to spend from the account (owner or member), and no side may be frozen or banned. Each call carries an `idempotencyKey`: sending it again returns the first result with `replayed: true`, and sending it with a different request is a 409 `idempotencyMismatch`.',
    access: 'wardenServer',
    body: economy.economyTransferBody,
    response: economy.economyTransferResult,
    problems: [
      { status: 403, problems: ['notEligible', 'notAllowed'] },
      { status: 404, problems: ['notLinked', 'notFound'] },
      {
        status: 409,
        problems: ['insufficientFunds', 'frozen', 'closed', 'sameAccount', 'idempotencyMismatch'],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/economy/server/shops',
    tag: TAGS.economyServer,
    summary: 'Register a shop',
    description:
      'The first time a player saves a shop block in the game. The player must be able to spend from the account (owner or member). The buy-back price, when there is one, is at most the sell price.',
    access: 'wardenServer',
    body: economy.economyShopSettings,
    response: economy.economyServerShop,
    problems: [
      { status: 403, problems: ['notEligible', 'notAllowed'] },
      { status: 404, problems: ['notLinked', 'notFound'] },
      { status: 409, problems: ['frozen', 'closed'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/server/shops/{shopId}',
    tag: TAGS.economyServer,
    summary: 'A shop',
    description: 'Its account, item, prices and place, and whether it is off.',
    access: 'wardenServer',
    params: economy.economyShopParams,
    response: economy.economyServerShop,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'put',
    path: '/api/economy/server/shops/{shopId}',
    tag: TAGS.economyServer,
    summary: 'Save a shop',
    description:
      "Saves every setting again. The player must be able to spend from the shop's account and from the new one. A shop whose block was broken comes back on; one an admin turned off answers `shopDisabled`.",
    access: 'wardenServer',
    params: economy.economyShopParams,
    body: economy.economyShopSettings,
    response: economy.economyServerShop,
    problems: [
      { status: 403, problems: ['notEligible', 'notAllowed'] },
      { status: 404, problems: ['notLinked', 'notFound'] },
      { status: 409, problems: ['frozen', 'closed', 'shopDisabled'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/economy/server/shops/{shopId}/disable',
    tag: TAGS.economyServer,
    summary: 'Close a broken shop',
    description:
      "When a shop's block is broken. Calling it again changes nothing. Works while the `economy.shops` flag is off, so a broken shop always stops selling.",
    access: 'wardenServer',
    params: economy.economyShopParams,
    body: economy.economyShopDisableBody,
    response: economy.economyServerShop,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/economy/server/shops/{shopId}/orders',
    tag: TAGS.economyServer,
    summary: 'Buy from a shop, or sell back to it',
    description:
      "The site prices the order from the shop's saved prices: `expectedLotPrice` must match, or the answer is `priceChanged`. Selling back pays from the shop's account with no owner around, only at its buy-back price (`noBuyBack` without one). Carries an `idempotencyKey`, as transfers do.",
    access: 'wardenServer',
    params: economy.economyShopParams,
    body: economy.economyShopOrderBody,
    response: economy.economyShopOrderResult,
    problems: [
      { status: 403, problems: ['notEligible', 'notAllowed'] },
      { status: 404, problems: ['notLinked', 'notFound'] },
      {
        status: 409,
        problems: [
          'insufficientFunds',
          'frozen',
          'closed',
          'sameAccount',
          'shopDisabled',
          'noBuyBack',
          'priceChanged',
          'idempotencyMismatch',
        ],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/me',
    tag: TAGS.economy,
    summary: 'My bank',
    description:
      "The signed-in player's accounts, invitations and preferences. Opens the personal account on first visit when the player is eligible.",
    access: 'user',
    response: economy.economyMe,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'patch',
    path: '/api/economy/me',
    tag: TAGS.economy,
    summary: 'Change my bank preferences',
    description: 'The account that pays by default, and leaving or joining the baltop.',
    access: 'user',
    body: economy.economyMePatchBody,
    response: economy.economyMe,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['notAllowed'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/baltop',
    tag: TAGS.economy,
    summary: 'The baltop',
    description:
      'The 50 richest players (first name and initial, or only the username when hidden) and the 20 richest shared accounts. Players who left the ranking are not in it.',
    access: 'user',
    response: economy.economyBaltop,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'post',
    path: '/api/economy/accounts',
    tag: TAGS.economy,
    summary: 'Open a shared account',
    description:
      'The caller becomes its owner. Handles are unique, kept after closing, and some are reserved (`server`, `lnb`, `admin`, `staff`, `bank`, `system`).',
    access: 'user',
    body: economy.economyCreateBody,
    response: economy.economyAccountDetail,
    created: true,
    problems: [
      { status: 403, problems: ['notEligible'] },
      { status: 409, problems: ['handleTaken', 'tooManyAccounts'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/accounts/{accountId}',
    tag: TAGS.economy,
    summary: 'An account',
    description: 'For its members. Owners also see the invitations waiting for an answer.',
    access: 'user',
    params: economy.economyAccountParams,
    response: economy.economyAccountDetail,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'patch',
    path: '/api/economy/accounts/{accountId}',
    tag: TAGS.economy,
    summary: 'Rename a shared account',
    description: 'Owners only. The handle never changes.',
    access: 'user',
    params: economy.economyAccountParams,
    body: economy.economyRenameBody,
    response: economy.economyAccountDetail,
    problems: [
      { status: 403, problems: ['notAllowed'] },
      { status: 409, problems: ['personalAccount'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/economy/accounts/{accountId}',
    tag: TAGS.economy,
    summary: 'Close a shared account',
    description: 'Owners only, once its balance is 0. Its handle stays taken.',
    access: 'user',
    params: economy.economyAccountParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notAllowed'] },
      { status: 409, problems: ['balanceNotZero', 'personalAccount'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/accounts/{accountId}/transactions',
    tag: TAGS.economy,
    summary: "An account's history",
    description: 'Newest first, 50 per page. Every member can read it, viewers included.',
    access: 'user',
    params: economy.economyAccountParams,
    query: economy.economyCursorQuery,
    response: economy.economyTransactionPage,
    problems: [
      { status: 400, problems: ['invalidCursor'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/accounts/{accountId}/balance-history',
    tag: TAGS.economy,
    summary: "An account's balance over time",
    description:
      'The balance at the end of each day (Paris time), with the money in and out that day, from the start of the period (or the account’s opening) to today. Every member can read it, viewers included.',
    access: 'user',
    params: economy.economyAccountParams,
    query: economy.economyStatsQuery,
    response: economy.economyBalanceHistory,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'post',
    path: '/api/economy/accounts/{accountId}/invitations',
    tag: TAGS.economy,
    summary: 'Invite a player',
    description:
      'Owners only, by a linked Minecraft username. The player joins once they accept on the site. Members and pending invitations count against the limit.',
    access: 'user',
    params: economy.economyAccountParams,
    body: economy.economyInviteBody,
    response: economy.economyAccountDetail,
    problems: [
      { status: 403, problems: ['notAllowed'] },
      { status: 404, problems: ['playerNotFound'] },
      {
        status: 409,
        problems: [
          'notEligible',
          'alreadyMember',
          'alreadyInvited',
          'tooManyMembers',
          'personalAccount',
        ],
      },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/economy/accounts/{accountId}/invitations/{invitationId}',
    tag: TAGS.economy,
    summary: 'Cancel an invitation',
    access: 'user',
    params: economy.economyAccountInvitationParams,
    response: economy.economyAccountDetail,
    problems: [
      { status: 403, problems: ['notAllowed'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'patch',
    path: '/api/economy/accounts/{accountId}/members/{userId}',
    tag: TAGS.economy,
    summary: "Change a member's role",
    description: 'Owners only. An account always keeps at least one owner.',
    access: 'user',
    params: economy.economyMemberParams,
    body: economy.economyMemberRoleBody,
    response: economy.economyAccountDetail,
    problems: [
      { status: 403, problems: ['notAllowed'] },
      { status: 409, problems: ['lastOwner'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'delete',
    path: '/api/economy/accounts/{accountId}/members/{userId}',
    tag: TAGS.economy,
    summary: 'Remove a member, or leave',
    description:
      'Owners remove anyone; a member removes themselves to leave. The last owner can’t go.',
    access: 'user',
    params: economy.economyMemberParams,
    noContent: true,
    problems: [
      { status: 403, problems: ['notAllowed'] },
      { status: 409, problems: ['lastOwner', 'personalAccount'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/economy/invitations/{invitationId}/accept',
    tag: TAGS.economy,
    summary: 'Accept an invitation',
    access: 'user',
    params: economy.economyInvitationParams,
    response: economy.economyMe,
    problems: [
      { status: 403, problems: ['notEligible'] },
      { status: 409, problems: ['tooManyMembers'] },
      { status: 503, problems: ['disabled'] },
    ],
  },
  {
    method: 'post',
    path: '/api/economy/invitations/{invitationId}/decline',
    tag: TAGS.economy,
    summary: 'Decline an invitation',
    access: 'user',
    params: economy.economyInvitationParams,
    response: economy.economyMe,
    problems: [{ status: 503, problems: ['disabled'] }],
  },
  {
    method: 'get',
    path: '/api/economy/admin/stats',
    tag: TAGS.economyAdmin,
    summary: 'Economy stats',
    description:
      'Money in circulation, created and destroyed per day, volume by kind, the distribution of wealth and the largest shared accounts. Closed days come from the nightly snapshot.',
    access: 'economyAdmin',
    query: economy.economyStatsQuery,
    response: economy.economyStats,
  },
  {
    method: 'get',
    path: '/api/economy/admin/accounts',
    tag: TAGS.economyAdmin,
    summary: 'Accounts',
    description: 'Every account, closed ones included, richest first, 50 per page.',
    access: 'economyAdmin',
    query: economy.economyAdminAccountsQuery,
    response: economy.economyAdminAccountPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'get',
    path: '/api/economy/admin/accounts/{accountId}',
    tag: TAGS.economyAdmin,
    summary: 'An account',
    access: 'economyAdmin',
    params: economy.economyAccountParams,
    response: economy.economyAdminAccountDetail,
  },
  {
    method: 'get',
    path: '/api/economy/admin/accounts/{accountId}/transactions',
    tag: TAGS.economyAdmin,
    summary: "An account's history",
    access: 'economyAdmin',
    params: economy.economyAccountParams,
    query: economy.economyCursorQuery,
    response: economy.economyTransactionPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'get',
    path: '/api/economy/admin/accounts/{accountId}/balance-history',
    tag: TAGS.economyAdmin,
    summary: "An account's balance over time",
    description: 'The same as the players’ route, for any account.',
    access: 'economyAdmin',
    params: economy.economyAccountParams,
    query: economy.economyStatsQuery,
    response: economy.economyBalanceHistory,
  },
  {
    method: 'post',
    path: '/api/economy/admin/accounts/{accountId}/adjustments',
    tag: TAGS.economyAdmin,
    summary: 'Mint or burn',
    description:
      "Creates money on the account, or destroys some. Works on frozen accounts. The reason shows in the account's history as an adjustment from LNB, and in the audit log.",
    access: 'economyAdmin',
    params: economy.economyAccountParams,
    body: economy.economyAdjustBody,
    response: economy.economyAdminAccountDetail,
    problems: [{ status: 409, problems: ['insufficientFunds', 'closed'] }],
  },
  {
    method: 'post',
    path: '/api/economy/admin/accounts/{accountId}/freeze',
    tag: TAGS.economyAdmin,
    summary: 'Freeze or unfreeze',
    description:
      'A frozen account takes and gives nothing, except admin adjustments and reversals. A reason is required to freeze.',
    access: 'economyAdmin',
    params: economy.economyAccountParams,
    body: economy.economyFreezeBody,
    response: economy.economyAdminAccountDetail,
    problems: [{ status: 409, problems: ['closed'] }],
  },
  {
    method: 'get',
    path: '/api/economy/admin/shops',
    tag: TAGS.economyAdmin,
    summary: 'Shops',
    description:
      'Every player shop, newest first, 50 per page, with its orders and the LNBits they moved.',
    access: 'economyAdmin',
    query: economy.economyAdminShopsQuery,
    response: economy.economyAdminShopPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'patch',
    path: '/api/economy/admin/shops/{shopId}',
    tag: TAGS.economyAdmin,
    summary: 'Turn a shop off or on',
    description:
      'A shop turned off refuses every order, and its owner can no longer save it. A shop whose block was broken stays off (`shopDisabled`) until its owner places it again.',
    access: 'economyAdmin',
    params: economy.economyShopParams,
    body: economy.economyAdminShopPatch,
    response: economy.economyAdminShopRow,
    problems: [
      { status: 404, problems: ['notFound'] },
      { status: 409, problems: ['shopDisabled'] },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/admin/transactions',
    tag: TAGS.economyAdmin,
    summary: 'The ledger',
    description: 'Every transaction, newest first, 50 per page.',
    access: 'economyAdmin',
    query: economy.economyLedgerQuery,
    response: economy.economyLedgerPage,
    problems: [{ status: 400, problems: ['invalidCursor'] }],
  },
  {
    method: 'post',
    path: '/api/economy/admin/transactions/{transactionId}/reverse',
    tag: TAGS.economyAdmin,
    summary: 'Reverse a transaction',
    description:
      'Writes a new transaction with the opposite lines. Each transaction can be reversed once, and a reversal can’t be reversed. Refused when an account no longer holds the money.',
    access: 'economyAdmin',
    params: economy.economyTransactionParams,
    body: economy.economyReverseBody,
    response: z.object({ reversalId: z.number() }),
    problems: [
      { status: 404, problems: ['notFound'] },
      {
        status: 409,
        problems: ['alreadyReversed', 'notReversible', 'insufficientFunds', 'closed'],
      },
    ],
  },
  {
    method: 'get',
    path: '/api/economy/admin/settings',
    tag: TAGS.economyAdmin,
    summary: 'Economy settings',
    access: 'economyAdmin',
    response: economy.economySettingsView,
  },
  {
    method: 'patch',
    path: '/api/economy/admin/settings',
    tag: TAGS.economyAdmin,
    summary: 'Change the economy settings',
    description:
      'The starting balance (minted on each new personal account), how many shared accounts a player can own, and how many members one can have.',
    access: 'economyAdmin',
    body: economy.economySettingsBody,
    response: economy.economySettingsView,
  },
  {
    method: 'get',
    path: '/api/economy/admin/export',
    tag: TAGS.economyAdmin,
    summary: 'Export the economy',
    description: 'Every open account with its balance and members, to keep before a reset.',
    access: 'admin',
    response: economy.economyExport,
  },
  {
    method: 'post',
    path: '/api/economy/admin/reset',
    tag: TAGS.economyAdmin,
    summary: 'Reset the economy',
    description:
      'Deletes every account, the whole ledger and the daily stats. The settings stay. `confirm` must be the exact sentence.',
    access: 'admin',
    body: economy.economyResetBody,
    noContent: true,
    problems: [{ status: 400, problems: ['confirmMismatch'] }],
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
  eventsManager: {
    security: [{ session: [] }],
    note: 'Events managers and site admins only.',
    errors: [
      { status: 401, problems: [] },
      { status: 403, problems: [] },
    ],
  },
  economyAdmin: {
    security: [{ session: [] }],
    note: 'Economy admins and site admins only.',
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
  wardenClient: {
    security: [{ wardenClient: [] }],
    note: 'A device token, accepted on `/api/warden/client/**` only. Unknown, expired and revoked tokens get a 401. A device whose owner’s school can’t use Warden gets a 403 `schoolNotAllowed`.',
    errors: [
      { status: 401, problems: [] },
      { status: 403, problems: ['schoolNotAllowed'] },
    ],
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
  503: 'Service Unavailable',
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
  // A key can be refused for lacking the permission, or because the `apiKeys` flag is off.
  if (route.key) {
    add({ status: 401, problems: [] });
    add({ status: 403, problems: [] });
    add({ status: 503, problems: ['disabled'] });
  }
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
    description:
      [
        route.description,
        access.note,
        route.key
          ? `An API key holding \`${route.key}\` is accepted instead of a session (see Authentication).`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n') || undefined,
    operationId: `${route.method}${route.path.replace(/[^a-z\d]+(.)?/gi, (_, c?: string) => c?.toUpperCase() ?? '')}`,
    security: route.key ? [...(access.security ?? []), { apiKey: [] }] : access.security,
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

/** The routes that accept an API key, with the permission each requires. For the tests. */
export function keyedRoutes(): { method: string; path: string; key: ApiKeyPermission }[] {
  return routes.flatMap((route) =>
    route.key ? [{ method: route.method, path: route.path, key: route.key }] : [],
  );
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
| Integrations (the BDE website, bots) | \`Authorization: Bearer lnb_…\`, an API key made by an admin, on the routes that list it |
| The Minecraft server | \`Authorization: Bearer <WARDEN_SERVER_SECRET>\` |
| The LNB Warden mod | \`Authorization: Bearer <device token>\`, on \`/api/warden/client/*\` only |

To try a route that needs a session from this page, sign in on the site in the same browser first.

## Rate limits

Every route under \`/api\` is limited per IP, and writes are also limited per account. A call with a valid API key is limited per key instead: 600 reads and 60 writes per minute. A caller that goes over gets \`429\` with a \`Retry-After\` header (seconds) and the problem \`rateLimited\`. \`/api/auth/*\` has its own limits, and \`/api/health\` has none.

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
      {
        name: TAGS.economyServer,
        description:
          'Called by the LNB Minecraft server only, with `WARDEN_SERVER_SECRET`. Every money move goes through one call. See `docs/economy.md`.',
      },
      {
        name: TAGS.economy,
        description:
          'The bank pages, `/minecraft/bank` and `/minecraft/baltop`, for signed-in players.',
      },
      {
        name: TAGS.economyAdmin,
        description: 'The Economy section of the admin area, `/admin/economy`.',
      },
      {
        name: TAGS.wardenClient,
        description:
          'Called by the LNB Warden mod, on a player’s computer. The link requests need no token, the rest need the device’s.',
      },
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
      {
        name: TAGS.push,
        description:
          'Notifications about events only, from the notification settings on `/account`. See `docs/push.md`.',
      },
      {
        name: TAGS.pushAdmin,
        description: 'The Push section of the admin area, `/admin/push`, and the confirmations.',
      },
      { name: TAGS.auth, description: AUTH_TAG_DESCRIPTION },
      {
        name: TAGS.authDevice,
        description:
          'Codes for apps, entered on `/link` ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)). Approving goes through `POST /api/link/approve`.',
      },
    ],
    'x-tagGroups': [
      {
        name: 'Site',
        tags: [TAGS.health, TAGS.link, TAGS.users, TAGS.flags, TAGS.admin, TAGS.reference],
      },
      { name: 'Events', tags: [TAGS.events, TAGS.eventsAdmin, TAGS.postersAdmin] },
      {
        name: 'Team and partners',
        tags: [
          TAGS.team,
          TAGS.teamAdmin,
          TAGS.partners,
          TAGS.partnersAdmin,
          TAGS.partnerEvents,
          TAGS.partnerEventsAdmin,
        ],
      },
      { name: 'Short links', tags: [TAGS.shortLinks, TAGS.shortLinksAdmin] },
      { name: 'API keys', tags: [TAGS.apiKeysAdmin] },
      { name: 'Auth', tags: [TAGS.auth, TAGS.authDevice] },
      {
        name: 'Warden',
        tags: [TAGS.wardenServer, TAGS.wardenClient, TAGS.wardenPlayer, TAGS.wardenAdmin],
      },
      { name: 'Minecraft', tags: [TAGS.mods, TAGS.modsAdmin] },
      { name: 'Economy', tags: [TAGS.economyServer, TAGS.economy, TAGS.economyAdmin] },
      { name: 'Push', tags: [TAGS.push, TAGS.pushAdmin] },
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
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An API key made in the admin area: `lnb_` and 40 characters. Each key has permissions and expires within a year. Only routes that list this scheme accept one.',
        },
        wardenServer: {
          type: 'http',
          scheme: 'bearer',
          description: 'The Minecraft server, with `WARDEN_SERVER_SECRET`.',
        },
        wardenClient: {
          type: 'http',
          scheme: 'bearer',
          description:
            'A device of the LNB Warden mod: `lnbw_` and 32 random bytes in base64url, from `POST /api/warden/client/link-requests/{id}/poll`. Its expiry slides: using it pushes it 90 days out.',
        },
      },
    },
  };
}
