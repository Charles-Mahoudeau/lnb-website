import { and, asc, desc, eq, ilike, lt, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatActionTaken,
  anticheatFile,
  anticheatPlayer,
  anticheatPlayerEvent,
  anticheatReport,
  anticheatReportFile,
  anticheatUsage,
  minecraftAccount,
  user,
} from '~~/server/db/schema';

import { playerBandOf } from './rules';
import { anticheatSettingsService } from './settings';
import { decodeOffset, encodeOffset, likeEscape, PAGE_SIZE, refuse } from './shared';
import type { Db } from './shared';

import type {
  AnticheatPlayerDetail,
  AnticheatPlayerRow,
  AnticheatPlayersQuery,
  AnticheatTimelineEvent,
} from '#shared/schemas/anticheat';
import { fileStatus } from '#shared/utils/anticheat';

// What the admin reads about players: the list, one player, and the timeline of the trust score.
// The writes are in trust.ts and admin.ts. See docs/anticheat.md.

const EVENT_PAGE = 30;
const USAGE_LIMIT = 200;

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** The latest Minecraft username of a player, as a correlated subquery. */
const latestUsername = sql<string | null>`(
  select ${minecraftAccount.username} from ${minecraftAccount}
  where ${minecraftAccount.userId} = ${user.id}
  order by ${minecraftAccount.lastSeenAt} desc nulls last, ${minecraftAccount.linkedAt} desc
  limit 1)`;

const lastSeen = sql<Date | null>`(
  select max(${minecraftAccount.lastSeenAt}) from ${minecraftAccount}
  where ${minecraftAccount.userId} = ${user.id})`.mapWith((value: unknown) =>
  value === null ? null : new Date(value as string),
);

