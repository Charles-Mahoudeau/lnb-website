import { createError } from 'nuxt/server';

import type { Db, Tx } from '~~/server/db';

import type { AnticheatProblem } from '#shared/schemas/anticheat';

export type { Db, Tx };
export type { WardenActor as AnticheatActor } from '~~/server/services/warden/shared';

export function refuse(status: number, problem: AnticheatProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}
