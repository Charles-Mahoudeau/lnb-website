import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import {
  minecraftAccount,
  quest,
  questCommunityBatch,
  questCommunityContribution,
  questCompletion,
  questFlashRun,
  questProgress,
} from '~~/server/db/schema';
import { ownerOf, player } from '~~/server/services/economy/server';

import { communityService } from './community';
import { kPlayer } from './formula';
import {
  currentSeason,
  getSettings,
  hashRequest,
  loadCatalog,
  loadQuest,
  lockKey,
  memoFor,
  payReward,
  priceReward,
  refuse,
  todayIndex,
  usernames,
  validate,
} from './shared';
import type { Db } from './shared';

import type {
  QuestAdvancementBody,
  QuestAdvancementResult,
  QuestClaimResult,
  QuestCompletionBody,
  QuestCompletionResult,
  QuestConfigResult,
  QuestContributionBody,
  QuestFlashBody,
  QuestFlashResult,
  QuestServerPlayerResult,
} from '#shared/schemas/quests';
import {
  questAdvancementBody,
  questCatalogBody,
  questClaimBody,
  questCompletionBody,
  questContributionBody,
  questDefinition,
  questFlashBody,
  questProgressBody,
} from '#shared/schemas/quests';

// What the Minecraft server asks of quests. The server counts and reports; the site decides who
// gets what and pays. Every paying call carries an idempotency key. See docs/quests.md.

/** Everything the server needs to run quests, polled every `pollSeconds`. */
async function config(): Promise<QuestConfigResult> {
  const settings = await getSettings();
  const [season, quests, index, community] = await Promise.all([
    currentSeason(),
    loadCatalog(db, true),
    todayIndex(db, settings),
    communityService.running(),
  ]);
  return {
    season: { id: season.id, number: season.number, startedAt: season.startedAt.toISOString() },
    quests,
    flash: { ...settings.flash, hours: settings.flash.hours ?? null },
    antiCheat: settings.antiCheat,
    community,
    index,
    pollSeconds: settings.pollSeconds,
  };
}

/** Adds the quests of the server's quests.json the site doesn't know. Site edits always win. */
async function seedCatalog(input: unknown) {
  const body = validate(questCatalogBody, input);
  const parsed = body.quests.map((entry, index) => {
    const result = questDefinition.safeParse(entry);
    if (!result.success) {
      createBadQuest(index, result.error.issues[0]?.message ?? 'invalid');
    }
    return result.data;
  });
  const existing = parsed.length
    ? await db
        .select({ id: quest.id })
        .from(quest)
        .where(
          inArray(
            quest.id,
            parsed.map((entry) => entry.id),
          ),
        )
    : [];
  const known = new Set(existing.map((row) => row.id));
  const added: string[] = [];
  for (const [order, definition] of parsed.entries()) {
    if (known.has(definition.id)) continue;
    const { id, enabled, ...rest } = definition;
    const inserted = await db
      .insert(quest)
      .values({
        id,
        family: definition.family,
        definition: rest,
        enabled,
        sortOrder: order,
        source: 'catalog',
      })
      .onConflictDoNothing()
      .returning({ id: quest.id });
    if (inserted.length) added.push(id);
  }
  return { added, kept: [...known] };
}

function createBadQuest(index: number, message: string): never {
  throw createError({ status: 400, statusText: `Quest ${String(index)}: ${message}` });
}

/** The absolute counters of the season, for the progress bars on the site. */
async function progress(input: unknown) {
  const body = validate(questProgressBody, input);
  const season = await currentSeason();
  const uuids = [...new Set(body.items.map((item) => item.player))];
  const owners = await db
    .select({ uuid: minecraftAccount.uuid, userId: minecraftAccount.userId })
    .from(minecraftAccount)
    .where(and(inArray(minecraftAccount.uuid, uuids), isNull(minecraftAccount.unlinkedAt)));
  const userOf = new Map(owners.map((row) => [row.uuid, row.userId]));
  const known = new Set(
    (
      await db
        .select({ id: quest.id })
        .from(quest)
        .where(inArray(quest.id, [...new Set(body.items.map((item) => item.quest))]))
    ).map((row) => row.id),
  );
  // Several Minecraft accounts of one person: keep the largest counter.
  const rows = new Map<string, { questId: string; userId: string; value: number }>();
  for (const item of body.items) {
    const userId = userOf.get(item.player);
    if (!userId || !known.has(item.quest)) continue;
    const key = `${item.quest}:${userId}`;
    const previous = rows.get(key);
    if (!previous || previous.value < item.value)
      rows.set(key, { questId: item.quest, userId, value: item.value });
  }
  if (!rows.size) return;
  await db
    .insert(questProgress)
    .values([...rows.values()].map((row) => ({ ...row, seasonId: season.id })))
    .onConflictDoUpdate({
      target: [questProgress.seasonId, questProgress.questId, questProgress.userId],
      set: { value: sql`greatest(${questProgress.value}, excluded.value)`, updatedAt: new Date() },
    });
}

