import { createError } from 'nuxt/server';

import type { Db, Tx } from '~~/server/db';

import type { WardenProblem } from '#shared/schemas/warden';

export type { Db, Tx };

export function refuse(status: number, problem: WardenProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** Who did something: a site user, Minecraft staff through the server, or the site itself. */
export type WardenActor =
  | { source: 'web'; userId: string }
  | {
      source: 'minecraft';
      userId: string | null;
      minecraft: { uuid: string; username: string } | null;
    }
  | { source: 'system' };
