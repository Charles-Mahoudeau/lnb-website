import { and, asc, count, eq, gt, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { event, eventRegistration, user } from '~~/server/db/schema';
import type { EventRegistrationStatus } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { placesToPromote, registrationState } from './rules';
import { refuse } from './shared';

import type {
  EventRegistrationResult,
  EventRegistrationRow,
  EventUserOption,
} from '#shared/schemas/events';
import { schoolForTenant } from '#shared/utils/schools';

// Who's going to an event. Places go in order of registration: past the limit, people join the
// waitlist, and the first in line gets a place as soon as one frees up, until the event starts.
// Every change locks the event row first, so two people can't take the last place at once.

type EventRow = typeof event.$inferSelect;

async function lockEvent(tx: Tx, eventId: string): Promise<EventRow> {
  const [row] = await tx.select().from(event).where(eq(event.id, eventId)).for('update');
  if (!row) refuse(404, 'notFound');
  return row;
}

async function counts(tx: Tx, eventId: string) {
  const rows = await tx
    .select({ status: eventRegistration.status, n: count() })
    .from(eventRegistration)
    .where(eq(eventRegistration.eventId, eventId))
    .groupBy(eventRegistration.status);
  const of = (status: EventRegistrationStatus) => rows.find((r) => r.status === status)?.n ?? 0;
  return { registered: of('registered'), waitlist: of('waitlist') };
}

/** Moves the first people on the waitlist to the free places. Returns who got one. */
async function promote(tx: Tx, row: EventRow, now = new Date()): Promise<string[]> {
  const n = placesToPromote({ ...row, ...(await counts(tx, row.id)) }, now);
  if (n === 0) return [];
  const next = await tx
    .select({ id: eventRegistration.id, userId: eventRegistration.userId })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.eventId, row.id), eq(eventRegistration.status, 'waitlist')))
    .orderBy(asc(eventRegistration.id))
    .limit(n);
  await tx
    .update(eventRegistration)
    .set({ status: 'registered' })
    .where(
      inArray(
        eventRegistration.id,
        next.map((r) => r.id),
      ),
    );
  return next.map((r) => r.userId);
}

/** After a capacity change: promotes into the new places. The caller holds the event lock. */
async function promoteAfterChange(tx: Tx, eventId: string): Promise<string[]> {
  return promote(tx, await lockEvent(tx, eventId));
}

/**
 * Promotes on every event still to come whose waitlist has free places in front of it. Called
 * after accounts are deleted, since the foreign keys free their places without a word.
 */
async function promoteAll(tx: Tx): Promise<void> {
  const events = await tx
    .selectDistinct({ id: event.id })
    .from(event)
    .innerJoin(eventRegistration, eq(eventRegistration.eventId, event.id))
    .where(and(gt(event.startsAt, new Date()), eq(eventRegistration.status, 'waitlist')));
  for (const { id } of events) await promoteAfterChange(tx, id);
}

/** Where someone stands on an event: registered, or their place on the waitlist. */
async function standing(dbx: Tx | typeof db, eventId: string, userId: string) {
  const [mine] = await dbx
    .select({ id: eventRegistration.id, status: eventRegistration.status })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.eventId, eventId), eq(eventRegistration.userId, userId)));
  if (!mine) return null;
  if (mine.status === 'registered') return { status: 'registered' as const, position: null };
  const [ahead] = await dbx
    .select({ n: count() })
    .from(eventRegistration)
    .where(
      and(
        eq(eventRegistration.eventId, eventId),
        eq(eventRegistration.status, 'waitlist'),
        lt(eventRegistration.id, mine.id),
      ),
    );
  return { status: 'waitlist' as const, position: (ahead?.n ?? 0) + 1 };
}

/** Registers someone, or puts them on the waitlist when the event is full. */
async function register(input: {
  userId: string;
  tenantId: string;
  eventId: string;
}): Promise<EventRegistrationResult> {
  return db.transaction(async (tx) => {
    const row = await lockEvent(tx, input.eventId);
    if (row.hidden) refuse(404, 'notFound');
    const existing = await standing(tx, input.eventId, input.userId);
    if (existing) return existing;
    const { registered } = await counts(tx, row.id);
    const state = registrationState({ ...row, registered }, input.tenantId);
    if (state !== 'open' && state !== 'full') refuse(409, state);
    await tx.insert(eventRegistration).values({
      eventId: row.id,
      userId: input.userId,
      status: state === 'open' ? 'registered' : 'waitlist',
    });
    return (await standing(tx, row.id, input.userId))!;
  });
}

/** Cancels a registration or leaves the waitlist, until the event starts. */
async function unregister(input: { userId: string; eventId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockEvent(tx, input.eventId);
    if (new Date() >= row.startsAt) refuse(409, 'started');
    const [deleted] = await tx
      .delete(eventRegistration)
      .where(and(eq(eventRegistration.eventId, row.id), eq(eventRegistration.userId, input.userId)))
      .returning({ status: eventRegistration.status });
    if (!deleted) refuse(409, 'notRegistered');
    if (deleted.status === 'registered') await promote(tx, row);
  });
}

