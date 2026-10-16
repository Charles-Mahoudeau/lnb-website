import { createError } from 'nuxt/server';

import type { EventProblem } from '#shared/schemas/events';

export function refuse(status: number, problem: EventProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}
