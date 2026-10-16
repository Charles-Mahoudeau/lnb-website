import { asc, eq, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { eventRoom } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { refuse } from './shared';

import type { EventRoomBody, EventRoomPatchBody, EventRoomView } from '#shared/schemas/events';

// Where events happen. A room is archived rather than deleted, so the events that used it keep
// it. Archiving only takes it out of the form's list.

type Row = typeof eventRoom.$inferSelect;

export function roomView(row: Row): EventRoomView {
  return { id: row.id, name: row.name, details: row.details, archived: row.archivedAt !== null };
}

/** Every room, those in use first, by name. */
async function list(): Promise<EventRoomView[]> {
  const rows = await db
    .select()
    .from(eventRoom)
    .orderBy(sql`${eventRoom.archivedAt} IS NOT NULL`, asc(sql`lower(${eventRoom.name})`));
  return rows.map(roomView);
}

async function create(input: { actorId: string; body: EventRoomBody }): Promise<EventRoomView> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(eventRoom)
        .values({ name: input.body.name, details: input.body.details ?? null })
        .returning();
      await adminAuditService.record(tx, {
        action: 'eventRoom.create',
        actorUserId: input.actorId,
        targetUserId: null,
        data: { id: row!.id, name: row!.name },
      });
      return roomView(row!);
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'duplicateName');
    throw error;
  }
}

async function update(input: {
  actorId: string;
  id: string;
  patch: EventRoomPatchBody;
}): Promise<EventRoomView> {
  const { patch } = input;
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(eventRoom)
        .set({
          name: patch.name,
          details: patch.details === undefined ? undefined : patch.details || null,
          archivedAt:
            patch.archived === undefined
              ? undefined
              : patch.archived
                ? sql`coalesce(${eventRoom.archivedAt}, now())`
                : null,
        })
        .where(eq(eventRoom.id, input.id))
        .returning();
      if (!row) refuse(404, 'roomNotFound');
      await adminAuditService.record(tx, {
        action: 'eventRoom.update',
        actorUserId: input.actorId,
        targetUserId: null,
        data: { id: row.id, name: row.name, patch },
      });
      return roomView(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'duplicateName');
    throw error;
  }
}

export const eventRoomService = { list, create, update };
