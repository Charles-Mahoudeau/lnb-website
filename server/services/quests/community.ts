import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  questCommunity,
  questCommunityContribution,
  questCommunityTemplate,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { player } from '~~/server/services/economy/server';

import { applyCap, familyBudget, kPlayer, reward } from './formula';
import {
  circulation,
  currentSeason,
  getSettings,
  lockKey,
  payReward,
  refuse,
  spentLast30Days,
  todayIndex,
  validate,
} from './shared';
import type { Db, Tx } from './shared';

import type { QuestCommunityDefinition, QuestCommunityView } from '#shared/schemas/quests';
import {
  questCommunityCreateBody,
  questCommunityDefinition,
  questCommunityPatchBody,
  questCommunityTemplateDefinition,
} from '#shared/schemas/quests';

// Community quests: the whole server works towards one goal; when it ends, every contributor
// above the threshold is paid for each tier reached. See docs/quests.md.

type Row = typeof questCommunity.$inferSelect;

function definitionOf(row: Row): QuestCommunityDefinition {
  return questCommunityDefinition.parse(row.definition);
}

async function view(dbx: Db, row: Row): Promise<QuestCommunityView> {
  const definition = definitionOf(row);
  const today = await todayIndex(dbx);
  const [count] = await dbx
    .select({ n: sql<number>`count(*)::int` })
    .from(questCommunityContribution)
    .where(eq(questCommunityContribution.communityId, row.id));
  return {
    id: row.id,
    title: definition.title,
    objective: definition.objective,
    goal: definition.goal,
    tiers: definition.tiers.map((tier) => ({
      ...tier,
      rewardToday: reward(tier.reward, today.kGlobal, 1),
    })),
    thresholdPercent: definition.thresholdPercent,
    topBonusPercent: definition.topBonusPercent,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    progress: row.progress,
    contributors: count?.n ?? 0,
  };
}

async function running(dbx: Db = db) {
  const [row] = await dbx.select().from(questCommunity).where(eq(questCommunity.status, 'running'));
  return row ? view(dbx, row) : null;
}

/** A player's contribution to the running quest, and whether it reaches the threshold. */
async function contributionOf(userId: string) {
  const [row] = await db.select().from(questCommunity).where(eq(questCommunity.status, 'running'));
  if (!row) return null;
  const [mine] = await db
    .select({ amount: questCommunityContribution.amount })
    .from(questCommunityContribution)
    .where(
      and(
        eq(questCommunityContribution.communityId, row.id),
        eq(questCommunityContribution.userId, userId),
      ),
    );
  const definition = definitionOf(row);
  const contribution = mine?.amount ?? 0;
  return { contribution, qualified: contribution > 0 && contribution >= threshold(definition) };
}

function threshold(definition: QuestCommunityDefinition) {
  return Math.ceil((definition.goal * definition.thresholdPercent) / 100);
}

async function lockForContributions(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(questCommunity)
    .where(eq(questCommunity.id, id))
    .for('update');
  if (!row) refuse(404, 'notFound');
  return { status: row.status, progress: row.progress, goal: definitionOf(row).goal };
}

async function addProgress(tx: Tx, id: string, added: number) {
  const [row] = await tx
    .update(questCommunity)
    .set({ progress: sql`${questCommunity.progress} + ${added}` })
    .where(eq(questCommunity.id, id))
    .returning({ progress: questCommunity.progress });
  return row?.progress ?? 0;
}

