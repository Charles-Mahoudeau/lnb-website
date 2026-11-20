import { z } from 'zod';

import { RATE_LIMIT_MODES } from '../rate-limit.ts';
import { SCHOOLS } from '../utils/schools.ts';

// Admin contracts, shared by the /api/admin routes and the /admin pages.
// Responses are schemas too, so the API reference is built from the same definitions as the types.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const ADMIN_PROBLEMS = [
  'notFound',
  'self',
  'targetIsAdmin',
  'notBanned',
  'invalidCursor',
  'tooMany',
  'alreadyBanned',
  'unchanged',
  'emailTaken',
  'notGhost',
  'isGhost',
  'notAllowed',
] as const;
export type AdminProblem = (typeof ADMIN_PROBLEMS)[number];

function page<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().describe('Null on the last page.'),
  });
}

export const adminUserParams = z.object({ userId: z.string().min(1).max(64) });

export const ADMIN_PEOPLE_FILTERS = [
  'banned',
  'flagged',
  'overLimit',
  'ghost',
  'hasRole',
  'inactive',
] as const;
export type AdminPeopleFilter = (typeof ADMIN_PEOPLE_FILTERS)[number];
const adminPeopleFilter = z.enum(ADMIN_PEOPLE_FILTERS);

const adminPeopleCommon = {
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe(
      "A name, an email, a Minecraft name or a Minecraft UUID, as far as the caller's role may search by it. Events managers search names and emails, economy admins names and Minecraft names.",
    ),
  tenantId: z
    .string()
    .refine((tid) => tid in SCHOOLS)
    .optional()
    .describe("The school's Microsoft tenant ID."),
  role: z
    .enum(['any', 'admin', 'warden-admin', 'events-manager', 'economy-admin'])
    .default('any')
    .describe('Site admins only.'),
};

/** The filters of the People list, without its cursor. Bulk actions take them as a selection. */
export const adminPeopleFilters = z.object({
  ...adminPeopleCommon,
  filters: z
    .array(adminPeopleFilter)
    .max(ADMIN_PEOPLE_FILTERS.length)
    .default([])
    .describe(
      '`banned`: a site or Warden ban in force (Warden admins: Warden bans). `flagged`: the anticheat holds the player, or they use a file to review, refused or banned. `overLimit`: played past the playtime allowance this week. `ghost`: made by an admin for someone who has not signed in yet. `hasRole`: has any admin role. `inactive`: no sign-in for 24 months, so due for deletion (site admins).',
    ),
});
export type AdminPeopleFilters = z.input<typeof adminPeopleFilters>;

/** GET /api/admin/people query. `filters` is a comma-separated list. */
export const adminPeopleQuery = z.object({
  ...adminPeopleCommon,
  filters: z
    .string()
    .max(100)
    .default('')
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(adminPeopleFilter))
    .describe(
      `Comma-separated quick filters, all of which must match: ${ADMIN_PEOPLE_FILTERS.join(', ')}.`,
    ),
  cursor: z.string().max(400).optional(),
});
export type AdminPeopleQuery = {
  q?: string;
  tenantId?: string;
  role?: 'any' | 'admin' | 'warden-admin' | 'events-manager' | 'economy-admin';
  /** Comma-separated. */
  filters?: string;
  cursor?: string;
};

const adminRoleFlags = z.object({
  admin: z.boolean(),
  wardenAdmin: z
    .boolean()
    .describe('Has the warden-admin role itself. Site admins have its rights anyway.'),
  eventsManager: z
    .boolean()
    .describe('Has the events-manager role itself. Site admins have its rights anyway.'),
  economyAdmin: z
    .boolean()
    .describe('Has the economy-admin role itself. Site admins have its rights anyway.'),
});
export type AdminRoleFlags = z.infer<typeof adminRoleFlags>;

const adminPersonAccount = z.object({
  uuid: z.string(),
  username: z.string(),
  online: z.boolean(),
});

const adminPersonBan = z.object({
  reason: z.string().nullable(),
  expiresAt: isoDate.nullable().describe('Null: permanent.'),
});

const adminAnticheatBrief = z.object({
  score: z.number(),
  band: z.enum(['trusted', 'normal', 'held', 'zero']),
  manualHold: z.boolean(),
  flagged: z.boolean().describe('Held by the anticheat, or using a file that needs a look.'),
});