/**
 * Adds someone by hand, whatever their school or the registration window. Past the limit it's
 * refused, unless `force` registers them anyway.
 */
async function add(input: {
  actorId: string;
  eventId: string;
  userId: string;
  force: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockEvent(tx, input.eventId);
    if (row.cancelledAt) refuse(409, 'cancelled');
    const [target] = await tx
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.id, input.userId));
    if (!target) refuse(404, 'userNotFound');
    const existing = await standing(tx, row.id, input.userId);
    const { registered } = await counts(tx, row.id);
    const full = row.capacity !== null && registered >= row.capacity;
    if (existing?.status === 'registered') refuse(409, 'alreadyRegistered');
    if (full && !input.force) refuse(409, 'full');
    if (existing) {
      await tx
        .update(eventRegistration)
        .set({ status: 'registered', addedByUserId: input.actorId })
        .where(
          and(eq(eventRegistration.eventId, row.id), eq(eventRegistration.userId, input.userId)),
        );
    } else {
      await tx.insert(eventRegistration).values({
        eventId: row.id,
        userId: input.userId,
        status: 'registered',
        addedByUserId: input.actorId,
      });
    }
    await adminAuditService.record(tx, {
      action: 'event.registrationAdd',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { eventId: row.id, name: row.name, force: full },
    });
  });
}

/** Removes someone from the event or its waitlist. The waitlist moves up. */
async function remove(input: { actorId: string; eventId: string; userId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockEvent(tx, input.eventId);
    const [deleted] = await tx
      .delete(eventRegistration)
      .where(and(eq(eventRegistration.eventId, row.id), eq(eventRegistration.userId, input.userId)))
      .returning({ status: eventRegistration.status });
    if (!deleted) refuse(404, 'notRegistered');
    if (deleted.status === 'registered') await promote(tx, row);
    await adminAuditService.record(tx, {
      action: 'event.registrationRemove',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { eventId: row.id, name: row.name },
    });
  });
}

const addedBy = alias(user, 'added_by');

/** Everyone on the event, registered first, then the waitlist in order. */
async function list(eventId: string): Promise<EventRegistrationRow[]> {
  const [exists] = await db.select({ id: event.id }).from(event).where(eq(event.id, eventId));
  if (!exists) refuse(404, 'notFound');
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
      status: eventRegistration.status,
      createdAt: eventRegistration.createdAt,
      addedBy: addedBy.name,
    })
    .from(eventRegistration)
    .innerJoin(user, eq(user.id, eventRegistration.userId))
    .leftJoin(addedBy, eq(addedBy.id, eventRegistration.addedByUserId))
    .where(eq(eventRegistration.eventId, eventId))
    .orderBy(sql`${eventRegistration.status} = 'waitlist'`, asc(eventRegistration.id));
  let position = 0;
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    image: row.image,
    school: schoolForTenant(row.tenantId) ?? null,
    status: row.status,
    position: row.status === 'waitlist' ? ++position : null,
    registeredAt: row.createdAt.toISOString(),
    addedBy: row.addedBy,
  }));
}

/** Tells spreadsheets the file is UTF-8, so accents show right. */
const BOM = String.fromCharCode(0xfeff);

/** A CSV cell: quoted, and safe to open in a spreadsheet (no formula injection). */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The list as CSV, for organizers who print it or import it elsewhere. */
async function csv(eventId: string): Promise<string> {
  const rows = await list(eventId);
  const lines = [
    ['Name', 'Email', 'School', 'Status', 'Waitlist position', 'Registered at (UTC)', 'Added by'],
    ...rows.map((row) => [
      row.name,
      row.email,
      row.school ?? '',
      row.status,
      row.position === null ? '' : String(row.position),
      row.registeredAt,
      row.addedBy ?? '',
    ]),
  ];
  return `${BOM}${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Accounts by name or email, for adding someone by hand. */
async function searchUsers(q: string): Promise<EventUserOption[]> {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, tenantId: user.tenantId })
    .from(user)
    .where(or(ilike(user.name, pattern), ilike(user.email, pattern)))
    .orderBy(asc(user.name))
    .limit(10);
  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    school: schoolForTenant(row.tenantId) ?? null,
  }));
}

/** The first people registered, for "Who's going". */
async function attendees(eventId: string, limit = 6) {
  return db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(eventRegistration)
    .innerJoin(user, eq(user.id, eventRegistration.userId))
    .where(and(eq(eventRegistration.eventId, eventId), eq(eventRegistration.status, 'registered')))
    .orderBy(asc(eventRegistration.id))
    .limit(limit);
}

export const eventRegistrationService = {
  register,
  unregister,
  add,
  remove,
  list,
  csv,
  searchUsers,
  attendees,
  standing: (eventId: string, userId: string) => standing(db, eventId, userId),
  promoteAfterChange,
  promoteAll,
};
