import { and, asc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import {
  partnerEvent,
  partnerEventGame,
  partnerEventInterest,
  partnerEventTeam,
  partnerEventTeamMember,
  user,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { eventImageService } from '~~/server/services/events/images';

import { exportXlsx } from './partner-events-export';
import type { ExportReferent, ExportTeam } from './partner-events-export';

import type {
  PartnerAdminView,
  PartnerEventProblem,
  PartnerEventSettingsBody,
  PartnerGameKey,
  PartnerGameSettingsBody,
  PartnerReferentRole,
  PartnerTeamReferentBody,
} from '#shared/schemas/partner-events';
import { PARTNER_EVENT_PURGE_DAYS } from '#shared/schemas/partner-events';
import { schoolForTenant } from '#shared/utils/schools';

// What events managers do on a partner event: its settings, each game's referent, the lists, the
// spreadsheet for the organizer, closing and the deletion that follows. See
// docs/partner-events.md.

function refuse(status: number, problem: PartnerEventProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

const mediaUrl = (key: string | null) => (key ? `/api/media/${key}` : null);
const DAY = 24 * 60 * 60 * 1000;

async function findEvent(tx: Tx | typeof db, slug: string) {
  const [row] = await tx.select().from(partnerEvent).where(eq(partnerEvent.slug, slug));
  if (!row) refuse(404, 'partnerEventNotFound');
  return row;
}

async function requireImage(key: string | null | undefined) {
  if (key && !(await eventImageService.exists(key))) refuse(404, 'imageNotFound');
}

const gameReferent = (game: typeof partnerEventGame.$inferSelect) => ({
  pseudo: game.referentPseudo,
  email: game.referentEmail,
  birthDate: game.referentBirthDate,
  role: game.referentRole as PartnerReferentRole,
});

const purgeAt = (closedAt: Date | null) =>
  closedAt ? new Date(closedAt.getTime() + PARTNER_EVENT_PURGE_DAYS * DAY) : null;

/** Everything the admin page shows. Personal data, so only for events managers. */
async function view(slug: string): Promise<PartnerAdminView> {
  const row = await findEvent(db, slug);
  const games = await db
    .select()
    .from(partnerEventGame)
    .where(eq(partnerEventGame.partnerEventId, row.id))
    .orderBy(asc(partnerEventGame.position));
  const ids = games.map((game) => game.id);
  const keyOf = new Map(games.map((game) => [game.id, game.key as PartnerGameKey]));
  const teams = ids.length
    ? await db
        .select()
        .from(partnerEventTeam)
        .where(inArray(partnerEventTeam.gameId, ids))
        .orderBy(asc(partnerEventTeam.createdAt))
    : [];
  const members = ids.length
    ? await db
        .select({
          teamId: partnerEventTeamMember.teamId,
          userId: partnerEventTeamMember.userId,
          role: partnerEventTeamMember.role,
          gameId: partnerEventTeamMember.gameId,
        })
        .from(partnerEventTeamMember)
        .where(inArray(partnerEventTeamMember.gameId, ids))
    : [];
  const interests = ids.length
    ? await db
        .select({
          gameId: partnerEventInterest.gameId,
          userId: partnerEventInterest.userId,
          inGameName: partnerEventInterest.inGameName,
          rank: partnerEventInterest.rank,
          hidden: partnerEventInterest.hidden,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
        })
        .from(partnerEventInterest)
        .innerJoin(user, eq(user.id, partnerEventInterest.userId))
        .where(inArray(partnerEventInterest.gameId, ids))
        .orderBy(asc(partnerEventInterest.createdAt))
    : [];
  const nameOf = new Map(interests.map((i) => [i.userId, i.name]));
  const inTeam = new Set(members.map((m) => `${m.gameId}:${m.userId}`));

  return {
    slug: row.slug,
    websiteUrl: row.websiteUrl,
    discordUrl: row.discordUrl,
    hero: mediaUrl(row.heroKey),
    heroKey: row.heroKey,
    dateTextEn: row.dateTextEn,
    dateTextFr: row.dateTextFr,
    dateConfirmed: row.dateConfirmed,
    interestOpen: row.interestOpen,
    teamsOpen: row.teamsOpen,
    closedAt: row.closedAt?.toISOString() ?? null,
    purgeAt: purgeAt(row.closedAt)?.toISOString() ?? null,
    games: games.map((game) => ({
      key: game.key as PartnerGameKey,
      status: game.status as 'confirmed' | 'study',
      starters: game.starters,
      substitutes: game.substitutes,
      art: mediaUrl(game.artKey),
      artKey: game.artKey,
      referent: gameReferent(game),
      interested: interests.filter((i) => i.gameId === game.id).length,
      teams: teams.filter((t) => t.gameId === game.id).length,
      players: members.filter((m) => m.gameId === game.id).length,
    })),
    teams: teams.map((team) => {
      const ms = members.filter((m) => m.teamId === team.id);
      const starters = ms.filter((m) => m.role === 'starter').length;
      return {
        id: team.id,
        game: keyOf.get(team.gameId)!,
        name: team.name,
        abbreviation: team.abbreviation,
        starters,
        substitutes: ms.length - starters,
        captain: team.captainUserId ? (nameOf.get(team.captainUserId) ?? null) : null,
        referent: team.referentPseudo
          ? {
              pseudo: team.referentPseudo,
              email: team.referentEmail ?? '',
              birthDate: team.referentBirthDate,
              role: (team.referentRole ?? 'Manager') as PartnerReferentRole,
            }
          : null,
      };
    }),
    interest: interests.map((i) => ({
      userId: i.userId,
      name: i.name,
      email: i.email,
      school: schoolForTenant(i.tenantId) ?? null,
      game: keyOf.get(i.gameId)!,
      inGameName: i.inGameName,
      rank: i.rank,
      status: inTeam.has(`${i.gameId}:${i.userId}`) ? 'team' : i.hidden ? 'hidden' : 'looking',
    })),
  };
}

async function updateSettings(input: {
  actorId: string;
  slug: string;
  body: PartnerEventSettingsBody;
}): Promise<void> {
  await requireImage(input.body.heroKey);
  await db.transaction(async (tx) => {
    const row = await findEvent(tx, input.slug);
    if (Object.keys(input.body).length > 0) {
      await tx.update(partnerEvent).set(input.body).where(eq(partnerEvent.id, row.id));
    }
    await adminAuditService.record(tx, {
      action: 'partnerEvent.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: row.slug, fields: Object.keys(input.body) },
    });
  });
}

/**
 * Changes a game: its status, places, art and referent. A game with teams cannot go back to
 * "under study", and fewer places than a team already uses are refused.
 */
async function updateGame(input: {
  actorId: string;
  slug: string;
  game: PartnerGameKey;
  body: PartnerGameSettingsBody;
}): Promise<void> {
  await requireImage(input.body.artKey);
  await db.transaction(async (tx) => {
    const row = await findEvent(tx, input.slug);
    const [game] = await tx
      .select()
      .from(partnerEventGame)
      .where(and(eq(partnerEventGame.partnerEventId, row.id), eq(partnerEventGame.key, input.game)))
      .for('update');
    if (!game) refuse(404, 'gameNotFound');
    const next = { ...input.body };
    if (next.status === 'study' || next.starters !== undefined || next.substitutes !== undefined) {
      const counts = await tx
        .select({ teamId: partnerEventTeamMember.teamId, role: partnerEventTeamMember.role })
        .from(partnerEventTeamMember)
        .where(eq(partnerEventTeamMember.gameId, game.id));
      if (next.status === 'study' && counts.length > 0) refuse(409, 'gameHasTeams');
      const byTeam = Map.groupBy(counts, (c) => c.teamId);
      const starters = next.starters ?? game.starters;
      const substitutes = next.substitutes ?? game.substitutes;
      for (const ms of byTeam.values()) {
        const s = ms.filter((m) => m.role === 'starter').length;
        if (s > starters || ms.length - s > substitutes) refuse(409, 'placesInUse');
      }
    }
    if (Object.keys(next).length > 0) {
      await tx.update(partnerEventGame).set(next).where(eq(partnerEventGame.id, game.id));
    }
    await adminAuditService.record(tx, {
      action: 'partnerEvent.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: row.slug, game: input.game, fields: Object.keys(next) },
    });
  });
}

/** Sets or clears the referent of one team, replacing its game's in the export. */
async function setTeamReferent(input: {
  actorId: string;
  slug: string;
  teamId: string;
  body: PartnerTeamReferentBody;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await findEvent(tx, input.slug);
    const games = tx
      .select({ id: partnerEventGame.id })
      .from(partnerEventGame)
      .where(eq(partnerEventGame.partnerEventId, row.id));
    const r = input.body.referent;
    const updated = await tx
      .update(partnerEventTeam)
      .set({
        referentPseudo: r?.pseudo ?? null,
        referentEmail: r?.email ?? null,
        referentBirthDate: r?.birthDate ?? null,
        referentRole: r?.role ?? null,
      })
      .where(and(eq(partnerEventTeam.id, input.teamId), inArray(partnerEventTeam.gameId, games)))
      .returning({ id: partnerEventTeam.id });
    if (updated.length === 0) refuse(404, 'teamNotFound');
    await adminAuditService.record(tx, {
      action: 'partnerEvent.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: row.slug, team: input.teamId, referent: r !== null },
    });
  });
}

/** An events manager disbands a team: its players keep their interest. */
async function disbandTeam(input: {
  actorId: string;
  slug: string;
  teamId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await findEvent(tx, input.slug);
    const games = tx
      .select({ id: partnerEventGame.id })
      .from(partnerEventGame)
      .where(eq(partnerEventGame.partnerEventId, row.id));
    const removed = await tx
      .delete(partnerEventTeam)
      .where(and(eq(partnerEventTeam.id, input.teamId), inArray(partnerEventTeam.gameId, games)))
      .returning({ id: partnerEventTeam.id });
    if (removed.length === 0) refuse(404, 'teamNotFound');
    await adminAuditService.record(tx, {
      action: 'partnerEvent.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: row.slug, disbanded: input.teamId },
    });
  });
}

/** Closing makes the page read-only and starts the countdown to the deletion. */
async function close(input: { actorId: string; slug: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await findEvent(tx, input.slug);
    if (row.closedAt) return;
    await tx.update(partnerEvent).set({ closedAt: new Date() }).where(eq(partnerEvent.id, row.id));
    await adminAuditService.record(tx, {
      action: 'partnerEvent.close',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: row.slug },
    });
  });
}

