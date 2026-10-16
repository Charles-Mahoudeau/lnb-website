import {
  and,
  asc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { session, user, wardenBan } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { eventRegistrationService } from '~~/server/services/events/registrations';

import type {
  AdminBanBody,
  AdminProblem,
  AdminRolesBody,
  AdminUserPage,
  AdminUserRow,
} from '#shared/schemas/admin';
import {
  ADMIN_ROLE,
  EVENTS_MANAGER_ROLE,
  hasRole,
  isAdmin,
  WARDEN_ADMIN_ROLE,
  withRole,
} from '#shared/utils/roles';
import { schoolForTenant } from '#shared/utils/schools';

// Accounts, for site admins: roles, site bans, sessions and deletion. Every change is written to
// admin_audit. Site bans use Better Auth's admin plugin columns, so Better Auth refuses the
// sign-in itself, and lifts a ban that has expired. Warden bans are separate (services/warden/).

const PAGE_SIZE = 50;
/** Accounts with no sign-in for this long are deleted (see the plan). */
const INACTIVE_MONTHS = 24;

function refuse(status: number, problem: AdminProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** The time before which an account counts as inactive. */
export function inactiveBefore(now = new Date()): Date {
  const date = new Date(now);
  date.setMonth(date.getMonth() - INACTIVE_MONTHS);
  return date;
}

// Accounts that never signed in since last_sign_in_at was added count from their creation.
const lastActive = sql`coalesce(${user.lastSignInAt}, ${user.createdAt})`;

function banActiveWhere(now: Date) {
  return and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now)));
}

/** Accounts, by name, 50 per page. */
async function list(query: {
  q?: string;
  tenantId?: string;
  role: 'any' | 'admin' | 'warden-admin' | 'events-manager';
  status: 'all' | 'banned' | 'inactive';
  cursor?: string;
}): Promise<AdminUserPage> {
  const now = new Date();
  const after = query.cursor ? decodeCursor(query.cursor) : undefined;
  const search = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  // Roles are a comma-separated list, so match a whole name.
  const roleMatch = (name: string) =>
    sql`${name} = any(string_to_array(replace(coalesce(${user.role}, ''), ' ', ''), ','))`;

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
    })
    .from(user)
    .where(
      and(
        search ? or(ilike(user.name, search), ilike(user.email, search)) : undefined,
        query.tenantId ? eq(user.tenantId, query.tenantId) : undefined,
        query.role === 'any' ? undefined : roleMatch(query.role),
        query.status === 'banned' ? banActiveWhere(now) : undefined,
        query.status === 'inactive' ? lt(lastActive, inactiveBefore(now)) : undefined,
        after ? sql`(${user.name}, ${user.id}) > (${after.name}, ${after.id})` : undefined,
      ),
    )
    .orderBy(asc(user.name), asc(user.id))
    .limit(PAGE_SIZE + 1);

  const cutoff = inactiveBefore(now);
  const items = rows.slice(0, PAGE_SIZE).map((row): AdminUserRow => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    school: schoolForTenant(row.tenantId) ?? null,
    admin: isAdmin(row.role),
    wardenAdmin: hasRole(row.role, WARDEN_ADMIN_ROLE),
    eventsManager: hasRole(row.role, EVENTS_MANAGER_ROLE),
    createdAt: row.createdAt.toISOString(),
    lastSignInAt: row.lastSignInAt?.toISOString() ?? null,
    inactive: (row.lastSignInAt ?? row.createdAt) < cutoff,
    ban:
      row.banned && (!row.banExpires || row.banExpires > now)
        ? { reason: row.banReason, expiresAt: row.banExpires?.toISOString() ?? null }
        : null,
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.name, last.userId) : null,
  };
}

function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify([name, id])).toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') {
      return { name: value[0], id: value[1] };
    }
  } catch {
    // Falls through to the refusal.
  }
  refuse(400, 'invalidCursor');
}

async function requireTarget(dbx: Db, userId: string) {
  const [row] = await dbx
    .select({ id: user.id, role: user.role, banned: user.banned, banExpires: user.banExpires })
    .from(user)
    .where(eq(user.id, userId))
    .for('update');
  if (!row) refuse(404, 'notFound');
  return row;
}

/**
 * Sets every role at once. An admin can't remove their own admin role, so the site always keeps
 * at least the admin who is acting.
 */
