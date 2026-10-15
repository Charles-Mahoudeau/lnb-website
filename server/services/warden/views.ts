import { inArray } from 'drizzle-orm';

import { user } from '~~/server/db/schema';
import type { WardenSource, wardenAppeal, wardenBan, wardenNote } from '~~/server/db/schema';

import { isBanActive } from './rules';
import type { Db } from './shared';

import type {
  WardenActorView,
  WardenAppealView,
  WardenBanView,
  WardenNoteView,
} from '#shared/schemas/warden';

// Turns Warden rows into what the API returns, with the names of the staff involved.

export type Names = ReadonlyMap<string, string>;

/** The names of these users, in one query. */
export async function namesOf(dbx: Db, ids: (string | null | undefined)[]): Promise<Names> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await dbx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function actorView(
  names: Names,
  source: WardenSource | null,
  userId: string | null,
  minecraft: { uuid: string | null; name: string | null },
): WardenActorView {
  if (source === 'system') return { kind: 'system' };
  if (source === 'minecraft') {
    if (minecraft.uuid && minecraft.name) {
      return { kind: 'minecraft', uuid: minecraft.uuid, username: minecraft.name, userId };
    }
    return { kind: 'console' };
  }
  return userId ? { kind: 'user', userId, name: names.get(userId) ?? null } : { kind: 'system' };
}

type BanRow = typeof wardenBan.$inferSelect;

export function banView(ban: BanRow, names: Names, now = new Date()): WardenBanView {
  return {
    id: ban.id,
    reason: ban.reason,
    createdAt: ban.createdAt.toISOString(),
    expiresAt: ban.expiresAt?.toISOString() ?? null,
    active: isBanActive(ban, now),
    source: ban.source,
    minecraftUuid: ban.minecraftUuid,
    issuedBy: actorView(names, ban.source, ban.issuedByUserId, {
      uuid: ban.issuedByMinecraftUuid,
      name: ban.issuedByMinecraftName,
    }),
    revoked: ban.revokedAt
      ? {
          at: ban.revokedAt.toISOString(),
          by: actorView(names, ban.revokeSource, ban.revokedByUserId, {
            uuid: ban.revokedByMinecraftUuid,
            name: ban.revokedByMinecraftName,
          }),
          source: ban.revokeSource ?? 'web',
          reason: ban.revokeReason,
        }
      : null,
  };
}

export function banNameIds(ban: BanRow) {
  return [ban.issuedByUserId, ban.revokedByUserId];
}

type NoteRow = typeof wardenNote.$inferSelect;

export function noteView(note: NoteRow, names: Names): WardenNoteView {
  return {
    id: note.id,
    kind: note.kind,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    source: note.source,
    author: actorView(names, note.source, note.authorUserId, {
      uuid: note.authorMinecraftUuid,
      name: note.authorMinecraftName,
    }),
  };
}

type AppealRow = typeof wardenAppeal.$inferSelect;

export function appealView(appeal: AppealRow, names: Names): WardenAppealView {
  return {
    id: appeal.id,
    body: appeal.body,
    createdAt: appeal.createdAt.toISOString(),
    status: appeal.status,
    response: appeal.response,
    decidedAt: appeal.decidedAt?.toISOString() ?? null,
    decidedBy: appeal.decidedByUserId
      ? actorView(names, 'web', appeal.decidedByUserId, { uuid: null, name: null })
      : null,
  };
}
