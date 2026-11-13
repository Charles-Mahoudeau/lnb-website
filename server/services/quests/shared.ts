import { createHash } from 'node:crypto';

import { and, desc, eq, gt, inArray, isNotNull, isNull, sql, sum } from 'drizzle-orm';
import { createError } from 'nuxt/server';
import type { z } from 'zod';

import { db } from '~~/server/db';
import type { Db, Tx } from '~~/server/db';
import {
  economyAccount,
  economyMailboxItem,
  minecraftAccount,
  quest,
  questCommunity,
  questCommunityContribution,
  questCompletion,
  questFlashRun,
  questIndexDay,
  questSeason,
  questSettingsRow,
} from '~~/server/db/schema';
import { economyLedger } from '~~/server/services/economy/ledger';

import { applyCap, familyBudget, kPlayer, reward } from './formula';

import type {
  QuestDefinition,
  QuestItemReward,
  QuestProblem,
  QuestSettings,
  QuestShareFamily,
} from '#shared/schemas/quests';
import { questDefinition, questSettings } from '#shared/schemas/quests';

export type { Db, Tx };

export function refuse(status: number, problem: QuestProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

export function hashRequest(canonical: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** The current season, opened if there is none (the migration opens season 1). */
export async function currentSeason(dbx: Db = db): Promise<typeof questSeason.$inferSelect> {
  const [season] = await dbx.select().from(questSeason).where(isNull(questSeason.endedAt));
  if (season) return season;
  const [last] = await dbx.select().from(questSeason).orderBy(desc(questSeason.number)).limit(1);
  const [opened] = await dbx
    .insert(questSeason)
    .values({ number: (last?.number ?? 0) + 1 })
    .onConflictDoNothing()
    .returning();
  return opened ?? currentSeason(dbx);
}

/** The settings, with their defaults filled in. */
export async function getSettings(dbx: Db = db): Promise<QuestSettings> {
  const [row] = await dbx.select().from(questSettingsRow).where(eq(questSettingsRow.id, 1));
  const parsed = questSettings.safeParse(row?.values ?? {});
  return parsed.success ? parsed.data : questSettings.parse({});
}

/** A catalogue row with its definition checked. A row that no longer parses is skipped. */
export function parseQuest(row: { id: string; definition: unknown; enabled: boolean }) {
  const parsed = questDefinition.safeParse({
    ...(row.definition as object),
    id: row.id,
    enabled: row.enabled,
  });
  return parsed.success ? parsed.data : null;
}

export async function loadQuest(dbx: Db, id: string): Promise<QuestDefinition | null> {
  const [row] = await dbx.select().from(quest).where(eq(quest.id, id));
  return row ? parseQuest(row) : null;
}

export async function loadCatalog(dbx: Db = db, enabledOnly = false) {
  const rows = await dbx
    .select()
    .from(quest)
    .where(enabledOnly ? eq(quest.enabled, true) : undefined)
    .orderBy(quest.sortOrder, quest.id);
  return rows.flatMap((row) => {
    const parsed = parseQuest(row);
    return parsed ? [parsed] : [];
  });
}

/** The latest index, or the reference index before the first nightly run. */
export async function todayIndex(dbx: Db = db, settings?: QuestSettings) {
  const [row] = await dbx.select().from(questIndexDay).orderBy(desc(questIndexDay.day)).limit(1);
  if (row) return { index: row.index, kGlobal: row.kGlobal };
  const values = settings ?? (await getSettings(dbx));
  return { index: values.formula.baselineIndex, kGlobal: 1 };
}

/** LNBits in every open account. */
export async function circulation(dbx: Db): Promise<number> {
  const [row] = await dbx
    .select({ total: sum(economyAccount.balance) })
    .from(economyAccount)
    .where(isNull(economyAccount.closedAt));
  return Number(row?.total ?? 0);
}

/** What a family paid (or reserved, for unclaimed tiers) over the last 30 days. */
export async function spentLast30Days(dbx: Db, family: QuestShareFamily): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  if (family === 'individual' || family === 'server') {
    const [row] = await dbx
      .select({ total: sum(questCompletion.amount) })
      .from(questCompletion)
      .where(and(eq(questCompletion.family, family), gt(questCompletion.completedAt, since)));
    return Number(row?.total ?? 0);
  }
  if (family === 'flash') {
    const [row] = await dbx
      .select({ total: sum(questFlashRun.amount) })
      .from(questFlashRun)
      .where(gt(questFlashRun.endedAt, since));
    return Number(row?.total ?? 0);
  }
  const [row] = await dbx
    .select({ total: sum(questCommunityContribution.payout) })
    .from(questCommunityContribution)
    .innerJoin(questCommunity, eq(questCommunity.id, questCommunityContribution.communityId))
    .where(and(isNotNull(questCommunity.paidAt), gt(questCommunity.paidAt, since)));
  return Number(row?.total ?? 0);
}

/**
 * A reward through the whole formula: Rbase × Kglobal × Kplayer, then the family's cap. The
 * player's balance is their personal balance now.
 */
export async function priceReward(
  dbx: Db,
  input: { base: number; family: QuestShareFamily; balance: number; settings: QuestSettings },
) {
  const today = await todayIndex(dbx, input.settings);
  const player = kPlayer(input.balance, today.index, input.settings.formula);
  const raw = reward(input.base, today.kGlobal, player);
  const budget = familyBudget(input.family, await circulation(dbx), input.settings.cap);
  const spent = budget === null ? 0 : await spentLast30Days(dbx, input.family);
  const capped = applyCap(raw, budget, spent);
  return { ...capped, kGlobal: today.kGlobal, kPlayer: player };
}

/** Lines of the mint memo: the quest's French name, as players see it in the game. */
export function memoFor(definition: QuestDefinition, tier?: number) {
  return tier ? `${definition.name.fr}, palier ${String(tier)}` : definition.name.fr;
}

/**
 * Pays a reward in the caller's transaction: a `mint` with the reason `questReward` on the
 * player's personal account (none for 0), and the items to their mailbox.
 */
export async function payReward(
  tx: Tx,
  input: {
    userId: string;
    personalAccountId: string;
    amount: number;
    items: readonly QuestItemReward[];
    memo: string;
    actor:
      { source: 'minecraft'; minecraftUuid: string } | { source: 'web' } | { source: 'system' };
    idempotencyKey?: string;
    fingerprint?: string;
  },
) {
  let transactionId: number | null = null;
  let balance: number | null = null;
  if (input.amount > 0) {
    const actor =
      input.actor.source === 'minecraft'
        ? {
            source: 'minecraft' as const,
            userId: input.userId,
            minecraftUuid: input.actor.minecraftUuid,
          }
        : input.actor.source === 'web'
          ? { source: 'web' as const, userId: input.userId }
          : { source: 'system' as const };
    const posted = await economyLedger.post(tx, {
      kind: 'mint',
      reason: 'questReward',
      memo: input.memo,
      actor,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      legs: [
        { accountId: null, amount: -input.amount },
        { accountId: input.personalAccountId, amount: input.amount },
      ],
    });
    transactionId = posted.transactionId;
    balance = posted.balances.get(input.personalAccountId) ?? null;
  }
  if (input.items.length) {
    await tx.insert(economyMailboxItem).values(
      input.items.map((item) => ({
        userId: input.userId,
        reason: 'questReward' as const,
        itemId: item.id,
        itemSnbt: item.snbt,
        itemName: item.name,
        count: item.count,
      })),
    );
  }
  return {
    transactionId,
    to:
      transactionId === null
        ? null
        : { accountId: input.personalAccountId, handle: null, balance: balance ?? 0 },
    mailboxItems: input.items.length,
  };
}

/** The Minecraft usernames of these accounts. */
export async function usernames(dbx: Db, uuids: readonly string[]) {
  if (!uuids.length) return new Map<string, string>();
  const rows = await dbx
    .select({ uuid: minecraftAccount.uuid, username: minecraftAccount.username })
    .from(minecraftAccount)
    .where(inArray(minecraftAccount.uuid, [...uuids]));
  return new Map(rows.map((row) => [row.uuid, row.username]));
}

/** Serialises writes on one key for the rest of the transaction (ranks, community payouts). */
export async function lockKey(tx: Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

/** Checks a request part with a schema: a 400 naming the first problem when it doesn't match. */
export function validate<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw createError({ status: 400, statusText: `${where}${issue?.message ?? 'Bad Request'}` });
  }
  return result.data;
}