/**
 * One row of the People list. Which fields come back depends on the caller's role: `email`,
 * `roles` and `minecraft` for Warden admins, the site account fields for site admins, `balance`
 * for economy admins and `registrations` for events managers. Site admins get everything.
 */
export const adminPersonRow = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
  ghost: z
    .boolean()
    .describe('Made by an admin for someone who has not signed in yet. It has no sign-in.'),
  email: z.string().optional().describe('Site admins and Warden admins.'),
  roles: adminRoleFlags.optional().describe('Site admins and Warden admins.'),
  lastSignInAt: isoDate.nullable().optional().describe('Site admins.'),
  inactive: z.boolean().optional().describe('No sign-in for 24 months. Site admins.'),
  siteBan: adminPersonBan.nullable().optional().describe('The site ban in force. Site admins.'),
  ban: adminPersonBan
    .extend({ id: z.string() })
    .nullable()
    .optional()
    .describe('The Warden ban in force. Warden admins.'),
  minecraft: z
    .object({
      accounts: z.array(adminPersonAccount),
      lastSeenAt: isoDate.nullable(),
      playtimeSeconds: z.number(),
      transferWarning: z.enum(['in', 'out', 'both']).nullable(),
    })
    .optional()
    .describe('Warden admins.'),
  anticheat: adminAnticheatBrief
    .nullable()
    .optional()
    .describe('Null when the anticheat has not seen the player. Warden admins.'),
  overLimit: z
    .boolean()
    .optional()
    .describe('Played past the playtime allowance this week. Warden admins.'),
  balance: z
    .number()
    .nullable()
    .optional()
    .describe('LNBits on the personal account, null with no account. Economy admins.'),
  registrations: z
    .object({ upcoming: z.number(), total: z.number() })
    .optional()
    .describe('Event registrations. Events managers.'),
});
export type AdminPersonRow = z.infer<typeof adminPersonRow>;

export const adminPeoplePage = page(adminPersonRow).extend({
  total: z.number().describe('Everyone matching the filters, across pages.'),
  match: z
    .object({ userId: z.string() })
    .nullable()
    .describe(
      'The account owning the Minecraft name or UUID typed exactly in `q`, for Warden admins and economy admins. Null otherwise.',
    ),
});
export type AdminPeoplePage = z.infer<typeof adminPeoplePage>;

export const adminPersonSummary = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
  ghost: z.boolean(),
  createdAt: isoDate,
  email: z.string().optional().describe('Site admins and Warden admins.'),
  roles: adminRoleFlags.optional().describe('Site admins and Warden admins.'),
  tenantId: z.string().optional().describe("The school's Microsoft tenant ID. Site admins."),
  lastSignInAt: isoDate.nullable().optional().describe('Site admins.'),
  siteBan: adminPersonBan.nullable().optional().describe('The site ban in force. Site admins.'),
  minecraft: z
    .object({
      accounts: z.array(adminPersonAccount.extend({ lastSeenAt: isoDate.nullable() })),
      limit: z.object({ used: z.number(), max: z.number() }),
      playtimeSeconds: z.number(),
      devices: z.number(),
      pendingTransfers: z.number().describe('Account takeovers nobody has dismissed yet.'),
    })
    .optional()
    .describe('Warden admins. Left out for ghost accounts.'),
  moderation: z
    .object({
      activeBan: adminPersonBan
        .extend({ id: z.string(), createdAt: isoDate })
        .nullable()
        .describe('The Warden ban in force.'),
      appeal: z
        .object({ id: z.string(), status: z.enum(['pending', 'accepted', 'rejected']) })
        .nullable()
        .describe('The appeal of the ban in force.'),
      bans: z.number(),
      notes: z.number(),
      warnings: z.number(),
    })
    .optional()
    .describe('Warden admins. Left out for ghost accounts.'),
  playtime: z
    .object({ overSeconds: z.number().describe('Played past the allowance this week.') })
    .optional()
    .describe('Warden admins. Left out for ghost accounts.'),
  anticheat: adminAnticheatBrief
    .extend({
      flaggedFiles: z.number(),
      flaggedFile: z
        .object({
          sha512: z.string(),
          filename: z.string(),
          status: z.enum(['review', 'refused', 'banned']),
        })
        .nullable()
        .describe('The one to look at first: banned, then refused, then to review.'),
    })
    .nullable()
    .optional()
    .describe('Null when the anticheat has not seen the player. Warden admins.'),
  economy: z
    .object({ accountId: z.string(), balance: z.number(), frozen: z.boolean() })
    .nullable()
    .optional()
    .describe('The personal account, null with none. Site admins and economy admins.'),
  events: z
    .object({
      registrations: z.array(
        z.object({
          eventId: z.string(),
          name: z.string(),
          startsAt: isoDate,
          endsAt: isoDate,
          status: z.enum(['registered', 'waitlist']),
          team: z.string().nullable(),
        }),
      ),
    })
    .optional()
    .describe(
      'Their registrations, newest event first (up to 100). Site admins and events managers.',
    ),
});
export type AdminPersonSummary = z.infer<typeof adminPersonSummary>;

