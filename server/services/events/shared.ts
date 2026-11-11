import { createError } from 'nuxt/server';

import type { EventProblem } from '#shared/schemas/events';

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
