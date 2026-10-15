import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { wardenBan } from '~~/server/db/schema';

import type { Db } from './shared';

/** The player's active ban, if any. */
async function activeBan(userId: string, dbx: Db = db) {
  const [ban] = await dbx
    .select()
    .from(wardenBan)
    .where(
      and(
        eq(wardenBan.userId, userId),
        isNull(wardenBan.revokedAt),
        or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(wardenBan.createdAt))
    .limit(1);
  return ban;
}

export const wardenModerationService = { activeBan };
