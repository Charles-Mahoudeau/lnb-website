import { asc, eq, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Db, Tx } from '~~/server/db';
import { rule, ruleCategory } from '~~/server/db/schema';
import { DRAFT_RULES } from '~~/server/lib/rules-draft';
import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';

import type {
  RuleAdminView,
  RuleBody,
  RuleCategoryBody,
  RuleCategoryPatchBody,
  RuleCitation,
  RuleIcon,
  RulePatchBody,
  RuleProblem,
  RulePublicView,
  RuleServerView,
} from '#shared/schemas/rules';
import { numberRules } from '#shared/utils/rules';

// The Minecraft server rules: categories of rules in two languages, shown on /minecraft/rules and
// to the Minecraft server, and named by warnings and bans. A rule is retired, never deleted, so
// its anchor and the sanctions that name it still resolve. See docs/rules.md.

function refuse(status: number, problem: RuleProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

type CategoryRow = typeof ruleCategory.$inferSelect;
type RuleRow = typeof rule.$inferSelect;

/** Every category and rule in display order. */
async function loadAll(dbx: Db) {
  const categories = await dbx
    .select()
    .from(ruleCategory)
    .orderBy(asc(ruleCategory.position), asc(ruleCategory.createdAt));
  const rules = await dbx.select().from(rule).orderBy(asc(rule.position), asc(rule.createdAt));
  const updated = [...categories, ...rules].map((row) => row.updatedAt.getTime());
  return {
    categories,
    rules,
    updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
  };
}

const withRetired = (row: RuleRow) => ({ ...row, retired: row.retiredAt !== null });

// Public page

async function listPublic(): Promise<RulePublicView> {
  if (!(await flagService.isEnabled('rules'))) {
    return { enabled: false, updatedAt: null, categories: [] };
  }
  const all = await loadAll(db);
  const numbered = numberRules(all.categories, all.rules.map(withRetired));
  return {
    enabled: true,
    updatedAt: all.updatedAt,
    categories: numbered.map(({ category, number, rules }) => ({
      id: category.id,
      number,
      icon: category.icon as RuleIcon,
      name: { en: category.nameEn, fr: category.nameFr },
      rules: rules.map(({ rule: row, number: ruleNumber }) => ({
        id: row.id,
        ref: row.ref,
        number: ruleNumber,
        title: { en: row.titleEn, fr: row.titleFr },
        text: { en: row.textEn, fr: row.textFr },
      })),
    })),
  };
}

/** The rules as plain text in one language, for the Minecraft server. */
async function listForServer(lang: 'en' | 'fr'): Promise<RuleServerView> {
  const all = await loadAll(db);
  const pick = (en: string, fr: string) => (lang === 'fr' && fr.trim() ? fr : en);
  return {
    lang,
    updatedAt: all.updatedAt,
    categories: numberRules(all.categories, all.rules.map(withRetired)).map(
      ({ category, number, rules }) => ({
        number,
        name: pick(category.nameEn, category.nameFr),
        rules: rules.map(({ rule: row, number: ruleNumber }) => ({
          id: row.id,
          ref: row.ref,
          number: ruleNumber,
          title: pick(row.titleEn, row.titleFr),
          text: pick(row.textEn, row.textFr),
        })),
      }),
    ),
  };
}

// Citations

/** How many warnings and bans name each rule, by rule ID. */
async function citationCounts(dbx: Db): Promise<Map<string, number>> {
  const result = await dbx.execute<{ id: string; count: number }>(sql`
    SELECT cite->>'ruleId' AS id, count(*)::int AS count FROM (
      SELECT jsonb_array_elements(rule_citations) AS cite FROM warden_ban
      UNION ALL
      SELECT jsonb_array_elements(rule_citations) AS cite FROM warden_note
    ) AS cites GROUP BY 1
  `);
  return new Map(result.rows.map((row) => [row.id, row.count]));
}

/**
 * What a warning or a ban keeps about the rules it names: their number and titles that day.
 * Retired and unknown rules are refused. The order is the one asked for, with no repeats.
 */
async function citationsFor(dbx: Db, ruleIds: readonly string[]): Promise<RuleCitation[]> {
  const ids = [...new Set(ruleIds)];
  if (!ids.length) return [];
  const all = await loadAll(dbx);
  const byId = new Map<string, RuleCitation>();
  for (const { rules } of numberRules(all.categories, all.rules.map(withRetired))) {
    for (const { rule: row, number } of rules) {
      byId.set(row.id, {
        ruleId: row.id,
        ref: row.ref,
        number,
        title: { en: row.titleEn, fr: row.titleFr },
      });
    }
  }
  return ids.map((id) => byId.get(id) ?? refuse(400, 'ruleNotFound'));
}

// Admin

async function listAdmin(): Promise<RuleAdminView> {
  const all = await loadAll(db);
  const counts = await citationCounts(db);
  const numbered = numberRules(all.categories, all.rules.map(withRetired));
  const numberOf = new Map<string, string>();
  for (const { rules } of numbered) {
    for (const entry of rules) numberOf.set(entry.rule.id, entry.number);
  }
  const categoryNumber = new Map(numbered.map((entry) => [entry.category.id, entry.number]));
  return {
    updatedAt: all.updatedAt,
    categories: all.categories.map((category) => ({
      id: category.id,
      number: categoryNumber.get(category.id) ?? null,
      icon: category.icon as RuleIcon,
      name: { en: category.nameEn, fr: category.nameFr },
      rules: all.rules
        .filter((row) => row.categoryId === category.id)
        .map((row) => ({
          id: row.id,
          ref: row.ref,
          number: numberOf.get(row.id) ?? null,
          title: { en: row.titleEn, fr: row.titleFr },
          text: { en: row.textEn, fr: row.textFr },
          retired: row.retiredAt !== null,
          citations: counts.get(row.id) ?? 0,
        })),
    })),
  };
}

async function nextCategoryPosition(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${ruleCategory.position}), 0)` })
    .from(ruleCategory);
  return (row?.max ?? 0) + 1;
}

async function nextRulePosition(tx: Tx, categoryId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${rule.position}), 0)` })
    .from(rule)
    .where(eq(rule.categoryId, categoryId));
  return (row?.max ?? 0) + 1;
}

