import { and, asc, count, countDistinct, eq, inArray, notInArray } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import {
  partnerEvent,
  partnerEventGame,
  partnerEventInterest,
  partnerEventTeam,
} from '~~/server/db/schema';
import { flagService } from '~~/server/services/flags';
import { partnerTeamService } from '~~/server/services/partner-teams';

import type {
  PartnerEventProblem,
  PartnerEventView,
  PartnerGameKey,
  PartnerGameStatus,
  PartnerInterestBody,
} from '#shared/schemas/partner-events';
import { partnerInterestBody } from '#shared/schemas/partner-events';

// Pages for events another organization runs (/special/<slug>): the games, and the students'
// interest in them. Teams, the admin and push come later. See docs/partner-events.md.

function refuse(status: number, problem: PartnerEventProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** Event images are kept by content and served from our own domain. */
function mediaUrl(key: string | null): string | null {
  return key ? `/api/media/${key}` : null;
}

async function findEvent(slug: string) {
  const [row] = await db.select().from(partnerEvent).where(eq(partnerEvent.slug, slug));
  if (!row) refuse(404, 'partnerEventNotFound');
  return row;
}

/** Saving interest is open unless the event is closed, an admin paused it or the flag is off. */
async function interestIsOpen(row: { interestOpen: boolean; closedAt: Date | null }) {
  return (
    row.interestOpen && !row.closedAt && (await flagService.isEnabled('partnerEvents.interest'))
  );
}

/** The page's data. `userId` adds the student's own interest. */
async function view(slug: string, userId: string | null): Promise<PartnerEventView> {
  const row = await findEvent(slug);
  const games = await db
    .select()
    .from(partnerEventGame)
    .where(eq(partnerEventGame.partnerEventId, row.id))
    .orderBy(asc(partnerEventGame.position));
  const gameIds = games.map((game) => game.id);

  const counts = gameIds.length
    ? await db
        .select({ gameId: partnerEventInterest.gameId, total: count() })
        .from(partnerEventInterest)
        .where(inArray(partnerEventInterest.gameId, gameIds))
        .groupBy(partnerEventInterest.gameId)
    : [];
  const totals = new Map(counts.map((entry) => [entry.gameId, entry.total]));

  const teamCounts = gameIds.length
    ? await db
        .select({ gameId: partnerEventTeam.gameId, total: count() })
        .from(partnerEventTeam)
        .where(inArray(partnerEventTeam.gameId, gameIds))
        .groupBy(partnerEventTeam.gameId)
    : [];
  const teamTotals = new Map(teamCounts.map((entry) => [entry.gameId, entry.total]));

  const [studentCount] = gameIds.length
    ? await db
        .select({ total: countDistinct(partnerEventInterest.userId) })
        .from(partnerEventInterest)
        .where(inArray(partnerEventInterest.gameId, gameIds))
    : [];

  let mine: PartnerEventView['mine'] = null;
  if (userId) {
    const rows = gameIds.length
      ? await db
          .select()
          .from(partnerEventInterest)
          .where(
            and(
              eq(partnerEventInterest.userId, userId),
              inArray(partnerEventInterest.gameId, gameIds),
            ),
          )
      : [];
    const keyOf = new Map(games.map((game) => [game.id, game.key as PartnerGameKey]));
    mine = games.flatMap((game) => {
      const interest = rows.find((entry) => entry.gameId === game.id);
      return interest
        ? [
            {
              game: keyOf.get(game.id)!,
              inGameName: interest.inGameName,
              rank: interest.rank,
              hidden: interest.hidden,
            },
          ]
        : [];
    });
  }

  return {
    slug: row.slug,
    websiteUrl: row.websiteUrl,
    discordUrl: row.discordUrl,
    hero: mediaUrl(row.heroKey),
    dateText: { en: row.dateTextEn, fr: row.dateTextFr },
    dateConfirmed: row.dateConfirmed,
    interestOpen: await interestIsOpen(row),
    teamsOpen: row.teamsOpen && !row.closedAt,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    students: studentCount?.total ?? 0,
    games: games.map((game) => ({
      key: game.key as PartnerGameKey,
      status: game.status as PartnerGameStatus,
      starters: game.starters,
      substitutes: game.substitutes,
      art: mediaUrl(game.artKey),
      interested: totals.get(game.id) ?? 0,
      teams: teamTotals.get(game.id) ?? 0,
    })),
    mine,
  };
}

/**
 * Replaces the student's interest: the games listed are kept or added, the others withdrawn. An
 * empty list withdraws everything, which stays possible while interest is paused.
 */
async function saveInterest(input: {
  userId: string;
  slug: string;
  body: PartnerInterestBody;
}): Promise<PartnerEventView> {
  const body = partnerInterestBody.parse(input.body);
  const row = await findEvent(input.slug);
  if (row.closedAt) refuse(409, 'partnerEventClosed');
  if (body.games.length > 0) {
    if (!body.consent) refuse(400, 'consentRequired');
    if (!(await interestIsOpen(row))) refuse(409, 'interestClosed');
  }

  await db.transaction(async (tx) => {
    const games = await tx
      .select({ id: partnerEventGame.id, key: partnerEventGame.key })
      .from(partnerEventGame)
      .where(eq(partnerEventGame.partnerEventId, row.id));
    const idOf = new Map(games.map((game) => [game.key, game.id]));
    const chosen = body.games.map((entry) => {
      const gameId = idOf.get(entry.game);
      if (!gameId) refuse(404, 'partnerEventNotFound');
      return { ...entry, gameId };
    });

    const allIds = games.map((game) => game.id);
    const keptIds = chosen.map((entry) => entry.gameId);
    // Withdrawing from a game also leaves its team.
    for (const gameId of allIds.filter((id) => !keptIds.includes(id))) {
      await partnerTeamService.withdrawFromGame(tx, gameId, input.userId);
    }
    if (allIds.length > 0) {
      await tx
        .delete(partnerEventInterest)
        .where(
          and(
            eq(partnerEventInterest.userId, input.userId),
            inArray(partnerEventInterest.gameId, allIds),
            keptIds.length > 0 ? notInArray(partnerEventInterest.gameId, keptIds) : undefined,
          ),
        );
    }
    const now = new Date();
    for (const entry of chosen) {
      await tx
        .insert(partnerEventInterest)
        .values({
          gameId: entry.gameId,
          userId: input.userId,
          inGameName: entry.inGameName,
          rank: entry.rank,
          hidden: entry.hidden,
          consentedAt: now,
        })
        .onConflictDoUpdate({
          target: [partnerEventInterest.gameId, partnerEventInterest.userId],
          set: {
            inGameName: entry.inGameName,
            rank: entry.rank,
            hidden: entry.hidden,
            updatedAt: now,
          },
        });
    }
  });

  return view(input.slug, input.userId);
}

export const partnerEventService = { view, saveInterest };