/** Reopening cancels the countdown. Data already deleted does not come back. */
async function reopen(input: { actorId: string; slug: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await findEvent(tx, input.slug);
    if (!row.closedAt) return;
    await tx.update(partnerEvent).set({ closedAt: null }).where(eq(partnerEvent.id, row.id));
    await adminAuditService.record(tx, {
      action: 'partnerEvent.reopen',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: row.slug },
    });
  });
}

/** The spreadsheet for the organizer. Teams of confirmed games only. */
async function exportSheet(input: { actorId: string; slug: string }): Promise<Buffer> {
  const data = await view(input.slug);
  const league = (key: PartnerGameKey) =>
    ({ lol: 'LOL', valorant: 'Valorant', 'rocket-league': 'Rocket League', cs2: 'CS2' })[key];
  const teamIds = data.teams.map((t) => t.id);
  const members =
    teamIds.length === 0
      ? []
      : await db
          .select({
            teamId: partnerEventTeamMember.teamId,
            userId: partnerEventTeamMember.userId,
            role: partnerEventTeamMember.role,
            birthDate: partnerEventTeamMember.birthDate,
            email: user.email,
            name: user.name,
          })
          .from(partnerEventTeamMember)
          .innerJoin(user, eq(user.id, partnerEventTeamMember.userId))
          .where(inArray(partnerEventTeamMember.teamId, teamIds))
          .orderBy(asc(partnerEventTeamMember.id));
  const captainRows =
    teamIds.length === 0
      ? []
      : await db
          .select({ id: partnerEventTeam.id, captain: partnerEventTeam.captainUserId })
          .from(partnerEventTeam)
          .where(inArray(partnerEventTeam.id, teamIds));
  const captainOf = new Map(captainRows.map((t) => [t.id, t.captain]));
  const interestOf = new Map(data.interest.map((i) => [`${i.game}:${i.userId}`, i]));

  const teams: ExportTeam[] = data.teams.map((team) => {
    const game = data.games.find((g) => g.key === team.game)!;
    const referent: ExportReferent = team.referent ?? game.referent;
    return {
      league: league(team.game),
      name: team.name,
      abbreviation: team.abbreviation,
      referent,
      players: members
        .filter((m) => m.teamId === team.id)
        .map((m) => ({
          inGameName: interestOf.get(`${team.game}:${m.userId}`)?.inGameName || m.name,
          role:
            m.userId === captainOf.get(team.id) ? 'captain' : (m.role as 'starter' | 'substitute'),
          email: m.email,
          birthDate: m.birthDate,
        })),
    };
  });
  const interest = data.interest.map((i) => ({
    name: i.name,
    school: i.school,
    email: i.email,
    league: league(i.game),
    inGameName: i.inGameName,
    rank: i.rank,
    status: { team: 'En équipe', looking: 'Cherche une équipe', hidden: 'Masqué' }[i.status],
  }));

  await db.transaction((tx) =>
    adminAuditService.record(tx, {
      action: 'partnerEvent.export',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { slug: input.slug, teams: teams.length },
    }),
  );
  return exportXlsx(teams, interest);
}

