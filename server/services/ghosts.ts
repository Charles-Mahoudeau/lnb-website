import { randomUUID } from 'node:crypto';

import { and, eq, ne, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { user } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import type {
  AdminGhost,
  AdminGhostBody,
  AdminGhostUpdateBody,
  AdminProblem,
} from '#shared/schemas/admin';
import { schoolForTenant } from '#shared/utils/schools';

// Ghost accounts: accounts an admin or events manager makes for someone who hasn't signed in yet.
// The person takes the same account over at their first Microsoft sign-in (server/lib/ghosts.ts).
// See docs/ghost-accounts.md.

function refuse(status: number, problem: AdminProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

type Row = { id: string; name: string; email: string; tenantId: string };

const view = (row: Row): AdminGhost => ({
  userId: row.id,
  name: row.name,
  email: row.email,
  school: schoolForTenant(row.tenantId) ?? null,
});

/** Whether an account other than `exceptId` has this email, whatever its case. */
async function emailTaken(dbx: Db, email: string, exceptId?: string): Promise<boolean> {
  const [row] = await dbx
    .select({ id: user.id })
    .from(user)
    .where(and(sql`lower(${user.email}) = ${email}`, exceptId ? ne(user.id, exceptId) : undefined))
    .limit(1);
  return row !== undefined;
}

/** A unique violation, from the driver or wrapped by Drizzle. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } }).code;
  return code === '23505' || (error as { cause?: { code?: string } }).cause?.code === '23505';
}

/**
 * Makes a ghost. The email is the one the person signs in with, and the school is the only one
 * allowed to take it over. Refused when an account already has the email, ghost or not.
 */
async function create(input: { actorId: string; body: AdminGhostBody }): Promise<AdminGhost> {
  const { name, email, tenantId } = input.body;
  try {
    return await db.transaction(async (tx) => {
      if (await emailTaken(tx, email)) refuse(409, 'emailTaken');
      const [row] = await tx
        .insert(user)
        .values({
          id: randomUUID(),
          name,
          email,
          // The admin vouches for the email: Better Auth only links an account that has it.
          emailVerified: true,
          tenantId,
          ghost: true,
        })
        .returning({ id: user.id, name: user.name, email: user.email, tenantId: user.tenantId });
      if (!row) throw new Error('The ghost was not inserted.');
      await adminAuditService.record(tx, {
        action: 'user.ghostCreate',
        actorUserId: input.actorId,
        targetUserId: row.id,
        data: { email, tenantId },
      });
      return view(row);
    });
  } catch (error) {
    // Two admins making the same ghost at once.
    if (isUniqueViolation(error)) refuse(409, 'emailTaken');
    throw error;
  }
}

/** Changes a ghost's name, email or school. Once the person has signed in, it isn't a ghost. */
async function update(input: {
  actorId: string;
  userId: string;
  body: AdminGhostUpdateBody;
}): Promise<AdminGhost> {
  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: user.id, ghost: user.ghost })
        .from(user)
        .where(eq(user.id, input.userId))
        .for('update');
      if (!target) refuse(404, 'notFound');
      if (!target.ghost) refuse(409, 'notGhost');
      if (input.body.email && (await emailTaken(tx, input.body.email, input.userId))) {
        refuse(409, 'emailTaken');
      }
      const [row] = await tx
        .update(user)
        .set(input.body)
        .where(and(eq(user.id, input.userId), eq(user.ghost, true)))
        .returning({ id: user.id, name: user.name, email: user.email, tenantId: user.tenantId });
      if (!row) refuse(409, 'notGhost');
      await adminAuditService.record(tx, {
        action: 'user.ghostUpdate',
        actorUserId: input.actorId,
        targetUserId: input.userId,
        data: { fields: Object.keys(input.body) },
      });
      return view(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'emailTaken');
    throw error;
  }
}

export const ghostService = { create, update };