async function setRoles(input: { actorId: string; userId: string; roles: AdminRolesBody }) {
  if (input.userId === input.actorId && !input.roles.admin) refuse(409, 'self');
  await db.transaction(async (tx) => {
    const target = await requireTarget(tx, input.userId);
    const before = {
      admin: isAdmin(target.role),
      wardenAdmin: hasRole(target.role, WARDEN_ADMIN_ROLE),
      eventsManager: hasRole(target.role, EVENTS_MANAGER_ROLE),
    };
    if (
      before.admin === input.roles.admin &&
      before.wardenAdmin === input.roles.wardenAdmin &&
      before.eventsManager === input.roles.eventsManager
    )
      return;
    let role = withRole(target.role, ADMIN_ROLE, input.roles.admin);
    role = withRole(role, WARDEN_ADMIN_ROLE, input.roles.wardenAdmin);
    role = withRole(role, EVENTS_MANAGER_ROLE, input.roles.eventsManager);
    await tx.update(user).set({ role }).where(eq(user.id, input.userId));
    await adminAuditService.record(tx, {
      action: 'user.roles',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { before, after: input.roles },
    });
  });
}

/** Bans from the site and signs out every session. Admins lose their role before a ban. */
async function ban(input: { actorId: string; userId: string; ban: AdminBanBody }) {
  if (input.userId === input.actorId) refuse(409, 'self');
  const expires =
    input.ban.durationSeconds === null
      ? null
      : new Date(Date.now() + input.ban.durationSeconds * 1000);
  await db.transaction(async (tx) => {
    const target = await requireTarget(tx, input.userId);
    if (isAdmin(target.role)) refuse(409, 'targetIsAdmin');
    await tx
      .update(user)
      .set({ banned: true, banReason: input.ban.reason, banExpires: expires })
      .where(eq(user.id, input.userId));
    await tx.delete(session).where(eq(session.userId, input.userId));
    await adminAuditService.record(tx, {
      action: 'user.ban',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { reason: input.ban.reason, expiresAt: expires?.toISOString() ?? null },
    });
  });
}

/** Lifts a site ban in force. */
async function unban(input: { actorId: string; userId: string }) {
  await db.transaction(async (tx) => {
    const target = await requireTarget(tx, input.userId);
    const now = new Date();
    if (!target.banned || (target.banExpires && target.banExpires <= now)) refuse(409, 'notBanned');
    await tx
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(eq(user.id, input.userId));
    await adminAuditService.record(tx, {
      action: 'user.unban',
      actorUserId: input.actorId,
      targetUserId: input.userId,
    });
  });
}

/** Ends every session of the account, on every device. */
async function signOut(input: { actorId: string; userId: string }) {
  await db.transaction(async (tx) => {
    await requireTarget(tx, input.userId);
    await tx.delete(session).where(eq(session.userId, input.userId));
    await adminAuditService.record(tx, {
      action: 'user.signOut',
      actorUserId: input.actorId,
      targetUserId: input.userId,
    });
  });
}

/**
 * Deletes the account and, through the foreign keys, everything that belongs to it. The audit row
 * stays, with its target set to null. Admins lose their role before they can be deleted.
 */
async function remove(input: { actorId: string; userId: string }) {
  if (input.userId === input.actorId) refuse(409, 'self');
  await db.transaction(async (tx) => {
    const target = await requireTarget(tx, input.userId);
    if (isAdmin(target.role)) refuse(409, 'targetIsAdmin');
    await adminAuditService.record(tx, {
      action: 'user.delete',
      actorUserId: input.actorId,
      targetUserId: input.userId,
    });
    await tx.delete(user).where(eq(user.id, input.userId));
    // Their registrations went with the account: the waitlists move up.
    await eventRegistrationService.promoteAll(tx);
  });
}

/**
 * Deletes accounts with no sign-in for 24 months, as the plan requires. Run every night by
 * tasks/users/delete-inactive.ts. Accounts with a site or Warden ban in force are kept: deleting
 * them would let a banned person come back with a fresh account. Returns how many were deleted.
 */
async function deleteInactive(now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(user)
      .where(
        and(
          lt(lastActive, inactiveBefore(now)),
          // Not banned from the site. `banned` can be null on old rows.
          or(
            isNull(user.banned),
            eq(user.banned, false),
            and(isNotNull(user.banExpires), lte(user.banExpires, now)),
          ),
          // Not banned from Warden either.
          notExists(
            tx
              .select({ one: sql`1` })
              .from(wardenBan)
              .where(
                and(
                  eq(wardenBan.userId, user.id),
                  isNull(wardenBan.revokedAt),
                  or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, now)),
                ),
              ),
          ),
        ),
      )
      .returning({ id: user.id });
    if (deleted.length) {
      await eventRegistrationService.promoteAll(tx);
      await adminAuditService.record(tx, {
        action: 'users.deleteInactive',
        actorUserId: null,
        targetUserId: null,
        data: { count: deleted.length },
      });
    }
    return deleted.length;
  });
}

export const usersService = { list, setRoles, ban, unban, signOut, remove, deleteInactive };
