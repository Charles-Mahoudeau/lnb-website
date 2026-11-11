import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import type { Tx } from '~~/server/db';
import { event } from '~~/server/db/schema';

import type { EventProblem } from '#shared/schemas/events';

/** Locks the event row for the transaction, so counts made next can't change under it. */
export async function lockEvent(tx: Tx, eventId: string): Promise<typeof event.$inferSelect> {
  const [row] = await tx.select().from(event).where(eq(event.id, eventId)).for('update');
  if (!row) refuse(404, 'notFound');
  return row;
}

/**
 * The limit on people. In a team event capacity counts validated teams, so people are never
 * limited and never wait: they register, then join or create a team.
 */
export function peopleCapacity(row: { teamMode: boolean; capacity: number | null }): number | null {
  return row.teamMode ? null : row.capacity;
}

export function refuse(status: number, problem: EventProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}
