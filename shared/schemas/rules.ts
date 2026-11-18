import { z } from 'zod';

// Server rules contracts, shared by the routes and the pages. See docs/rules.md.

export const RULE_PROBLEMS = [
  'categoryNotFound',
  'ruleNotFound',
  'categoryNotEmpty',
  'alreadyLoaded',
] as const;
export type RuleProblem = (typeof RULE_PROBLEMS)[number];

/** The icons a category can take: Lucide names, shown on its tile. */
export const RULE_ICONS = [
  'heart-handshake',
  'shield-check',
  'box',
  'user-round',
  'calendar',
  'message-circle',
  'swords',
  'gavel',
  'users',
  'leaf',
] as const;
export type RuleIcon = (typeof RULE_ICONS)[number];

export const ruleCategoryParams = z.object({ categoryId: z.uuid() });
export const ruleParams = z.object({ ruleId: z.uuid() });

/** A text in both languages. French may be empty: the English text shows instead. */
const localized = z.object({ en: z.string(), fr: z.string() });
export type RuleText = z.infer<typeof localized>;

/** A rule number such as "2.3", computed from the order of the rules that are not retired. */
const number = z.string().describe('Such as "2.3". It follows the order, so it can change.');

// Public page

export const rulePublicItem = z.object({
  id: z.uuid(),
  ref: z.number().int().describe('Stable. The anchor of the rule on the page is `r<ref>`.'),
  number,
  title: localized,
  text: localized,
});
export type RulePublicItem = z.infer<typeof rulePublicItem>;

export const rulePublicCategory = z.object({
  id: z.uuid(),
  number: z.number().int(),
  icon: z.enum(RULE_ICONS),
  name: localized,
  rules: z.array(rulePublicItem),
});
export type RulePublicCategory = z.infer<typeof rulePublicCategory>;

/** GET /api/rules */
export const rulePublicView = z.object({
  enabled: z
    .boolean()
    .describe('False while the `rules` flag is off: the page shows a "being rewritten" notice.'),
  updatedAt: z.string().nullable().meta({ format: 'date-time' }),
  categories: z
    .array(rulePublicCategory)
    .describe('Categories with at least one rule that is not retired, in order.'),
});
export type RulePublicView = z.infer<typeof rulePublicView>;

// Admin

export const ruleAdminItem = z.object({
  id: z.uuid(),
  ref: z.number().int(),
  number: number.nullable().describe('Null for a retired rule.'),
  title: localized,
  text: localized,
  retired: z.boolean(),
  citations: z.number().int().describe('Warnings and bans that cite this rule.'),
});
export type RuleAdminItem = z.infer<typeof ruleAdminItem>;

export const ruleAdminCategory = z.object({
  id: z.uuid(),
  number: z.number().int().nullable().describe('Null while it has no rule that is not retired.'),
  icon: z.enum(RULE_ICONS),
  name: localized,
  rules: z.array(ruleAdminItem),
});
export type RuleAdminCategory = z.infer<typeof ruleAdminCategory>;

/** GET /api/admin/rules */
export const ruleAdminView = z.object({
  categories: z.array(ruleAdminCategory).describe('Every category and rule, retired ones too.'),
  updatedAt: z.string().nullable().meta({ format: 'date-time' }),
});
export type RuleAdminView = z.infer<typeof ruleAdminView>;

/** POST /api/admin/rules/categories */
export const ruleCategoryBody = z.object({
  icon: z.enum(RULE_ICONS),
  name: z.object({ en: z.string().trim().min(1).max(80), fr: z.string().trim().max(80) }),
});
export type RuleCategoryBody = z.input<typeof ruleCategoryBody>;

/** PATCH /api/admin/rules/categories/:categoryId */
export const ruleCategoryPatchBody = ruleCategoryBody
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type RuleCategoryPatchBody = z.input<typeof ruleCategoryPatchBody>;

/** POST /api/admin/rules */
export const ruleBody = z.object({
  categoryId: z.uuid(),
  title: z.object({ en: z.string().trim().min(1).max(120), fr: z.string().trim().max(120) }),
  text: z.object({ en: z.string().trim().min(1).max(600), fr: z.string().trim().max(600) }),
});
export type RuleBody = z.input<typeof ruleBody>;

/** PATCH /api/admin/rules/:ruleId. Another category puts the rule last in it. */
export const rulePatchBody = ruleBody.partial().refine((patch) => Object.keys(patch).length > 0);
export type RulePatchBody = z.input<typeof rulePatchBody>;

/** PUT /api/admin/rules/:ruleId/retired */
export const ruleRetiredBody = z.object({
  retired: z
    .boolean()
    .describe('True retires the rule. False brings it back, last in its category.'),
});
export type RuleRetiredBody = z.infer<typeof ruleRetiredBody>;

/** POST .../move: one step up or down inside its category (or among the categories). */
export const ruleMoveBody = z.object({ direction: z.enum(['up', 'down']) });
export type RuleMoveBody = z.infer<typeof ruleMoveBody>;

// Citations: the rules a warning or a ban names.

/** How a warning or ban names a rule. Kept as it was that day, so editing a rule never rewrites it. */
export const ruleCitation = z.object({
  ruleId: z.uuid(),
  ref: z.number().int(),
  number,
  title: localized,
});
export type RuleCitation = z.infer<typeof ruleCitation>;

/** How many rules one warning or ban can name. */
export const RULES_PER_SANCTION = 10;

/** The rules a moderator names in a warning or a ban: up to 10 that are not retired. */
export const ruleIdList = z
  .array(z.uuid())
  .max(RULES_PER_SANCTION)
  .default([])
  .describe('Optional. The rules this sanction names. Retired rules are refused.');

// Minecraft server

/** GET /api/warden/server/rules */
export const ruleServerQuery = z.object({ lang: z.enum(['en', 'fr']).default('en') });

export const ruleServerView = z.object({
  lang: z.enum(['en', 'fr']),
  updatedAt: z.string().nullable().meta({ format: 'date-time' }),
  categories: z.array(
    z.object({
      number: z.number().int(),
      name: z.string(),
      rules: z.array(
        z.object({
          id: z.uuid().describe('To name the rule in a ban or a warning (`ruleIds`).'),
          ref: z.number().int(),
          number,
          title: z.string(),
          text: z.string(),
        }),
      ),
    }),
  ),
});
export type RuleServerView = z.infer<typeof ruleServerView>;
