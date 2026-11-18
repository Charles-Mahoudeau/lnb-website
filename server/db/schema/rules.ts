import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// The Minecraft server rules at /minecraft/rules. See docs/rules.md. Warnings and bans keep
// which rules they name in their own `rule_citations` column (schema/warden.ts), as copies.

/** A group of rules. `icon` is one of RULE_ICONS (shared/schemas/rules.ts). */
export const ruleCategory = pgTable('rule_category', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameEn: text('name_en').notNull(),
  // Left empty, the English text shows in French too.
  nameFr: text('name_fr').default('').notNull(),
  icon: text('icon').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * A rule. It is never deleted: a retired rule (`retired_at` set) leaves the page and the numbers
 * but stays here, so its anchor and the sanctions that name it still resolve.
 */
export const rule = pgTable(
  'rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stable and short: the anchor of the rule on the page is `r<ref>`.
    ref: integer('ref').notNull().unique().generatedAlwaysAsIdentity(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => ruleCategory.id, { onDelete: 'restrict' }),
    titleEn: text('title_en').notNull(),
    titleFr: text('title_fr').default('').notNull(),
    textEn: text('text_en').notNull(),
    textFr: text('text_fr').default('').notNull(),
    position: integer('position').notNull(),
    retiredAt: timestamp('retired_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('rule_category_idx').on(table.categoryId, table.position)],
);