/** A completion already recorded with this key, or nothing. */
async function previousCompletion(dbx: Db, key: string, print: string) {
  const [row] = await dbx
    .select()
    .from(questCompletion)
    .where(eq(questCompletion.idempotencyKey, key));
  if (!row) return undefined;
  if (row.fingerprint !== print) refuse(409, 'idempotencyMismatch');
  return row;
}

/** An individual tier reached: its amount is frozen now and waits for a claim. */
async function complete(input: QuestCompletionBody): Promise<QuestCompletionResult> {
  const body = validate(questCompletionBody, input);
  const print = hashRequest({
    kind: 'completion',
    player: body.player,
    quest: body.quest,
    tier: body.tier,
  });
  const view = (row: typeof questCompletion.$inferSelect, replayed: boolean) => ({
    completionId: row.id,
    replayed,
    quest: row.questId,
    tier: row.tier,
    amount: row.amount,
    capped: row.capped,
    claimable: row.claimedAt === null,
  });
  const previous = await previousCompletion(db, body.idempotencyKey, print);
  if (previous) return view(previous, true);

  const definition = await loadQuest(db, body.quest);
  if (!definition || definition.family !== 'individual' || !definition.enabled)
    refuse(404, 'unknownQuest');
  const tier = definition.tiers[body.tier - 1];
  if (!tier) refuse(404, 'unknownQuest');

  try {
    return await db.transaction(async (tx) => {
      const who = await player(tx, body.player);
      const season = await currentSeason(tx);
      await lockKey(tx, `quest:${String(season.id)}:${body.quest}:${who.userId}`);
      const done = await tx
        .select({ tier: questCompletion.tier })
        .from(questCompletion)
        .where(
          and(
            eq(questCompletion.seasonId, season.id),
            eq(questCompletion.questId, body.quest),
            eq(questCompletion.userId, who.userId),
          ),
        );
      const tiers = new Set(done.map((row) => row.tier));
      if (tiers.has(body.tier)) refuse(409, 'alreadyCompleted');
      if (body.tier > 1 && !tiers.has(body.tier - 1)) refuse(409, 'tierLocked');
      const settings = await getSettings(tx);
      const price = await priceReward(tx, {
        base: tier.reward,
        family: 'individual',
        balance: who.personal.balance,
        settings,
      });
      const names = await usernames(tx, [body.player]);
      const [row] = await tx
        .insert(questCompletion)
        .values({
          seasonId: season.id,
          questId: body.quest,
          family: 'individual',
          tier: body.tier,
          userId: who.userId,
          minecraftUuid: body.player,
          username: names.get(body.player) ?? '',
          amount: price.amount,
          capped: price.capped,
          kGlobal: price.kGlobal,
          kPlayer: price.kPlayer,
          idempotencyKey: body.idempotencyKey,
          fingerprint: print,
        })
        .returning();
      return view(row!, false);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await previousCompletion(db, body.idempotencyKey, print);
      if (raced) return view(raced, true);
    }
    throw error;
  }
}

/**
 * Pays an unclaimed individual completion, from the game or the site. The same claim key gives
 * back the first answer; another key on a paid completion is `alreadyClaimed`.
 */
async function claim(
  completionId: string,
  input: {
    idempotencyKey: string;
    userId: string;
    actor: { source: 'minecraft'; minecraftUuid: string } | { source: 'web' };
  },
): Promise<QuestClaimResult> {
  const print = hashRequest({ kind: 'claim', completionId, userId: input.userId });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(questCompletion)
      .where(eq(questCompletion.id, completionId))
      .for('update');
    if (!row || row.userId !== input.userId || row.family !== 'individual') refuse(404, 'notFound');
    const definition = await loadQuest(tx, row.questId);
    const items =
      definition?.family === 'individual' ? (definition.tiers[row.tier - 1]?.items ?? []) : [];
    if (row.claimedAt) {
      if (row.claimKey !== input.idempotencyKey) refuse(409, 'alreadyClaimed');
      if (row.claimFingerprint !== print) refuse(409, 'idempotencyMismatch');
      return {
        transactionId: row.transactionId,
        replayed: true,
        amount: row.amount,
        to: null,
        mailboxItems: items.length,
      };
    }
    const account = await playerByUser(tx, input.userId);
    const paid = await payReward(tx, {
      userId: input.userId,
      personalAccountId: account.personal.id,
      amount: row.amount,
      items,
      memo: definition ? memoFor(definition, row.tier) : row.questId,
      actor: input.actor,
    });
    await tx
      .update(questCompletion)
      .set({
        claimedAt: new Date(),
        claimKey: input.idempotencyKey,
        claimFingerprint: print,
        transactionId: paid.transactionId,
      })
      .where(eq(questCompletion.id, row.id));
    return { ...paid, replayed: false, amount: row.amount };
  });
}

