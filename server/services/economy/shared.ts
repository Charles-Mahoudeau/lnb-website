import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import type { Db, Tx } from '~~/server/db';
import { user, wardenBan } from '~~/server/db/schema';

import type { EconomyProblem } from '#shared/schemas/economy';

export type { Db, Tx };

export function refuse(status: number, problem: EconomyProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** Who did something: a player through the Minecraft server, someone on the site, or the site. */
export type EconomyActor =
  | { source: 'minecraft'; userId: string | null; minecraftUuid: string | null }
  | { source: 'web'; userId: string }
  | { source: 'system' };

/**
 * The accounts among `userIds` with a site or Warden ban in force. Their personal accounts are
 * frozen: no money goes in or out (docs/economy.md).
 */
export async function bannedUsers(dbx: Db, userIds: readonly string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const now = new Date();
  const [site, warden] = await Promise.all([
    dbx
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          inArray(user.id, [...userIds]),
          eq(user.banned, true),
          or(isNull(user.banExpires), gt(user.banExpires, now)),
        ),
      ),
    dbx
      .select({ id: wardenBan.userId })
      .from(wardenBan)
      .where(
        and(
          inArray(wardenBan.userId, [...userIds]),
          isNull(wardenBan.revokedAt),
          or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, now)),
        ),
      ),
  ]);
  return new Set([...site, ...warden].map((row) => row.id));
}

/** A cursor is the last ID of the previous page. */
export function decodeCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return undefined;
  const id = Number(cursor);
  if (!Number.isSafeInteger(id) || id <= 0) refuse(400, 'invalidCursor');
  return id;
}

export const PAGE_SIZE = 50;