async function requireCategory(tx: Tx, id: string): Promise<CategoryRow> {
  const [row] = await tx.select().from(ruleCategory).where(eq(ruleCategory.id, id));
  if (!row) refuse(404, 'categoryNotFound');
  return row;
}

async function createCategory(input: {
  actorId: string;
  body: RuleCategoryBody;
}): Promise<{ id: string }> {
  const { body } = input;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(ruleCategory)
      .values({
        icon: body.icon,
        nameEn: body.name.en,
        nameFr: body.name.fr,
        position: await nextCategoryPosition(tx),
      })
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.rule.categoryCreate',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { id: row!.id, name: row!.nameEn },
    });
    return { id: row!.id };
  });
}

async function updateCategory(input: {
  actorId: string;
  id: string;
  patch: RuleCategoryPatchBody;
}): Promise<void> {
  const { patch } = input;
  await db.transaction(async (tx) => {
    await requireCategory(tx, input.id);
    const [row] = await tx
      .update(ruleCategory)
      .set({
        icon: patch.icon,
        nameEn: patch.name?.en,
        nameFr: patch.name?.fr,
        updatedAt: new Date(),
      })
      .where(eq(ruleCategory.id, input.id))
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.rule.categoryUpdate',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { id: input.id, name: row!.nameEn },
    });
  });
}

/** Deletes a category that holds no rule at all, retired ones included: those must stay. */
async function removeCategory(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const category = await requireCategory(tx, input.id);
    const [held] = await tx
      .select({ id: rule.id })
      .from(rule)
      .where(eq(rule.categoryId, input.id))
      .limit(1);
    if (held) refuse(409, 'categoryNotEmpty');
    await tx.delete(ruleCategory).where(eq(ruleCategory.id, input.id));
    await auditService.record(tx, {
      action: 'minecraft.rule.categoryDelete',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { id: input.id, name: category.nameEn },
    });
  });
}

async function moveCategory(input: {
  actorId: string;
  id: string;
  direction: 'up' | 'down';
}): Promise<void> {
  const { id, direction } = input;
  await db.transaction(async (tx) => {
    await requireCategory(tx, id);
    const rows = await tx
      .select({ id: ruleCategory.id })
      .from(ruleCategory)
      .orderBy(asc(ruleCategory.position), asc(ruleCategory.createdAt))
      .for('update');
    const index = rows.findIndex((row) => row.id === id);
    const other = direction === 'up' ? index - 1 : index + 1;
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other]!, rows[index]!];
    for (const [position, row] of rows.entries()) {
      await tx
        .update(ruleCategory)
        .set({ position, updatedAt: new Date() })
        .where(eq(ruleCategory.id, row.id));
    }
    await auditService.record(tx, {
      action: 'minecraft.rule.categoryMove',
      actor: { source: 'web', userId: input.actorId },
      data: { id, direction },
    });
  });
}

async function createRule(input: { actorId: string; body: RuleBody }): Promise<{ id: string }> {
  const { body } = input;
  return db.transaction(async (tx) => {
    await requireCategory(tx, body.categoryId);
    const [row] = await tx
      .insert(rule)
      .values({
        categoryId: body.categoryId,
        titleEn: body.title.en,
        titleFr: body.title.fr,
        textEn: body.text.en,
        textFr: body.text.fr,
        position: await nextRulePosition(tx, body.categoryId),
      })
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.rule.create',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { id: row!.id, ref: row!.ref, name: row!.titleEn },
    });
    return { id: row!.id };
  });
}

