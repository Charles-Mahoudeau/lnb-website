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
] as const;
export type AdminProblem = (typeof ADMIN_PROBLEMS)[number];

function page<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().describe('Null on the last page.'),
  });
}

export const adminUserParams = z.object({ userId: z.string().min(1).max(64) });

/** GET /api/admin/users query. */
export const adminUsersQuery = z.object({
  q: z.string().trim().max(100).optional().describe('Name or email.'),
  tenantId: z
    .string()
    .refine((tid) => tid in SCHOOLS)
    .optional()
    .describe("The school's Microsoft tenant ID."),
  role: z.enum(['any', 'admin', 'warden-admin', 'events-manager']).default('any'),
  status: z
    .enum(['all', 'banned', 'inactive'])
    .default('all')
    .describe('`inactive`: no sign-in for 24 months, so due for deletion.'),
  cursor: z.string().max(400).optional(),
});
export type AdminUsersQuery = z.input<typeof adminUsersQuery>;

export const adminUserRow = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
  admin: z.boolean(),
  wardenAdmin: z
    .boolean()
    .describe('Has the warden-admin role itself. Site admins have its rights anyway.'),
  eventsManager: z
    .boolean()
    .describe('Has the events-manager role itself. Site admins have its rights anyway.'),
  createdAt: isoDate,
  lastSignInAt: isoDate.nullable(),
  inactive: z.boolean().describe('No sign-in for 24 months.'),
  ban: z
    .object({ reason: z.string().nullable(), expiresAt: isoDate.nullable() })
    .nullable()
    .describe('The site ban in force, if any. Null `expiresAt`: permanent.'),
});
export type AdminUserRow = z.infer<typeof adminUserRow>;

export const adminUserPage = page(adminUserRow).extend({
  total: z.number().describe('Every account matching the filters, across pages.'),
});
export type AdminUserPage = z.infer<typeof adminUserPage>;

/** PUT /api/admin/users/:userId/roles */
export const adminRolesBody = z.object({
  admin: z.boolean(),
  wardenAdmin: z.boolean(),
  eventsManager: z.boolean(),
});
export type AdminRolesBody = z.infer<typeof adminRolesBody>;

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

/** The filters of the Users list, without its cursor. */
export const adminUsersFilters = adminUsersQuery.omit({ cursor: true });
export type AdminUsersFilters = z.input<typeof adminUsersFilters>;

/** POST /api/admin/users/bulk */
export const adminBulkBody = z
  .object({
    action: z.enum(['signOut', 'ban', 'unban', 'delete', 'roles']),
    selection: z
      .union([
        z.object({
          userIds: z.array(z.string().min(1).max(64)).min(1).max(ADMIN_BULK_IDS_MAX),
        }),
        z.object({ filters: adminUsersFilters }),
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
        role: z.enum(['warden-admin', 'events-manager']),
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
    'partners.settings',
    'shortLink.create',
    'shortLink.update',
    'shortLink.delete',
    'shortLink.export',
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
  rateLimitMode: z
    .enum(RATE_LIMIT_MODES)
    .describe('Rate limiting mode; `normal` needs no attention.'),
  recent: z.array(adminAuditView).describe('The 10 latest admin changes, newest first.'),
});
export type AdminOverview = z.infer<typeof adminOverview>;
