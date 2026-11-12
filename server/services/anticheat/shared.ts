import { createError } from 'nuxt/server';

import type { Db, Tx } from '~~/server/db';

import type { AnticheatProblem } from '#shared/schemas/anticheat';

export type { Db, Tx };
export type { WardenActor as AnticheatActor } from '~~/server/services/warden/shared';

export function refuse(status: number, problem: AnticheatProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** Admin lists are paged by offset: the registries are small and their order isn't a stored column. */
export const PAGE_SIZE = 50;

export function encodeOffset(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

export function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = Number(Buffer.from(cursor, 'base64url').toString());
  if (!Number.isSafeInteger(offset) || offset < 0) refuse(400, 'invalidCursor');
  return offset;
}

/** The ID of the person behind an actor, or null for the system. */
export function actorUserId(actor: { source: string; userId?: string | null }): string | null {
  return actor.source === 'system' ? null : (actor.userId ?? null);
}

/** Escapes `%`, `_` and `\` for a LIKE pattern. */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
