import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  economyAccount,
  minecraftAccount,
  questCommunity,
  questCompletion,
  questFlashRun,
  questIndexDay,
  questProgress,
  questSeason,
} from '~~/server/db/schema';

import { communityService } from './community';
import { kPlayer, reward } from './formula';
import { currentSeason, getSettings, loadCatalog, todayIndex } from './shared';

import type { QuestDefinition, QuestItemReward } from '#shared/schemas/quests';

// The public quests page: the catalogue with today's amounts, podiums, the community quest, the
// flash history and the leaderboard, plus the signed-in player's own progress. See docs/quests.md.

async function overview(input: { seasonNumber?: number; userId?: string }) {
  const settings = await getSettings();
  const current = await currentSeason();
  const seasons = await db.select().from(questSeason).orderBy(desc(questSeason.number));
  const season = seasons.find((row) => row.number === input.seasonNumber) ?? current;
  const isCurrent = season.id === current.id;
  const [catalog, today, indexDays] = await Promise.all([
    loadCatalog(db, true),
    todayIndex(db, settings),
    db.select().from(questIndexDay).orderBy(desc(questIndexDay.day)).limit(30),
  ]);

  const completions = await db
    .select({
      questId: questCompletion.questId,
      family: questCompletion.family,
      rank: questCompletion.rank,
      tier: questCompletion.tier,
      userId: questCompletion.userId,
      username: questCompletion.username,
      minecraftUuid: questCompletion.minecraftUuid,
      amount: questCompletion.amount,
      completedAt: questCompletion.completedAt,
      claimedAt: questCompletion.claimedAt,
      id: questCompletion.id,
    })
    .from(questCompletion)
    .where(eq(questCompletion.seasonId, season.id))
    .orderBy(asc(questCompletion.rank), asc(questCompletion.completedAt));

  const podiums: Record<
    string,
    { rank: number; username: string; uuid: string; amount: number }[]
  > = {};
  const rest: Record<string, number> = {};
  for (const row of completions) {
    if (row.family !== 'server' || row.rank === null) continue;
    if (row.rank <= 3)
      (podiums[row.questId] ??= []).push({
        rank: row.rank,
        username: row.username,
        uuid: row.minecraftUuid,
        amount: row.amount,
      });
    else rest[row.questId] = (rest[row.questId] ?? 0) + 1;
  }

  const flash = await db
    .select()
    .from(questFlashRun)
    .where(eq(questFlashRun.seasonId, season.id))
    .orderBy(desc(questFlashRun.endedAt))
    .limit(50);

  // Leaderboard: completions (claimed or ranked), flash wins and community payouts, per LNB account.
  const board = await db.execute<{
    username: string;
    uuid: string;
    quests: number | string;
    lnbits: number | string;
  }>(sql`
    with earned as (
      select user_id, minecraft_uuid as uuid, username, amount from quest_completion
        where season_id = ${season.id} and user_id is not null
      union all
      select winner_user_id, winner_minecraft_uuid, winner_username, amount from quest_flash_run
        where season_id = ${season.id} and winner_user_id is not null
      union all
      select c.user_id, null, c.username, coalesce(c.payout, 0) from quest_community_contribution c
        join quest_community q on q.id = c.community_id
        where q.season_id = ${season.id} and c.payout > 0
    )
    select max(username) as username, max(uuid::text) as uuid, count(*)::int as quests, sum(amount)::bigint as lnbits
      from earned group by user_id order by lnbits desc limit 50
  `);

  const community = isCurrent ? await communityService.running() : null;
  const pastCommunity = await db
    .select({ id: questCommunity.id })
    .from(questCommunity)
    .where(
      and(
        eq(questCommunity.seasonId, season.id),
        sql`${questCommunity.status} in ('paid', 'cancelled')`,
      ),
    )
    .limit(1);

  let me = null;
  if (input.userId) {
    const userId = input.userId;
    const [linked] = await db
      .select({ uuid: minecraftAccount.uuid, username: minecraftAccount.username })
      .from(minecraftAccount)
      .where(and(eq(minecraftAccount.userId, userId), isNull(minecraftAccount.unlinkedAt)))
      .limit(1);
    if (linked) {
      const [personal] = await db
        .select({ balance: economyAccount.balance })
        .from(economyAccount)
        .where(and(eq(economyAccount.ownerUserId, userId), eq(economyAccount.kind, 'personal')));
      const progress = await db
        .select({ questId: questProgress.questId, value: questProgress.value })
        .from(questProgress)
        .where(and(eq(questProgress.seasonId, season.id), eq(questProgress.userId, userId)));
      const mine = completions.filter((row) => row.userId === userId);
      me = {
        username: linked.username,
        uuid: linked.uuid,
        kPlayer: kPlayer(personal?.balance ?? 0, today.index, settings.formula),
        progress: Object.fromEntries(progress.map((row) => [row.questId, row.value])),
        completions: mine
          .filter((row) => row.family === 'individual')
          .map((row) => ({
            id: row.id,
            quest: row.questId,
            tier: row.tier,
            amount: row.amount,
            completedAt: row.completedAt.toISOString(),
            claimedAt: row.claimedAt?.toISOString() ?? null,
          })),
        ranks: Object.fromEntries(
          mine.filter((row) => row.rank !== null).map((row) => [row.questId, row.rank]),
        ),
        community: isCurrent ? await communityService.contributionOf(userId) : null,
        earned: mine.reduce((total, row) => total + row.amount, 0),
        done: mine.length,
      };
    }
  }

  return {
    season: {
      number: season.number,
      current: isCurrent,
      startedAt: season.startedAt.toISOString(),
    },
    seasons: seasons.map((row) => ({
      number: row.number,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
    })),
    index: { ...today, baseline: settings.formula.baselineIndex },
    indexDays: indexDays
      .reverse()
      .map((row) => ({ day: row.day, index: row.index, kGlobal: row.kGlobal })),
    quests: catalog.map((quest) => ({
      ...withoutSnbt(maskSecret(quest, podiums)),
      today:
        quest.family === 'individual'
          ? quest.tiers.map((tier) => reward(tier.reward, today.kGlobal, 1))
          : quest.family === 'server'
            ? [...quest.ranks, quest.restShare].map((share) =>
                reward((quest.reward * share) / 100, today.kGlobal, 1),
              )
            : [reward(quest.rewardPerUnit, today.kGlobal, 1)],
    })),
    podiums,
    rest,
    community,
    pastCommunity: pastCommunity.length ? await communityService.past(10) : [],
    flash: flash.map((row) => ({
      id: row.id,
      quest: row.questId,
      quantity: row.quantity,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt.toISOString(),
      winner: row.winnerUsername,
      winnerUuid: row.winnerMinecraftUuid,
      amount: row.amount,
    })),
    leaderboard: board.rows.map((row) => ({
      username: row.username,
      uuid: row.uuid,
      quests: Number(row.quests),
      lnbits: Number(row.lnbits),
    })),
    me,
  };
}

/**
 * A secret server quest is "???" until someone takes first place: no name, description, icon or
 * advancement, so the page can't give it away. Its rewards and podium places stay.
 */
function maskSecret(quest: QuestDefinition, podiums: Record<string, unknown[]>) {
  if (quest.family !== 'server' || !quest.hidden || podiums[quest.id]?.length) return quest;
  return {
    ...quest,
    name: { fr: '???', en: '???' },
    description: undefined,
    icon: 'minecraft:paper',
    advancement: 'minecraft:hidden',
  };
}

/** The page only needs item names: the SNBT stays between the site and the server. */
function withoutSnbt(quest: QuestDefinition) {
  const strip = (items: QuestItemReward[]) => items.map(({ snbt: _snbt, ...item }) => item);
  if (quest.family === 'individual')
    return { ...quest, tiers: quest.tiers.map((tier) => ({ ...tier, items: strip(tier.items) })) };
  if (quest.family === 'server') return { ...quest, items: strip(quest.items) };
  return quest;
}

export const questPublicService = { overview };
