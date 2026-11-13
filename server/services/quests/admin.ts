import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import {
  economyAccount,
  minecraftAccount,
  quest,
  questCompletion,
  questFlashRun,
  questIndexDay,
  questSeason,
  questSettingsRow,
  user,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { computeIndex, familyBudget } from './formula';
import {
  circulation,
  currentSeason,
  getSettings,
  loadCatalog,
  parseQuest,
  refuse,
  spentLast30Days,
  validate,
} from './shared';
import type { Db } from './shared';

import type { QuestDefinition, QuestSettings } from '#shared/schemas/quests';
import {
  QUEST_SHARE_FAMILIES,
  questAdminPatchBody,
  questDefinition,
  questImportBody,
  questSeasonBody,
  questSettings,
  questSettingsPatch,
} from '#shared/schemas/quests';
import { hasRole } from '#shared/utils/roles';

// The quests admin: the catalogue, settings, the daily index and seasons. See docs/quests.md.

/** Today in Paris, as YYYY-MM-DD. */
export function parisDay(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(at);
}

/** The personal balances of the active players, staff left out. */
async function activeBalances(dbx: Db, settings: QuestSettings) {
  const since = new Date(Date.now() - settings.active.hours * 3600 * 1000);
  const rows = await dbx
    .select({
      userId: minecraftAccount.userId,
      role: user.role,
      seen: sql<Date>`max(${minecraftAccount.lastSeenAt})`,
      playtime: sql<string>`sum(${minecraftAccount.playtimeSeconds})::bigint`,
    })
    .from(minecraftAccount)
    .innerJoin(user, eq(user.id, minecraftAccount.userId))
    .where(and(isNull(minecraftAccount.unlinkedAt), gt(minecraftAccount.lastSeenAt, since)))
    .groupBy(minecraftAccount.userId, user.role);
  const active = rows.filter(
    (row) =>
      Number(row.playtime) >= settings.active.minPlaytimeMinutes * 60 &&
      !hasRole(row.role, 'admin') &&
      !hasRole(row.role, 'economy-admin'),
  );
  if (!active.length) return [];
  const accounts = await dbx
    .select({ balance: economyAccount.balance })
    .from(economyAccount)
    .where(
      and(
        eq(economyAccount.kind, 'personal'),
        isNull(economyAccount.closedAt),
        inArray(
          economyAccount.ownerUserId,
          active.map((row) => row.userId),
        ),
      ),
    );
  return accounts.map((row) => row.balance);
}

/** The quests:index task: today's index, written once per Paris day (a rerun replaces it). */
async function runIndex() {
  const settings = await getSettings();
  const balances = await activeBalances(db, settings);
  const result = computeIndex(balances, settings.formula, settings.active.minPlayers);
  const day = parisDay();
  await db
    .insert(questIndexDay)
    .values({ day, ...result })
    .onConflictDoUpdate({ target: questIndexDay.day, set: { ...result, createdAt: new Date() } });
  return { day, ...result };
}

/** The index page: history, today's preview with the current settings, cap usage. */
async function indexView(days: number) {
  const settings = await getSettings();
  const rows = await db.select().from(questIndexDay).orderBy(desc(questIndexDay.day)).limit(days);
  const preview = computeIndex(
    await activeBalances(db, settings),
    settings.formula,
    settings.active.minPlayers,
  );
  const money = await circulation(db);
  const cap = await Promise.all(
    QUEST_SHARE_FAMILIES.map(async (family) => ({
      family,
      budget: familyBudget(family, money, settings.cap),
      spent: await spentLast30Days(db, family),
    })),
  );
  return {
    days: rows.reverse().map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    preview,
    circulation: money,
    cap,
  };
}

async function settingsView() {
  const [row] = await db.select().from(questSettingsRow).where(eq(questSettingsRow.id, 1));
  return { values: await getSettings(), updatedAt: row?.updatedAt.toISOString() ?? null };
}

async function updateSettings(actorId: string, input: unknown) {
  const patch = validate(questSettingsPatch, input);
  const values = questSettings.parse({ ...(await getSettings()), ...patch });
  await db.transaction(async (tx) => {
    const set = { values, updatedAt: new Date(), updatedByUserId: actorId };
    await tx
      .insert(questSettingsRow)
      .values({ id: 1, ...set })
      .onConflictDoUpdate({ target: questSettingsRow.id, set });
    await adminAuditService.record(tx, {
      action: 'quests.settings',
      actorUserId: actorId,
      targetUserId: null,
      data: { ...patch },
    });
  });
  return settingsView();
}

/** The catalogue with every quest's completions this season, for the admin table. */
async function catalog() {
  const season = await currentSeason();
  const rows = await db.select().from(quest).orderBy(quest.sortOrder, quest.id);
  const counts = await db
    .select({ questId: questCompletion.questId, n: sql<number>`count(*)::int` })
    .from(questCompletion)
    .where(eq(questCompletion.seasonId, season.id))
    .groupBy(questCompletion.questId);
  const countOf = new Map(counts.map((row) => [row.questId, row.n]));
  return rows.map((row) => ({
    id: row.id,
    family: row.family,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    source: row.source,
    definition: parseQuest(row),
    raw: row.definition,
    completions: countOf.get(row.id) ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function split(definition: QuestDefinition) {
  const { id, enabled, ...rest } = definition;
  return { id, enabled, rest };
}

async function createQuest(actorId: string, input: unknown) {
  const definition = validate(questDefinition, input);
  const { id, enabled, rest } = split(definition);
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(quest)
      .values({
        id,
        family: definition.family,
        definition: rest,
        enabled,
        source: 'site',
        sortOrder: 1000,
      })
      .onConflictDoNothing()
      .returning({ id: quest.id });
    if (!inserted.length) refuse(409, 'idTaken');
    await adminAuditService.record(tx, {
      action: 'quests.create',
      actorUserId: actorId,
      targetUserId: null,
      data: { id },
    });
  });
  return definition;
}

async function updateQuest(actorId: string, id: string, input: unknown) {
  const body = validate(questAdminPatchBody, input);
  const [row] = await db.select().from(quest).where(eq(quest.id, id));
  if (!row) refuse(404, 'notFound');
  let set: Partial<typeof quest.$inferInsert> = { updatedAt: new Date() };
  if (body.definition !== undefined) {
    const definition = validate(questDefinition, {
      ...(body.definition as object),
      id,
      enabled: row.enabled,
    });
    if (definition.family !== row.family) refuse(409, 'questInUse');
    set = { ...set, definition: split(definition).rest };
  }
  if (body.enabled !== undefined) set.enabled = body.enabled;
  if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;
  await db.transaction(async (tx) => {
    await tx.update(quest).set(set).where(eq(quest.id, id));
    await adminAuditService.record(tx, {
      action: 'quests.update',
      actorUserId: actorId,
      targetUserId: null,
      data: { id, name: id, enabled: body.enabled, definition: body.definition !== undefined },
    });
  });
  const [updated] = await db.select().from(quest).where(eq(quest.id, id));
  return parseQuest(updated!);
}

/** Deletes a quest nobody completed or raced. Otherwise it can only be disabled. */
async function deleteQuest(actorId: string, id: string) {
  await db.transaction(async (tx) => {
    const [used] = await tx
      .select({ id: questCompletion.id })
      .from(questCompletion)
      .where(eq(questCompletion.questId, id))
      .limit(1);
    const [raced] = await tx
      .select({ id: questFlashRun.id })
      .from(questFlashRun)
      .where(eq(questFlashRun.questId, id))
      .limit(1);
    if (used || raced) refuse(409, 'questInUse');
    const deleted = await tx.delete(quest).where(eq(quest.id, id)).returning({ id: quest.id });
    if (!deleted.length) refuse(404, 'notFound');
    await adminAuditService.record(tx, {
      action: 'quests.delete',
      actorUserId: actorId,
      targetUserId: null,
      data: { id },
    });
  });
}

/** The catalogue as the server's quests.json. */
async function exportCatalog() {
  return { quests: await loadCatalog(db) };
}

async function importCatalog(actorId: string, input: unknown) {
  const body = validate(questImportBody, input);
  const parsed = body.quests.map((entry, index) => {
    const result = questDefinition.safeParse(entry);
    if (!result.success)
      throw createError({
        status: 400,
        statusText: `Quest ${String(index)}: ${result.error.issues[0]?.message ?? 'invalid'}`,
      });
    return result.data;
  });
  const added: string[] = [];
  const replaced: string[] = [];
  await db.transaction(async (tx) => {
    for (const definition of parsed) {
      const { id, enabled, rest } = split(definition);
      const [existing] = await tx
        .select({ family: quest.family })
        .from(quest)
        .where(eq(quest.id, id));
      if (!existing) {
        await tx.insert(quest).values({
          id,
          family: definition.family,
          definition: rest,
          enabled,
          source: 'site',
          sortOrder: 1000 + added.length,
        });
        added.push(id);
      } else if (body.overwrite && existing.family === definition.family) {
        await tx
          .update(quest)
          .set({ definition: rest, enabled, updatedAt: new Date() })
          .where(eq(quest.id, id));
        replaced.push(id);
      }
    }
    await adminAuditService.record(tx, {
      action: 'quests.import',
      actorUserId: actorId,
      targetUserId: null,
      data: { added, replaced },
    });
  });
  return { added, replaced };
}

async function seasons() {
  const rows = await db.select().from(questSeason).orderBy(desc(questSeason.number));
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  }));
}

/** Closes the current season and opens the next. The server starts every player over. */
async function newSeason(actorId: string, input: unknown) {
  const parsed = questSeasonBody.safeParse(input);
  if (!parsed.success) refuse(400, 'confirmationMismatch');
  await db.transaction(async (tx) => {
    const current = await currentSeason(tx);
    await tx.update(questSeason).set({ endedAt: new Date() }).where(eq(questSeason.id, current.id));
    await tx.insert(questSeason).values({ number: current.number + 1 });
    await adminAuditService.record(tx, {
      action: 'quests.season',
      actorUserId: actorId,
      targetUserId: null,
      data: { closed: current.number, opened: current.number + 1 },
    });
  });
  return seasons();
}

export const questAdminService = {
  runIndex,
  indexView,
  settingsView,
  updateSettings,
  catalog,
  createQuest,
  updateQuest,
  deleteQuest,
  exportCatalog,
  importCatalog,
  seasons,
  newSeason,
};