/** Pays an ended community quest: every qualified contributor, one mint each for all tiers reached. */
async function pay(id: string) {
  await db.transaction(async (tx) => {
    await lockKey(tx, `community:${id}`);
    const [row] = await tx
      .select()
      .from(questCommunity)
      .where(eq(questCommunity.id, id))
      .for('update');
    if (!row || row.status !== 'running') return;
    const definition = definitionOf(row);
    const reached = definition.tiers.filter(
      (tier) => row.progress >= (definition.goal * tier.at) / 100,
    );
    const base = reached.reduce((total, tier) => total + tier.reward, 0);
    const contributions = await tx
      .select()
      .from(questCommunityContribution)
      .where(eq(questCommunityContribution.communityId, id))
      .orderBy(desc(questCommunityContribution.amount));
    const qualified = contributions.filter((entry) => entry.amount >= threshold(definition));
    const settings = await getSettings(tx);
    const today = await todayIndex(tx, settings);
    const budget = familyBudget('community', await circulation(tx), settings.cap);
    let spent = budget === null ? 0 : await spentLast30Days(tx, 'community');
    const topUserId = contributions[0]?.userId;
    for (const entry of base > 0 ? qualified : []) {
      const uuid = await anyUuid(tx, entry.userId);
      const who = uuid ? await player(tx, uuid).catch(() => null) : null;
      if (!who) continue;
      const bonus = entry.userId === topUserId ? 1 + definition.topBonusPercent / 100 : 1;
      const raw = reward(
        base * bonus,
        today.kGlobal,
        kPlayer(who.personal.balance, today.index, settings.formula),
      );
      const { amount } = applyCap(raw, budget, spent);
      spent += amount;
      const paid = await payReward(tx, {
        userId: entry.userId,
        personalAccountId: who.personal.id,
        amount,
        items: [],
        memo: definition.title.fr,
        actor: { source: 'system' },
      }).catch(() => null);
      await tx
        .update(questCommunityContribution)
        .set({ payout: paid ? amount : 0, transactionId: paid?.transactionId ?? null })
        .where(
          and(
            eq(questCommunityContribution.communityId, id),
            eq(questCommunityContribution.userId, entry.userId),
          ),
        );
    }
    await tx
      .update(questCommunity)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(questCommunity.id, id));
  });
}

async function anyUuid(dbx: Db, userId: string) {
  const [row] = await dbx
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(and(eq(minecraftAccount.userId, userId), sql`${minecraftAccount.unlinkedAt} is null`))
    .limit(1);
  return row?.uuid ?? null;
}

/** Monday 00:00 Paris of the week after `from`, as a Date. */
function nextMonday(from: Date) {
  const paris = new Date(from.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const offset = paris.getTime() - from.getTime();
  const days = (8 - paris.getDay()) % 7 || 7;
  const monday = new Date(paris);
  monday.setDate(paris.getDate() + days);
  monday.setHours(0, 0, 0, 0);
  return new Date(monday.getTime() - offset);
}

/**
 * The task: pays ended quests, starts the scheduled one whose time came, and draws a new one
 * from the templates when the rotation is on and nothing is planned.
 */
async function tick(now = new Date()) {
  const ended = await db
    .select({ id: questCommunity.id })
    .from(questCommunity)
    .where(and(eq(questCommunity.status, 'running'), lte(questCommunity.endsAt, now)));
  for (const row of ended) await pay(row.id);

  const [due] = await db
    .select()
    .from(questCommunity)
    .where(and(eq(questCommunity.status, 'scheduled'), lte(questCommunity.startsAt, now)))
    .orderBy(asc(questCommunity.startsAt))
    .limit(1);
  const [live] = await db
    .select({ id: questCommunity.id })
    .from(questCommunity)
    .where(eq(questCommunity.status, 'running'));
  if (due && !live) {
    await db.update(questCommunity).set({ status: 'running' }).where(eq(questCommunity.id, due.id));
    return;
  }

  const settings = await getSettings();
  if (!settings.community.rotation || live || due) return;
  const [planned] = await db
    .select({ id: questCommunity.id })
    .from(questCommunity)
    .where(eq(questCommunity.status, 'scheduled'))
    .limit(1);
  if (planned) return;
  const templates = await db
    .select()
    .from(questCommunityTemplate)
    .where(eq(questCommunityTemplate.enabled, true));
  if (!templates.length) return;
  const template = templates[Math.floor(Math.random() * templates.length)]!;
  const parsed = questCommunityTemplateDefinition.safeParse(template.definition);
  if (!parsed.success) return;
  const { goal, days, ...rest } = parsed.data;
  const step = goal.max > goal.min ? Math.round(Math.random() * (goal.max - goal.min)) : 0;
  const startsAt = nextMonday(now);
  const season = await currentSeason();
  await db.insert(questCommunity).values({
    seasonId: season.id,
    definition: { ...rest, goal: goal.min + step },
    startsAt,
    endsAt: new Date(startsAt.getTime() + days * 24 * 3600 * 1000 - 60_000),
    templateId: template.id,
  });
}

// Admin.

async function list() {
  const rows = await db
    .select()
    .from(questCommunity)
    .orderBy(desc(questCommunity.startsAt))
    .limit(50);
  return Promise.all(rows.map((row) => view(db, row)));
}

async function topContributors(id: string) {
  return db
    .select({
      username: questCommunityContribution.username,
      amount: questCommunityContribution.amount,
      payout: questCommunityContribution.payout,
    })
    .from(questCommunityContribution)
    .where(eq(questCommunityContribution.communityId, id))
    .orderBy(desc(questCommunityContribution.amount))
    .limit(50);
}

async function create(actorId: string, input: unknown) {
  const body = validate(questCommunityCreateBody, input);
  if (new Date(body.endsAt) <= new Date(body.startsAt)) refuse(400, 'notFound');
  const season = await currentSeason();
  const [row] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(questCommunity)
      .values({
        seasonId: season.id,
        definition: body.definition,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'quests.communityCreate',
      actorUserId: actorId,
      targetUserId: null,
      data: { id: inserted[0]!.id, name: body.definition.title.fr },
    });
    return inserted;
  });
  // Starts it at once when its time came and nothing else runs.
  await tick();
  const [fresh] = await db.select().from(questCommunity).where(eq(questCommunity.id, row!.id));
  return view(db, fresh!);
}

