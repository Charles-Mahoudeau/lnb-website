import { z } from 'zod';

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

export const adminUserPage = page(adminUserRow);
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
  recent: z.array(adminAuditView).describe('The 10 latest admin changes, newest first.'),
});
export type AdminOverview = z.infer<typeof adminOverview>;