async function updateRule(input: {
  actorId: string;
  id: string;
  patch: RulePatchBody;
}): Promise<void> {
  const { patch } = input;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(rule).where(eq(rule.id, input.id)).for('update');
    if (!current) refuse(404, 'ruleNotFound');
    let position: number | undefined;
    if (patch.categoryId && patch.categoryId !== current.categoryId) {
      await requireCategory(tx, patch.categoryId);
      // Another category puts the rule last there.
      position = await nextRulePosition(tx, patch.categoryId);
    }
    const [row] = await tx
      .update(rule)
      .set({
        categoryId: patch.categoryId,
        titleEn: patch.title?.en,
        titleFr: patch.title?.fr,
        textEn: patch.text?.en,
        textFr: patch.text?.fr,
        position,
        updatedAt: new Date(),
      })
      .where(eq(rule.id, input.id))
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.rule.update',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { id: input.id, ref: row!.ref, name: row!.titleEn },
    });
  });
}

/** Retires a rule, or brings it back (last in its category, as a rule moved there). */
async function setRetired(input: { actorId: string; id: string; retired: boolean }): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(rule).where(eq(rule.id, input.id)).for('update');
    if (!current) refuse(404, 'ruleNotFound');
    if ((current.retiredAt !== null) === input.retired) return;
    const now = new Date();
    await tx
      .update(rule)
      .set({
        retiredAt: input.retired ? now : null,
        position: input.retired ? current.position : await nextRulePosition(tx, current.categoryId),
        updatedAt: now,
      })
      .where(eq(rule.id, input.id));
    await auditService.record(tx, {
      action: input.retired ? 'minecraft.rule.retire' : 'minecraft.rule.restore',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { id: input.id, ref: current.ref, name: current.titleEn },
    });
  });
}

/** Swaps a rule with its neighbour of the same category. Retired rules count for their place. */
async function moveRule(input: {
  actorId: string;
  id: string;
  direction: 'up' | 'down';
}): Promise<void> {
  const { id, direction } = input;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ categoryId: rule.categoryId })
      .from(rule)
      .where(eq(rule.id, id));
    if (!current) refuse(404, 'ruleNotFound');
    const rows = await tx
      .select({ id: rule.id, retiredAt: rule.retiredAt })
      .from(rule)
      .where(eq(rule.categoryId, current.categoryId))
      .orderBy(asc(rule.position), asc(rule.createdAt))
      .for('update');
    // Step over retired neighbours: they are not on the page, so a move must change what shows.
    const index = rows.findIndex((row) => row.id === id);
    const step = direction === 'up' ? -1 : 1;
    let other = index + step;
    while (rows[other]?.retiredAt) other += step;
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other]!, rows[index]!];
    for (const [position, row] of rows.entries()) {
      await tx.update(rule).set({ position, updatedAt: new Date() }).where(eq(rule.id, row.id));
    }
    await auditService.record(tx, {
      action: 'minecraft.rule.move',
      actor: { source: 'web', userId: input.actorId },
      data: { id, direction },
    });
  });
}

/** Loads the draft rules into an empty list. Refused once there is any category. */
async function loadDraft(input: { actorId: string }): Promise<{ rules: number }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: ruleCategory.id }).from(ruleCategory).limit(1);
    if (existing) refuse(409, 'alreadyLoaded');
    let count = 0;
    for (const [categoryIndex, draft] of DRAFT_RULES.entries()) {
      const [category] = await tx
        .insert(ruleCategory)
        .values({
          icon: draft.icon,
          nameEn: draft.name.en,
          nameFr: draft.name.fr,
          position: categoryIndex + 1,
        })
        .returning({ id: ruleCategory.id });
      for (const [ruleIndex, item] of draft.rules.entries()) {
        await tx.insert(rule).values({
          categoryId: category!.id,
          titleEn: item.title.en,
          titleFr: item.title.fr,
          textEn: item.text.en,
          textFr: item.text.fr,
          position: ruleIndex + 1,
        });
        count++;
      }
    }
    await auditService.record(tx, {
      action: 'minecraft.rule.seed',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { rules: count },
    });
    return { rules: count };
  });
}

export const ruleService = {
  listPublic,
  listForServer,
  citationsFor,
  listAdmin,
  createCategory,
  updateCategory,
  removeCategory,
  moveCategory,
  createRule,
  updateRule,
  setRetired,
  moveRule,
  loadDraft,
};
