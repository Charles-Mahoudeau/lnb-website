import { asc, eq, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { eventType } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { refuse } from './shared';

import type { EventTypeBody, EventTypePatchBody, EventTypeView } from '#shared/schemas/events';

// Kinds of events, such as Tournament. Archived rather than deleted, like rooms.

type Row = typeof eventType.$inferSelect;

export function typeView(row: Row): EventTypeView {
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameFr: row.nameFr,
    icon: row.icon,
    archived: row.archivedAt !== null,
  };
}

/** Every type, those in use first, by English name. */
async function list(): Promise<EventTypeView[]> {
  const rows = await db
    .select()
    .from(eventType)
    .orderBy(sql`${eventType.archivedAt} IS NOT NULL`, asc(sql`lower(${eventType.nameEn})`));
  return rows.map(typeView);
}

async function create(input: { actorId: string; body: EventTypeBody }): Promise<EventTypeView> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(eventType).values(input.body).returning();
      await adminAuditService.record(tx, {
        action: 'eventType.create',
        actorUserId: input.actorId,
        targetUserId: null,
        data: { id: row!.id, name: row!.nameEn },
      });
      return typeView(row!);
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'duplicateName');
    throw error;
  }
}

async function update(input: {
  actorId: string;
  id: string;
  patch: EventTypePatchBody;
}): Promise<EventTypeView> {
  const { archived, ...fields } = input.patch;
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(eventType)
        .set({
          ...fields,
          archivedAt:
            archived === undefined
              ? undefined
              : archived
                ? sql`coalesce(${eventType.archivedAt}, now())`
                : null,
        })
        .where(eq(eventType.id, input.id))
        .returning();
      if (!row) refuse(404, 'typeNotFound');
      await adminAuditService.record(tx, {
        action: 'eventType.update',
        actorUserId: input.actorId,
        targetUserId: null,
        data: { id: row.id, name: row.nameEn, patch: input.patch },
      });
      return typeView(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'duplicateName');
    throw error;
  }
}

export const eventTypeService = { list, create, update };