/** The eligible player behind an LNB account, through any of its linked Minecraft accounts. */
async function playerByUser(dbx: Db, userId: string) {
  const [linked] = await dbx
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(and(eq(minecraftAccount.userId, userId), isNull(minecraftAccount.unlinkedAt)))
    .limit(1);
  if (!linked) refuse(404, 'notLinked');
  return await player(dbx as never, linked.uuid);
}

/** A claim from the game. */
async function claimFromServer(completionId: string, input: unknown) {
  const body = validate(questClaimBody, input);
  const userId = await ownerOf(db, body.player);
  return claim(completionId, {
    idempotencyKey: body.idempotencyKey,
    userId,
    actor: { source: 'minecraft', minecraftUuid: body.player },
  });
}

/** What the in-game screen shows for a player this season. */
async function playerView(uuid: string): Promise<QuestServerPlayerResult> {
  const userId = await ownerOf(db, uuid);
  const season = await currentSeason();
  const settings = await getSettings();
  const [completions, today, personal] = await Promise.all([
    db
      .select()
      .from(questCompletion)
      .where(and(eq(questCompletion.seasonId, season.id), eq(questCompletion.userId, userId)))
      .orderBy(asc(questCompletion.completedAt)),
    todayIndex(db, settings),
    db.transaction((tx) => player(tx, uuid)).catch(() => null),
  ]);
  const serverIds = completions.filter((row) => row.family === 'server').map((row) => row.questId);
  const podiumRows = await db
    .select({
      questId: questCompletion.questId,
      rank: questCompletion.rank,
      username: questCompletion.username,
      amount: questCompletion.amount,
    })
    .from(questCompletion)
    .where(
      and(
        eq(questCompletion.seasonId, season.id),
        eq(questCompletion.family, 'server'),
        isNotNull(questCompletion.rank),
        sql`${questCompletion.rank} <= 3`,
      ),
    )
    .orderBy(asc(questCompletion.rank));
  const podiums: QuestServerPlayerResult['podiums'] = {};
  for (const row of podiumRows) {
    (podiums[row.questId] ??= []).push({
      rank: row.rank!,
      username: row.username,
      amount: row.amount,
    });
  }
  const community = await communityService.contributionOf(userId);
  return {
    completions: completions
      .filter((row) => row.family === 'individual')
      .map((row) => ({
        id: row.id,
        quest: row.questId,
        tier: row.tier,
        amount: row.amount,
        capped: row.capped,
        completedAt: row.completedAt.toISOString(),
        claimedAt: row.claimedAt?.toISOString() ?? null,
      })),
    podiums,
    ranks: Object.fromEntries(
      completions
        .filter((row) => row.family === 'server' && serverIds.includes(row.questId))
        .map((row) => [row.questId, row.rank!]),
    ),
    kPlayer: kPlayer(personal?.personal.balance ?? 0, today.index, settings.formula),
    community,
  };
}

