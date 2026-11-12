import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { anticheatAlert, anticheatFile, user } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';

import { latestUsername } from './roster';
import { anticheatSettingsService } from './settings';
import { decodeOffset, encodeOffset, PAGE_SIZE, refuse } from './shared';
import type { Tx } from './shared';

import type {
  AnticheatAlertKind,
  AnticheatAlertRow,
  AnticheatSummary,
} from '#shared/schemas/anticheat';

/**
 * Opens an alert for the admins. One that is still open for the same kind, player and file is not
 * opened twice. Returns whether a new one was created.
 */
async function raise(
  tx: Tx,
  alert: {
    kind: AnticheatAlertKind;
    userId?: string | null;
    sha512?: string | null;
    /** For the event the Minecraft server receives. */
    minecraftUuid?: string | null;
    name?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<boolean> {
  const created = await tx
    .insert(anticheatAlert)
    .values({
      kind: alert.kind,
      userId: alert.userId ?? null,
      sha512: alert.sha512 ?? null,
      data: alert.data ?? {},
    })
    // The partial unique index on open alerts.
    .onConflictDoNothing()
    .returning({ id: anticheatAlert.id });
  if (created.length === 0) return false;
  // The audit row is the event on the Warden stream.
  await wardenAuditService.record(tx, {
    action: 'anticheat.alert',
    actor: { source: 'system' },
    targetUserId: alert.userId ?? null,
    targetMinecraftUuid: alert.minecraftUuid ?? null,
    data: {
      kind: alert.kind,
      userId: alert.userId ?? null,
      uuid: alert.minecraftUuid ?? null,
      sha512: alert.sha512 ?? null,
      name: alert.name ?? null,
    },
  });
  return true;
}

/** Alerts for the admins, the open ones first and the newest first. */
async function list(
  cursor?: string,
): Promise<{ items: AnticheatAlertRow[]; nextCursor: string | null }> {
  const offset = decodeOffset(cursor);
  const dismisser = sql<
    string | null
  >`(select name from ${user} where ${user.id} = ${anticheatAlert.dismissedByUserId})`;
  const rows = await db
    .select({
      alert: anticheatAlert,
      dismissedBy: dismisser,
      playerName: user.name,
      username: latestUsername,
      filename: anticheatFile.filename,
    })
    .from(anticheatAlert)
    .leftJoin(user, eq(user.id, anticheatAlert.userId))
    .leftJoin(anticheatFile, eq(anticheatFile.sha512, anticheatAlert.sha512))
    .orderBy(
      // Open alerts first.
      asc(sql`${anticheatAlert.dismissedAt} is not null`),
      desc(anticheatAlert.createdAt),
      desc(anticheatAlert.id),
    )
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  return {
    items: rows
      .slice(0, PAGE_SIZE)
      .map(({ alert, dismissedBy, playerName, username, filename }) => ({
        id: alert.id,
        kind: alert.kind,
        createdAt: alert.createdAt.toISOString(),
        dismissedAt: alert.dismissedAt?.toISOString() ?? null,
        dismissedBy,
        player:
          alert.userId && playerName !== null
            ? { userId: alert.userId, name: playerName, username }
            : null,
        file: alert.sha512 ? { sha512: alert.sha512, name: filename ?? alert.sha512 } : null,
        data: alert.data,
      })),
    nextCursor: rows.length > PAGE_SIZE ? encodeOffset(offset + PAGE_SIZE) : null,
  };
}

/** Closes an alert. One that is already closed stays as it was. */
async function dismiss(id: number, actorId: string): Promise<void> {
  const [alert] = await db
    .select({ id: anticheatAlert.id })
    .from(anticheatAlert)
    .where(eq(anticheatAlert.id, id));
  if (!alert) refuse(404, 'notFound');
  await db
    .update(anticheatAlert)
    .set({ dismissedAt: new Date(), dismissedByUserId: actorId })
    .where(and(eq(anticheatAlert.id, id), isNull(anticheatAlert.dismissedAt)));
}

/**
 * The counts for the nav badge. A file is in the review queue in the middle band, or in the
 * accepted band until an admin reviews it (shaders are accepted without review).
 */
async function summary(): Promise<AnticheatSummary> {
  const { mode } = await anticheatSettingsService.get();
  const { rows } = await db.execute<{ review: number; waiting: number; alerts: number }>(sql`
    select
      (select count(*)::int from ${anticheatFile}
        where kind in ('mod', 'resourcepack')
          and (band = 'middle' or (band = 'accepted' and reviewed_band is distinct from band))
      ) as review,
      (select count(distinct r.session_id)::int
        from anticheat_report r
        join warden_session s on s.id = r.session_id and s.ended_at is null
        join anticheat_report_file rf on rf.report_id = r.id
        join ${anticheatFile} f on f.sha512 = rf.sha512 and f.kind <> 'client' and f.band is null
        where r.seq = (select max(seq) from anticheat_report where session_id = r.session_id)
      ) as waiting,
      (select count(*)::int from ${anticheatAlert} where dismissed_at is null) as alerts`);
  const counts = rows[0]!;
  return { review: counts.review, waiting: counts.waiting, alerts: counts.alerts, mode };
}

export const anticheatAlertService = { raise, list, dismiss, summary };