/** PUT /api/admin/users/:userId/roles */
export const adminRolesBody = z.object({
  admin: z.boolean(),
  wardenAdmin: z.boolean(),
  eventsManager: z.boolean(),
  economyAdmin: z.boolean(),
});
export type AdminRolesBody = z.infer<typeof adminRolesBody>;

const ghostTenantId = z
  .string()
  .refine((tid) => tid in SCHOOLS)
  .describe("The person's school, as its Microsoft tenant ID. Only that school can take it over.");

/** POST /api/admin/users/ghost and POST /api/admin/events/users/ghost */
export const adminGhostBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .describe(
      "The email the person signs in with. The first Microsoft sign-in with it takes the account over, so it must be the one Microsoft sends, usually the school's.",
    ),
  tenantId: ghostTenantId,
});
export type AdminGhostBody = z.infer<typeof adminGhostBody>;

/** PATCH /api/admin/users/:userId/ghost */
export const adminGhostUpdateBody = adminGhostBody
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });
export type AdminGhostUpdateBody = z.infer<typeof adminGhostUpdateBody>;

export const adminGhost = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
});
export type AdminGhost = z.infer<typeof adminGhost>;

/** POST /api/admin/users/:userId/ban */
export const adminBanBody = z.object({
  reason: z.string().trim().min(1).max(500),
  durationSeconds: z
    .int()
    .positive()
    .max(10 * 365 * 24 * 3600)
    .nullable()
    .describe('Null for a permanent ban.'),
});
export type AdminBanBody = z.infer<typeof adminBanBody>;

/** The most accounts one bulk action takes, picked by hand or by filters. */
export const ADMIN_BULK_MAX = 2000;
const ADMIN_BULK_IDS_MAX = 500;

/** POST /api/admin/users/bulk */
export const adminBulkBody = z
  .object({
    action: z.enum(['signOut', 'ban', 'unban', 'delete', 'roles']),
    selection: z
      .union([
        z.object({
          userIds: z.array(z.string().min(1).max(64)).min(1).max(ADMIN_BULK_IDS_MAX),
        }),
        z.object({ filters: adminPeopleFilters }),
      ])
      .describe(
        `Either accounts picked by ID (up to ${String(ADMIN_BULK_IDS_MAX)}), or every account matching the filters (up to ${String(ADMIN_BULK_MAX)}).`,
      ),
    dryRun: z
      .boolean()
      .default(false)
      .describe('Only count who the action would apply to, and change nothing.'),
    ban: adminBanBody.optional().describe('Required for `ban`, unless `dryRun`.'),
    roles: z
      .object({
        role: z.enum(['warden-admin', 'events-manager', 'economy-admin']),
        mode: z.enum(['add', 'remove']),
      })
      .optional()
      .describe('Required for `roles`. The admin role is never changed in bulk.'),
  })
  .refine((body) => body.action !== 'roles' || body.roles, { path: ['roles'] })
  .refine((body) => body.action !== 'ban' || body.dryRun || body.ban, { path: ['ban'] });
export type AdminBulkBody = z.input<typeof adminBulkBody>;