async function podiumOf(dbx: Db, seasonId: number, questId: string) {
  const rows = await dbx
    .select({
      rank: questCompletion.rank,
      username: questCompletion.username,
      amount: questCompletion.amount,
    })
    .from(questCompletion)
    .where(
      and(
        eq(questCompletion.seasonId, seasonId),
        eq(questCompletion.questId, questId),
        sql`${questCompletion.rank} <= 3`,
      ),
    )
    .orderBy(asc(questCompletion.rank));
  return rows.map((row) => ({ rank: row.rank!, username: row.username, amount: row.amount }));
}

/** A server quest's advancement granted: the next rank of the season, paid at once. */
async function advancement(input: QuestAdvancementBody): Promise<QuestAdvancementResult> {
  const body = validate(questAdvancementBody, input);
  const print = hashRequest({ kind: 'advancement', player: body.player, quest: body.quest });
  const answer = async (
    row: typeof questCompletion.$inferSelect,
    replayed: boolean,
    paid?: Awaited<ReturnType<typeof payReward>>,
  ) => ({
    replayed,
    rank: row.rank!,
    amount: row.amount,
    capped: row.capped,
    transactionId: row.transactionId,
    to: paid?.to ?? null,
    mailboxItems: paid?.mailboxItems ?? 0,
    podium: await podiumOf(db, row.seasonId, row.questId),
  });
  const previous = await previousCompletion(db, body.idempotencyKey, print);
  if (previous) return answer(previous, true);

  const definition = await loadQuest(db, body.quest);
  if (!definition || definition.family !== 'server' || !definition.enabled)
    refuse(404, 'unknownQuest');

  try {
    const { row, paid } = await db.transaction(async (tx) => {
      const who = await player(tx, body.player);
      const season = await currentSeason(tx);
      await lockKey(tx, `quest:${String(season.id)}:${body.quest}`);
      const ranked = await tx
        .select({ userId: questCompletion.userId })
        .from(questCompletion)
        .where(
          and(eq(questCompletion.seasonId, season.id), eq(questCompletion.questId, body.quest)),
        );
      if (ranked.some((entry) => entry.userId === who.userId)) refuse(409, 'alreadyRanked');
      const rank = ranked.length + 1;
      const share = definition.ranks[rank - 1] ?? definition.restShare;
      const settings = await getSettings(tx);
      const price = await priceReward(tx, {
        base: (definition.reward * share) / 100,
        family: 'server',
        balance: who.personal.balance,
        settings,
      });
      const items = rank <= definition.ranks.length ? definition.items : [];
      const paid = await payReward(tx, {
        userId: who.userId,
        personalAccountId: who.personal.id,
        amount: price.amount,
        items,
        memo: `${memoFor(definition)}, ${String(rank)}e`,
        actor: { source: 'minecraft', minecraftUuid: body.player },
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
      });
      const names = await usernames(tx, [body.player]);
      const [row] = await tx
        .insert(questCompletion)
        .values({
          seasonId: season.id,
          questId: body.quest,
          family: 'server',
          tier: 1,
          rank,
          userId: who.userId,
          minecraftUuid: body.player,
          username: names.get(body.player) ?? '',
          amount: price.amount,
          capped: price.capped,
          kGlobal: price.kGlobal,
          kPlayer: price.kPlayer,
          idempotencyKey: body.idempotencyKey,
          fingerprint: print,
          claimedAt: new Date(),
          transactionId: paid.transactionId,
        })
        .returning();
      return { row: row!, paid };
    });
    return await answer(row, false, paid);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await previousCompletion(db, body.idempotencyKey, print);
      if (raced) return answer(raced, true);
    }
    throw error;
  }
}