/**
 * Deletes the interest, teams, invitations and dates of birth of events closed for 60 days. The
 * event and its games stay, as does the page, read-only. Returns how many events were purged.
 */
async function purgeClosed(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PARTNER_EVENT_PURGE_DAYS * DAY);
  const due = await db
    .select()
    .from(partnerEvent)
    .where(and(isNotNull(partnerEvent.closedAt), lt(partnerEvent.closedAt, cutoff)));
  let purged = 0;
  for (const row of due) {
    const ids = (
      await db
        .select({ id: partnerEventGame.id })
        .from(partnerEventGame)
        .where(eq(partnerEventGame.partnerEventId, row.id))
    ).map((g) => g.id);
    if (ids.length === 0) continue;
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerEventInterest)
      .where(inArray(partnerEventInterest.gameId, ids))) as [{ n: number }];
    if (n === 0) continue;
    await db.transaction(async (tx) => {
      await tx.delete(partnerEventTeam).where(inArray(partnerEventTeam.gameId, ids));
      await tx.delete(partnerEventInterest).where(inArray(partnerEventInterest.gameId, ids));
      await adminAuditService.record(tx, {
        action: 'partnerEvent.purge',
        actorUserId: null,
        targetUserId: null,
        data: { slug: row.slug, interest: n },
      });
    });
    purged++;
  }
  return purged;
}

export const partnerEventAdminService = {
  view,
  updateSettings,
  updateGame,
  setTeamReferent,
  disbandTeam,
  close,
  reopen,
  exportSheet,
  purgeClosed,
};