/** Players with a trust score, the lowest first. */
async function players(query: AnticheatPlayersQuery): Promise<Page<AnticheatPlayerRow>> {
  const { rules } = await anticheatSettingsService.get();
  const offset = decodeOffset(query.cursor);
  const search = query.q ? `%${likeEscape(query.q)}%` : undefined;
  const bands: Record<NonNullable<AnticheatPlayersQuery['band']>, SQL> = {
    zero: sql`${anticheatPlayer.score} <= 0`,
    held: sql`${anticheatPlayer.score} > 0 and ${anticheatPlayer.score} < ${rules.player.held}`,
    normal: sql`${anticheatPlayer.score} >= ${rules.player.held} and ${anticheatPlayer.score} < ${rules.player.trusted}`,
    trusted: sql`${anticheatPlayer.score} >= ${rules.player.trusted}`,
  };
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      username: latestUsername,
      score: anticheatPlayer.score,
      manualHold: anticheatPlayer.manualHold,
      lastSeenAt: lastSeen,
    })
    .from(anticheatPlayer)
    .innerJoin(user, eq(user.id, anticheatPlayer.userId))
    .where(
      and(
        query.band ? bands[query.band] : undefined,
        search
          ? or(
              ilike(user.name, search),
              ilike(user.email, search),
              sql`exists (select 1 from ${minecraftAccount} where ${minecraftAccount.userId} = ${user.id} and ${minecraftAccount.username} ilike ${search})`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(anticheatPlayer.score), asc(user.name), asc(user.id))
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  return {
    items: rows.slice(0, PAGE_SIZE).map((row) => ({
      player: { userId: row.userId, name: row.name, username: row.username },
      score: row.score,
      band: playerBandOf(row.score, rules),
      manualHold: row.manualHold,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    })),
    nextCursor: rows.length > PAGE_SIZE ? encodeOffset(offset + PAGE_SIZE) : null,
  };
}

/** The timeline of a player's score, newest first. `cursor` is the last ID of the previous page. */
async function events(
  userId: string,
  cursor?: string,
  database: Db = db,
): Promise<Page<AnticheatTimelineEvent>> {
  let before: number | undefined;
  if (cursor) {
    before = Number(cursor);
    if (!Number.isSafeInteger(before) || before < 1) refuse(400, 'invalidCursor');
  }
  const rows = await database
    .select({ event: anticheatPlayerEvent, actor: user.name })
    .from(anticheatPlayerEvent)
    .leftJoin(user, eq(user.id, anticheatPlayerEvent.actorUserId))
    .where(
      and(
        eq(anticheatPlayerEvent.userId, userId),
        before ? lt(anticheatPlayerEvent.id, before) : undefined,
      ),
    )
    .orderBy(desc(anticheatPlayerEvent.id))
    .limit(EVENT_PAGE + 1);
  const page = rows.slice(0, EVENT_PAGE);
  return {
    items: page.map(({ event, actor }) => ({
      id: event.id,
      kind: event.kind,
      delta: event.delta,
      applied: event.applied,
      scoreAfter: event.scoreAfter,
      actor,
      data: event.data,
      at: event.at.toISOString(),
    })),
    nextCursor: rows.length > EVENT_PAGE ? String(page.at(-1)!.event.id) : null,
  };
}

/** One player: score, hold, timeline, the latest report's files, usage and the server's actions. */
async function player(userId: string): Promise<AnticheatPlayerDetail> {
  const { rules } = await anticheatSettingsService.get();
  const [row] = await db
    .select({
      userId: user.id,
      name: user.name,
      username: latestUsername,
      score: anticheatPlayer.score,
      manualHold: anticheatPlayer.manualHold,
      holdReason: anticheatPlayer.holdReason,
      holdAt: anticheatPlayer.holdAt,
    })
    .from(user)
    .leftJoin(anticheatPlayer, eq(anticheatPlayer.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) refuse(404, 'notFound');
  const score = row.score ?? rules.player.start;

  const [latest] = await db
    .select({ id: anticheatReport.id, createdAt: anticheatReport.createdAt })
    .from(anticheatReport)
    .where(eq(anticheatReport.userId, userId))
    .orderBy(desc(anticheatReport.createdAt), desc(anticheatReport.seq))
    .limit(1);

  const otherUsers = sql<number>`(
    select count(*) from ${anticheatUsage} u2
    where u2.sha512 = ${anticheatUsage.sha512} and u2.user_id <> ${userId})`.mapWith(Number);
  const [timeline, reportFiles, usage, actions] = await Promise.all([
    events(userId),
    latest
      ? db
          .select({ report: anticheatReportFile, file: anticheatFile })
          .from(anticheatReportFile)
          .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatReportFile.sha512))
          .where(eq(anticheatReportFile.reportId, latest.id))
          .orderBy(asc(anticheatReportFile.score), asc(anticheatReportFile.filename))
      : [],
    db
      .select({
        usage: anticheatUsage,
        file: anticheatFile,
        otherUsers,
      })
      .from(anticheatUsage)
      .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatUsage.sha512))
      .where(and(eq(anticheatUsage.userId, userId), ne(anticheatFile.kind, 'client')))
      .orderBy(asc(otherUsers), desc(anticheatUsage.firstSeenAt), asc(anticheatUsage.sha512))
      .limit(USAGE_LIMIT),
    db
      .select()
      .from(anticheatActionTaken)
      .where(eq(anticheatActionTaken.userId, userId))
      .orderBy(desc(anticheatActionTaken.id))
      .limit(50),
  ]);

  return {
    player: { userId: row.userId, name: row.name, username: row.username },
    score,
    band: playerBandOf(score, rules),
    adjustment: Math.round((score - 50) * rules.player.adjustFactor),
    manualHold: row.manualHold ?? false,
    holdReason: row.holdReason,
    holdAt: row.holdAt?.toISOString() ?? null,
    events: timeline,
    files: reportFiles.map(({ report, file }) => ({
      sha512: report.sha512,
      kind: report.kind,
      filename: report.filename,
      score: report.score,
      effectiveScore: report.effectiveScore,
      band: report.band,
      status: fileStatus(file),
      action: report.action,
    })),
    reportAt: latest?.createdAt.toISOString() ?? null,
    usage: usage.map(({ usage: u, file, otherUsers }) => ({
      sha512: u.sha512,
      kind: file.kind,
      filename: file.filename,
      score: file.score,
      status: fileStatus(file),
      otherUsers,
      firstSeenAt: u.firstSeenAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
      sessionCount: u.sessionCount,
    })),
    actions: actions.map((action) => ({
      id: action.id,
      action: action.action,
      reason: action.reason,
      sha512: action.sha512,
      at: action.at.toISOString(),
    })),
  };
}

export const anticheatRosterService = { players, player, events };