export const adminBulkResult = z.object({
  total: z.number().describe('Accounts selected.'),
  applied: z.number().describe('Accounts the action applied to, or would apply to for `dryRun`.'),
  skipped: z.number().describe('Accounts left as they are.'),
  skippedUsers: z
    .array(
      z.object({
        userId: z.string(),
        name: z.string().nullable().describe('Null when the account no longer exists.'),
        problem: z.enum(ADMIN_PROBLEMS).or(z.literal('failed')),
      }),
    )
    .describe('The first 20 skipped accounts, with why.'),
});
export type AdminBulkResult = z.infer<typeof adminBulkResult>;

/** One admin change, for the Overview. A deleted account shows as a null actor or target. */
export const adminAuditView = z.object({
  id: z.number(),
  at: isoDate,
  action: z.enum([
    'user.roles',
    'user.ban',
    'user.unban',
    'user.signOut',
    'user.delete',
    'user.ghostCreate',
    'user.ghostUpdate',
    'user.ghostClaim',
    'users.deleteInactive',
    'flag.update',
    'rateLimit.mode',
    'event.create',
    'event.update',
    'event.cancel',
    'event.delete',
    'event.announce',
    'event.announceResend',
    'event.registrationAdd',
    'event.registrationRemove',
    'eventTeam.create',
    'eventTeam.rename',
    'eventTeam.delete',
    'eventTeam.memberAdd',
    'eventTeam.memberRemove',
    'eventTeam.captain',
    'eventTeam.force',
    'eventRoom.create',
    'eventRoom.update',
    'eventType.create',
    'eventType.update',
    'push.settings',
    'teamPole.create',
    'teamPole.update',
    'teamPole.delete',
    'teamMember.add',
    'teamMember.update',
    'teamMember.remove',
    'team.settings',
    'partner.create',
    'partner.update',
    'partner.delete',
    'map.settings',
    'downloads.update',
    'partners.settings',
    'rule.create',
    'rule.update',
    'rule.retire',
    'rule.restore',
    'rule.categoryCreate',
    'rule.categoryUpdate',
    'rule.categoryDelete',
    'rule.seed',
    'gamesplanet.settings',
    'gamesplanet.pin',
    'gamesplanet.unpin',
    'gamesplanet.sync',
    'partnerEvent.update',
    'partnerEvent.close',
    'partnerEvent.reopen',
    'partnerEvent.export',
    'partnerEvent.announce',
    'partnerEvent.purge',
    'shortLink.create',
    'shortLink.update',
    'shortLink.delete',
    'shortLink.export',
    'poster.create',
    'poster.update',
    'poster.delete',
    'apiKey.create',
    'apiKey.rotate',
    'apiKey.revoke',
    'economy.adjust',
    'economy.freeze',
    'economy.unfreeze',
    'economy.reverse',
    'economy.settings',
    'economy.reset',
    'economy.shopDisable',
    'economy.shopEnable',
    'economy.listingRemove',
    'economy.accountType',
    'economy.licenseGrant',
    'economy.licenseRevoke',
    'quests.settings',
    'quests.create',
    'quests.update',
    'quests.delete',
    'quests.import',
    'quests.reset',
    'quests.communityCreate',
    'quests.communityUpdate',
    'quests.communityCancel',
    'quests.communityTemplate',
    'quests.categoryCreate',
    'quests.categoryUpdate',
    'quests.categoryDelete',
  ]),
  actor: z.object({ userId: z.string(), name: z.string() }).nullable(),
  target: z.object({ userId: z.string(), name: z.string() }).nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type AdminAuditView = z.infer<typeof adminAuditView>;

/** GET /api/admin/overview: what needs an admin, and the latest changes. */
export const adminOverview = z.object({
  appeals: z.object({
    pending: z.number().describe('Warden appeals waiting for an answer.'),
    oldestAt: isoDate.nullable(),
  }),
  inactiveAccounts: z.number().describe('Accounts with no sign-in for 24 months.'),
  siteBans: z.number().describe('Site bans in force.'),
  apiKeysSoon: z.number().describe('API keys that expire within 30 days and were not replaced.'),
  rateLimitMode: z
    .enum(RATE_LIMIT_MODES)
    .describe('Rate limiting mode; `normal` needs no attention.'),
  recent: z.array(adminAuditView).describe('The 10 latest admin changes, newest first.'),
});
export type AdminOverview = z.infer<typeof adminOverview>;