async function update(actorId: string, id: string, input: unknown) {
  const body = validate(questCommunityPatchBody, input);
  const [row] = await db.select().from(questCommunity).where(eq(questCommunity.id, id));
  if (!row) refuse(404, 'notFound');
  if (row.status === 'paid' || row.status === 'cancelled') refuse(409, 'communityClosed');
  await db.transaction(async (tx) => {
    await tx
      .update(questCommunity)
      .set({
        ...(body.definition ? { definition: body.definition } : {}),
        ...(body.startsAt && row.status === 'scheduled'
          ? { startsAt: new Date(body.startsAt) }
          : {}),
        ...(body.endsAt ? { endsAt: new Date(body.endsAt) } : {}),
      })
      .where(eq(questCommunity.id, id));
    await adminAuditService.record(tx, {
      action: 'quests.communityUpdate',
      actorUserId: actorId,
      targetUserId: null,
      data: { id, name: definitionOf(row).title.fr },
    });
  });
  const [updated] = await db.select().from(questCommunity).where(eq(questCommunity.id, id));
  return view(db, updated!);
}

async function cancel(actorId: string, id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(questCommunity)
      .where(eq(questCommunity.id, id))
      .for('update');
    if (!row) refuse(404, 'notFound');
    if (row.status === 'paid' || row.status === 'cancelled') refuse(409, 'communityClosed');
    await tx.update(questCommunity).set({ status: 'cancelled' }).where(eq(questCommunity.id, id));
    await adminAuditService.record(tx, {
      action: 'quests.communityCancel',
      actorUserId: actorId,
      targetUserId: null,
      data: { id, name: definitionOf(row).title.fr },
    });
  });
}

async function templates() {
  return db.select().from(questCommunityTemplate).orderBy(asc(questCommunityTemplate.createdAt));
}

async function saveTemplate(
  actorId: string,
  input: { id?: string; definition: unknown; enabled?: boolean },
) {
  const definition = validate(questCommunityTemplateDefinition, input.definition);
  return db.transaction(async (tx) => {
    const [row] = input.id
      ? await tx
          .update(questCommunityTemplate)
          .set({ definition, ...(input.enabled === undefined ? {} : { enabled: input.enabled }) })
          .where(eq(questCommunityTemplate.id, input.id))
          .returning()
      : await tx
          .insert(questCommunityTemplate)
          .values({ definition, enabled: input.enabled ?? true })
          .returning();
    if (!row) refuse(404, 'notFound');
    await adminAuditService.record(tx, {
      action: 'quests.communityTemplate',
      actorUserId: actorId,
      targetUserId: null,
      data: { id: row.id },
    });
    return row;
  });
}

/** Past community quests, newest first, with the contributors' count. */
async function past(limit = 10) {
  const rows = await db
    .select()
    .from(questCommunity)
    .where(inArray(questCommunity.status, ['paid', 'cancelled']))
    .orderBy(desc(questCommunity.endsAt))
    .limit(limit);
  return Promise.all(rows.map((row) => view(db, row)));
}

export const communityService = {
  running,
  contributionOf,
  lockForContributions,
  addProgress,
  pay,
  tick,
  list,
  past,
  topContributors,
  create,
  update,
  cancel,
  templates,
  saveTemplate,
  nextMonday,
};