/** A flash race ended: stored, and its winner paid. */
async function flash(input: QuestFlashBody): Promise<QuestFlashResult> {
  const body = validate(questFlashBody, input);
  const print = hashRequest({ kind: 'flash', ...body, idempotencyKey: undefined });
  const view = (
    row: typeof questFlashRun.$inferSelect,
    replayed: boolean,
    to: QuestFlashResult['to'] = null,
  ) => ({
    replayed,
    flashId: row.id,
    amount: row.amount,
    capped: row.capped,
    transactionId: row.transactionId,
    to,
  });
  const previous = async () => {
    const [row] = await db
      .select()
      .from(questFlashRun)
      .where(eq(questFlashRun.idempotencyKey, body.idempotencyKey));
    if (!row) return undefined;
    if (row.fingerprint !== print) refuse(409, 'idempotencyMismatch');
    return view(row, true);
  };
  const replay = await previous();
  if (replay) return replay;

  const definition = await loadQuest(db, body.quest);
  if (!definition || definition.family !== 'flash') refuse(404, 'unknownQuest');
  const season = await currentSeason();
  const base = {
    seasonId: season.id,
    questId: body.quest,
    quantity: body.quantity,
    startedAt: new Date(body.startedAt),
    endedAt: new Date(body.endedAt),
    idempotencyKey: body.idempotencyKey,
    fingerprint: print,
  };
  try {
    if (!body.winner) {
      const [row] = await db.insert(questFlashRun).values(base).returning();
      return view(row!, false);
    }
    const winner = body.winner;
    return await db.transaction(async (tx) => {
      const who = await player(tx, winner);
      const settings = await getSettings(tx);
      const price = await priceReward(tx, {
        base: definition.rewardPerUnit * body.quantity,
        family: 'flash',
        balance: who.personal.balance,
        settings,
      });
      const paid = await payReward(tx, {
        userId: who.userId,
        personalAccountId: who.personal.id,
        amount: price.amount,
        items: [],
        memo: memoFor(definition),
        actor: { source: 'minecraft', minecraftUuid: winner },
      });
      const names = await usernames(tx, [winner]);
      const [row] = await tx
        .insert(questFlashRun)
        .values({
          ...base,
          winnerUserId: who.userId,
          winnerMinecraftUuid: winner,
          winnerUsername: names.get(winner) ?? '',
          amount: price.amount,
          capped: price.capped,
          transactionId: paid.transactionId,
        })
        .returning();
      return view(row!, false, paid.to);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await previous();
      if (raced) return raced;
    }
    throw error;
  }
}

/** Contributions to the running community quest since the server's last call. */
async function contribute(communityId: string, input: QuestContributionBody) {
  const body = validate(questContributionBody, input);
  const print = hashRequest({ communityId, items: body.items });
  return db.transaction(async (tx) => {
    const community = await communityService.lockForContributions(tx, communityId);
    const [batch] = await tx
      .select()
      .from(questCommunityBatch)
      .where(eq(questCommunityBatch.idempotencyKey, body.idempotencyKey));
    if (batch) {
      if (batch.fingerprint !== print || batch.communityId !== communityId)
        refuse(409, 'idempotencyMismatch');
      return { replayed: true, progress: community.progress, goal: community.goal };
    }
    if (community.status !== 'running') refuse(409, 'communityClosed');
    await tx
      .insert(questCommunityBatch)
      .values({ idempotencyKey: body.idempotencyKey, communityId, fingerprint: print });
    const uuids = [...new Set(body.items.map((item) => item.player))];
    const owners = await tx
      .select({
        uuid: minecraftAccount.uuid,
        userId: minecraftAccount.userId,
        username: minecraftAccount.username,
      })
      .from(minecraftAccount)
      .where(and(inArray(minecraftAccount.uuid, uuids), isNull(minecraftAccount.unlinkedAt)));
    const byUuid = new Map(owners.map((row) => [row.uuid, row]));
    const perUser = new Map<string, { amount: number; username: string }>();
    for (const item of body.items) {
      const owner = byUuid.get(item.player);
      if (!owner) continue;
      const entry = perUser.get(owner.userId) ?? { amount: 0, username: owner.username };
      entry.amount += item.amount;
      perUser.set(owner.userId, entry);
    }
    let added = 0;
    for (const [userId, entry] of perUser) {
      added += entry.amount;
      await tx
        .insert(questCommunityContribution)
        .values({ communityId, userId, username: entry.username, amount: entry.amount })
        .onConflictDoUpdate({
          target: [questCommunityContribution.communityId, questCommunityContribution.userId],
          set: {
            amount: sql`${questCommunityContribution.amount} + ${entry.amount}`,
            username: entry.username,
          },
        });
    }
    const progress = await communityService.addProgress(tx, communityId, added);
    return { replayed: false, progress, goal: community.goal };
  });
}

export const questServerService = {
  config,
  seedCatalog,
  progress,
  complete,
  claim,
  claimFromServer,
  playerView,
  advancement,
  flash,
  contribute,
  playerByUser,
};
