import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { user, wardenBan, wardenNote } from '~~/server/db/schema';

import type { WardenFeed, WardenFeedQuery, WardenFeedRow } from '#shared/schemas/warden';

// Moderation > Bans: every ban in force, then the latest notes and warnings, newest first.

const RECENT = 50;

async function feed(query: WardenFeedQuery): Promise<WardenFeed> {
  const kind = query.kind ?? 'all';
  const rows: WardenFeedRow[] = [];
  if (kind === 'all' || kind === 'ban') {
    const bans = await db
      .select({
        id: wardenBan.id,
        userId: wardenBan.userId,
        name: user.name,
        reason: wardenBan.reason,
        createdAt: wardenBan.createdAt,
        expiresAt: wardenBan.expiresAt,
        by: wardenBan.issuedByMinecraftName,
      })
      .from(wardenBan)
      .innerJoin(user, eq(user.id, wardenBan.userId))
      .where(
        and(
          isNull(wardenBan.revokedAt),
          or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, new Date())),
        ),
      )
      .orderBy(desc(wardenBan.createdAt));
    for (const ban of bans) {
      rows.push({
        kind: 'ban',
        id: ban.id,
        user: { userId: ban.userId, name: ban.name },
        text: ban.reason,
        at: ban.createdAt.toISOString(),
        expiresAt: ban.expiresAt?.toISOString() ?? null,
        by: ban.by,
      });
    }
  }
  if (kind !== 'ban') {
    const notes = await db
      .select({
        id: wardenNote.id,
        kind: wardenNote.kind,
        userId: wardenNote.userId,
        name: user.name,
        body: wardenNote.body,
        createdAt: wardenNote.createdAt,
        by: wardenNote.authorMinecraftName,
      })
      .from(wardenNote)
      .innerJoin(user, eq(user.id, wardenNote.userId))
      .where(kind === 'all' ? undefined : eq(wardenNote.kind, kind))
      .orderBy(desc(wardenNote.createdAt))
      .limit(RECENT);
    for (const note of notes) {
      rows.push({
        kind: note.kind,
        id: note.id,
        user: { userId: note.userId, name: note.name },
        text: note.body,
        at: note.createdAt.toISOString(),
        expiresAt: null,
        by: note.by,
      });
    }
  }
  return { items: rows.sort((a, b) => b.at.localeCompare(a.at)) };
}

export const wardenFeedService = { feed };
