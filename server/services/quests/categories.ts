import { and, asc, eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { quest, questCategory } from '~~/server/db/schema';
import type { QuestSource } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';

import { parseQuest, refuse, validate } from './shared';
import type { Db, Tx } from './shared';

import type { QuestCategory, QuestCategoryFamily, QuestDefinition } from '#shared/schemas/quests';
import { questCategory as questCategorySchema } from '#shared/schemas/quests';

// Quest categories (docs/quests.md): individual chapters and Records groups, each with its
// subcategories. Quests name them in their definition; the site checks the names exist.

type Row = typeof questCategory.$inferSelect;

function view(row: Row): QuestCategory {
  return {
    id: row.id,
    family: row.family,
    name: row.name,
    icon: row.icon,
    ...(row.siteIcon ? { siteIcon: row.siteIcon } : {}),
    subcategories: row.subcategories,
    sortOrder: row.sortOrder,
  };
}

/** Every category, in display order: individual chapters, then Records groups. */
async function list(dbx: Db = db): Promise<QuestCategory[]> {
  const rows = await dbx
    .select()
    .from(questCategory)
    .orderBy(asc(questCategory.family), asc(questCategory.sortOrder), asc(questCategory.id));
  return rows.map(view);
}

const key = (family: string, id: string) => `${family}:${id}`;

/**
 * Checks that every quest names a category (and subcategory) that exists, among the stored ones and
 * `extra`. A 400 names the first quest that doesn't.
 */
async function checkQuests(
  dbx: Db,
  quests: readonly QuestDefinition[],
  extra: readonly QuestCategory[] = [],
) {
  const known = new Map((await list(dbx)).map((entry) => [key(entry.family, entry.id), entry]));
  for (const entry of extra) known.set(key(entry.family, entry.id), entry);
  for (const definition of quests) {
    if (definition.family !== 'individual' && definition.family !== 'server') continue;
    if (!definition.category) continue;
    const category = known.get(key(definition.family, definition.category));
    if (!category) {
      throw createError({
        status: 400,
        statusText: `Quest ${definition.id}: unknown ${definition.family} category "${definition.category}"`,
        data: { problem: 'unknownCategory' },
      });
    }
    if (
      definition.subcategory &&
      !category.subcategories.some((sub) => sub.id === definition.subcategory)
    ) {
      throw createError({
        status: 400,
        statusText: `Quest ${definition.id}: unknown subcategory "${definition.subcategory}" in "${category.id}"`,
        data: { problem: 'unknownCategory' },
      });
    }
  }
}

/** Parses a list of categories: a 400 naming the first bad one. */
function parseAll(input: readonly unknown[]): QuestCategory[] {
  const seen = new Set<string>();
  return input.map((entry, index) => {
    const result = questCategorySchema.safeParse(entry);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw createError({
        status: 400,
        statusText:
          `Category ${String(index)}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'invalid'}`.trim(),
      });
    }
    const id = key(result.data.family, result.data.id);
    if (seen.has(id))
      throw createError({ status: 400, statusText: `Category ${id} is listed twice` });
    seen.add(id);
    return result.data;
  });
}

function values(category: QuestCategory, order: number, source: QuestSource) {
  return {
    family: category.family,
    id: category.id,
    name: category.name,
    icon: category.icon,
    siteIcon: category.siteIcon ?? null,
    subcategories: category.subcategories,
    sortOrder: category.sortOrder ?? order,
    source,
  };
}

/**
 * Adds the categories the site doesn't know (in list order, after the existing ones); with
 * `overwrite`, also replaces the known ones. Returns the ids added and replaced, as `family:id`.
 */
async function upsert(
  tx: Tx,
  categories: readonly QuestCategory[],
  options: { overwrite: boolean; source: QuestSource },
) {
  const existing = await list(tx);
  const known = new Set(existing.map((entry) => key(entry.family, entry.id)));
  const added: string[] = [];
  const replaced: string[] = [];
  const next: Record<QuestCategoryFamily, number> = { individual: 0, server: 0 };
  for (const entry of existing)
    next[entry.family] = Math.max(next[entry.family], (entry.sortOrder ?? 0) + 1);
  for (const category of categories) {
    const id = key(category.family, category.id);
    if (!known.has(id)) {
      await tx
        .insert(questCategory)
        .values(values(category, next[category.family]++, options.source))
        .onConflictDoNothing();
      added.push(id);
    } else if (options.overwrite) {
      await checkSubcategoriesKept(tx, category);
      const {
        family: _family,
        id: _id,
        source: _source,
        ...set
      } = values(category, 0, options.source);
      await tx
        .update(questCategory)
        .set({
          ...set,
          sortOrder:
            category.sortOrder ?? existing.find((e) => key(e.family, e.id) === id)?.sortOrder ?? 0,
          updatedAt: new Date(),
        })
        .where(and(eq(questCategory.family, category.family), eq(questCategory.id, category.id)));
      replaced.push(id);
    }
  }
  return { added, replaced };
}

/** The quests of the catalogue in a category. */
async function questsIn(dbx: Db, family: QuestCategoryFamily, id: string) {
  const rows = await dbx.select().from(quest).where(eq(quest.family, family));
  return rows.flatMap((row) => {
    const parsed = parseQuest(row);
    return parsed &&
      (parsed.family === 'individual' || parsed.family === 'server') &&
      parsed.category === id
      ? [parsed]
      : [];
  });
}

/** Refuses an update that drops a subcategory a quest still uses. */
async function checkSubcategoriesKept(dbx: Db, category: QuestCategory) {
  const kept = new Set(category.subcategories.map((sub) => sub.id));
  const users = await questsIn(dbx, category.family, category.id);
  if (users.some((entry) => entry.subcategory && !kept.has(entry.subcategory)))
    refuse(409, 'categoryInUse');
}

async function create(actorId: string, input: unknown) {
  const category = validate(questCategorySchema, input);
  await db.transaction(async (tx) => {
    const { added } = await upsert(tx, [category], { overwrite: false, source: 'site' });
    if (!added.length) refuse(409, 'idTaken');
    await auditService.record(tx, {
      action: 'economy.quests.categoryCreate',
      actor: { source: 'web', userId: actorId },
      targetUserId: null,
      data: { id: key(category.family, category.id) },
    });
  });
  return category;
}

async function update(actorId: string, family: QuestCategoryFamily, id: string, input: unknown) {
  const category = validate(questCategorySchema, { ...(input as object), family, id });
  await db.transaction(async (tx) => {
    const { replaced } = await upsert(tx, [category], { overwrite: true, source: 'site' });
    if (!replaced.length) refuse(404, 'notFound');
    await auditService.record(tx, {
      action: 'economy.quests.categoryUpdate',
      actor: { source: 'web', userId: actorId },
      targetUserId: null,
      data: { id: key(family, id) },
    });
  });
  return category;
}

/** Deletes a category no quest uses. */
async function remove(actorId: string, family: QuestCategoryFamily, id: string) {
  await db.transaction(async (tx) => {
    if ((await questsIn(tx, family, id)).length) refuse(409, 'categoryInUse');
    const deleted = await tx
      .delete(questCategory)
      .where(and(eq(questCategory.family, family), eq(questCategory.id, id)))
      .returning({ id: questCategory.id });
    if (!deleted.length) refuse(404, 'notFound');
    await auditService.record(tx, {
      action: 'economy.quests.categoryDelete',
      actor: { source: 'web', userId: actorId },
      targetUserId: null,
      data: { id: key(family, id) },
    });
  });
}

export const questCategoryService = { list, checkQuests, parseAll, upsert, create, update, remove };
