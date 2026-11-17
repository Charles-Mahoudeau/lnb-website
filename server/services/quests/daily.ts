import { and, asc, eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { questDailyCompletion, questDailyDraw } from '~~/server/db/schema';
import { player } from '~~/server/services/economy/server';

import { drawDaily, endOfParisDay, parisDay, previousDay } from './formula';
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
  usernames,
  validate,
} from './shared';
import type { Db } from './shared';

import type { QuestDailyBody, QuestDailyResult, QuestDailyView } from '#shared/schemas/quests';
import { questDailyBody } from '#shared/schemas/quests';

// Daily quests (docs/quests.md): each Paris day, `daily.count` quests of the daily family are drawn
// by weight with a quantity in their range, the same for everyone. Each player who reaches the
// quantity before midnight is paid rewardPerUnit × quantity through the formula, once.

/**
 * The draw of a day, made the first time it is asked for. A day already drawn keeps its quests,
 * even if the catalogue or the count changes later.
 */
async function drawFor(day: string, dbx: Db = db): Promise<QuestDailyView> {
  const view = (rows: { questId: string; quantity: number }[]) => ({
    day,
    endsAt: endOfParisDay(day).toISOString(),
    quests: rows.map((row) => ({ quest: row.questId, quantity: row.quantity })),
  });
  const read = (tx: Db) =>
    tx
      .select({ questId: questDailyDraw.questId, quantity: questDailyDraw.quantity })
      .from(questDailyDraw)
      .where(eq(questDailyDraw.day, day))
      .orderBy(asc(questDailyDraw.slot));
  const existing = await read(dbx);
  if (existing.length || day !== parisDay()) return view(existing);
  const settings = await getSettings(dbx);
  if (settings.daily.count <= 0) return view([]);
  const candidates = (await loadCatalog(dbx, true)).flatMap((quest) =>
    quest.family === 'daily' ? [quest] : [],
  );
  if (!candidates.length) return view([]);
  return db.transaction(async (tx) => {
    await lockKey(tx, `quest:daily:${day}`);
    const again = await read(tx);
    if (again.length) return view(again);
    const drawn = drawDaily(candidates, settings.daily.count);
    await tx.insert(questDailyDraw).values(
      drawn.map((entry, slot) => ({
        day,
        slot,
        questId: entry.quest.id,
        quantity: entry.quantity,
      })),
    );
    return view(drawn.map((entry) => ({ questId: entry.quest.id, quantity: entry.quantity })));
  });
}

/** Today's daily quests. */
function today() {
  return drawFor(parisDay());
}

/** The daily quests of `day` this person finished, with any of their accounts. */
async function doneBy(userId: string, day = parisDay(), dbx: Db = db) {
  const rows = await dbx
    .select({ questId: questDailyCompletion.questId })
    .from(questDailyCompletion)
    .where(and(eq(questDailyCompletion.day, day), eq(questDailyCompletion.userId, userId)));
  return rows.map((row) => row.questId);
}

/** How many people finished each of today's quests. */
async function countsFor(day: string, dbx: Db = db) {
  const rows = await dbx
    .select({ questId: questDailyCompletion.questId })
    .from(questDailyCompletion)
    .where(eq(questDailyCompletion.day, day));
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.questId] = (counts[row.questId] ?? 0) + 1;
  return counts;
}

/**
 * A player reached a daily quest's quantity: paid at once. The day must be today or yesterday (a
 * report sent just before midnight and retried after it), and the quest drawn that day.
 */
async function complete(input: QuestDailyBody): Promise<QuestDailyResult> {
  const body = validate(questDailyBody, input);
  const print = hashRequest({
    kind: 'daily',
    player: body.player,
    day: body.day,
    quest: body.quest,
  });
  const view = (
    row: typeof questDailyCompletion.$inferSelect,
    replayed: boolean,
    to: QuestDailyResult['to'] = null,
  ) => ({
    replayed,
    completionId: row.id,
    quantity: row.quantity,
    amount: row.amount,
    capped: row.capped,
    transactionId: row.transactionId,
    to,
  });
  const previous = async () => {
    const [row] = await db
      .select()
      .from(questDailyCompletion)
      .where(eq(questDailyCompletion.idempotencyKey, body.idempotencyKey));
    if (!row) return undefined;
    if (row.fingerprint !== print) refuse(409, 'idempotencyMismatch');
    return view(row, true);
  };
  const replay = await previous();
  if (replay) return replay;

  const now = parisDay();
  if (body.day !== now && body.day !== previousDay(now)) refuse(409, 'expired');
  const draw = await drawFor(body.day);
  const entry = draw.quests.find((item) => item.quest === body.quest);
  if (!entry) refuse(404, 'notDrawn');
  const definition = await loadQuest(db, body.quest);
  if (!definition || definition.family !== 'daily') refuse(404, 'unknownQuest');

  try {
    return await db.transaction(async (tx) => {
      const who = await player(tx, body.player);
      await lockKey(tx, `quest:daily:${body.day}:${body.quest}:${who.userId}`);
      const [done] = await tx
        .select({ id: questDailyCompletion.id })
        .from(questDailyCompletion)
        .where(
          and(
            eq(questDailyCompletion.day, body.day),
            eq(questDailyCompletion.questId, body.quest),
            eq(questDailyCompletion.userId, who.userId),
          ),
        );
      if (done) refuse(409, 'alreadyCompleted');
      const season = await currentSeason(tx);
      const settings = await getSettings(tx);
      const price = await priceReward(tx, {
        base: definition.rewardPerUnit * entry.quantity,
        family: 'daily',
        balance: who.personal.balance,
        settings,
      });
      const paid = await payReward(tx, {
        userId: who.userId,
        personalAccountId: who.personal.id,
        amount: price.amount,
        items: [],
        memo: `${memoFor(definition)}, quotidienne`,
        actor: { source: 'minecraft', minecraftUuid: body.player },
      });
      const names = await usernames(tx, [body.player]);
      const [row] = await tx
        .insert(questDailyCompletion)
        .values({
          seasonId: season.id,
          day: body.day,
          questId: body.quest,
          userId: who.userId,
          minecraftUuid: body.player,
          username: names.get(body.player) ?? '',
          quantity: entry.quantity,
          amount: price.amount,
          capped: price.capped,
          kGlobal: price.kGlobal,
          kPlayer: price.kPlayer,
          transactionId: paid.transactionId,
          idempotencyKey: body.idempotencyKey,
          fingerprint: print,
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

export const questDailyService = { drawFor, today, doneBy, countsFor, complete };
