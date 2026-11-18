import { z } from 'zod';

import { minecraftUuid } from './warden.ts';

// Quest contracts, shared by the routes, the pages and the Minecraft server. See docs/quests.md.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const QUEST_PROBLEMS = [
  'notFound',
  'notLinked',
  'notEligible',
  'frozen',
  'unknownQuest',
  'tierLocked',
  'alreadyCompleted',
  'alreadyClaimed',
  'alreadyRanked',
  'communityClosed',
  'communityRunning',
  'questInUse',
  'idTaken',
  'idempotencyMismatch',
  'confirmationMismatch',
  'disabled',
  'unknownCategory',
  'categoryInUse',
  'notDrawn',
  'expired',
] as const;
export type QuestProblem = (typeof QUEST_PROBLEMS)[number];

// The catalogue.

export const QUEST_FAMILIES = ['individual', 'server', 'flash', 'daily'] as const;
/** The families whose quests are sorted in categories: chapters for individual, Records groups for server. */
export const QUEST_CATEGORY_FAMILIES = ['individual', 'server'] as const;
export type QuestCategoryFamily = (typeof QUEST_CATEGORY_FAMILIES)[number];
export const QUEST_OBJECTIVES = [
  'kill',
  'mine',
  'fish',
  'craft',
  'travel',
  'deliver',
  'advancement',
] as const;
/** Objectives a flash race or a daily quest can use: delivering would reward a full chest, not the day's work. */
export const FLASH_OBJECTIVES = ['kill', 'mine', 'fish', 'craft', 'travel'] as const;

export const questId = z
  .string()
  .regex(/^[a-z0-9_]{3,48}$/)
  .describe('Stable key of the quest: 3 to 48 lower-case letters, digits or underscores.');

const localized = z.object({ fr: z.string().min(1).max(80), en: z.string().min(1).max(80) });

/** A category's or subcategory's key, unique within its family (subcategories: within their category). */
export const questCategoryId = z
  .string()
  .regex(/^[a-z0-9_]{2,32}$/)
  .describe('2 to 32 lower-case letters, digits or underscores.');
const localizedText = z.object({ fr: z.string().max(280), en: z.string().max(280) });
/** A namespaced id, or a tag with `#`. */
const resourceRef = z.string().regex(/^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/);

export const questItemReward = z.object({
  id: resourceRef.describe('The item id, for screens.'),
  snbt: z.string().min(1).max(32_000).describe('The stack as the game saved it. Never read.'),
  name: z.string().min(1).max(120),
  count: z.int().min(1).max(99),
});
export type QuestItemReward = z.infer<typeof questItemReward>;
const items = z.array(questItemReward).max(9).default([]);

export const questObjective = z.object({
  type: z.enum(QUEST_OBJECTIVES),
  target: resourceRef
    .optional()
    .describe('What counts: a block, entity, item or advancement id, or a tag.'),
});
export type QuestObjective = z.infer<typeof questObjective>;

/** Paris time of day, "HH:MM". A range may cross midnight. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const questHours = z.object({ from: timeOfDay, to: timeOfDay });

const base = {
  id: questId,
  name: localized,
  description: localizedText.optional(),
  icon: resourceRef.describe('An item id shown next to the quest.'),
  objective: questObjective,
  enabled: z.boolean().default(true),
};

/** Rbase: LNBits at the reference index. */
const reward = z.number().min(0).max(1_000_000);

const subcategory = questCategoryId
  .optional()
  .describe('A subcategory of the category, shown as a heading inside it.');

export const questIndividual = z.object({
  ...base,
  family: z.literal('individual'),
  category: questCategoryId.describe('The chapter: an `individual` category.'),
  subcategory,
  tiers: z
    .array(z.object({ amount: z.int().min(1).max(1_000_000_000), reward, items }))
    .min(1)
    .max(10)
    .refine((tiers) => tiers.every((tier, i) => i === 0 || tier.amount > tiers[i - 1]!.amount), {
      message: 'Tiers are cumulative: each needs a larger amount than the one before.',
    }),
});

export const questServer = z.object({
  ...base,
  family: z.literal('server'),
  category: questCategoryId
    .optional()
    .describe(
      'The Records group: a `server` category. Without one, the game guesses from the advancement.',
    ),
  subcategory,
  advancement: resourceRef,
  tier: z.enum(['rare', 'epic', 'legendary']),
  reward,
  ranks: z.array(z.number().min(0).max(100)).min(1).max(10).default([100, 60, 20]),
  restShare: z.number().min(0).max(100).default(2),
  items,
  hidden: z
    .boolean()
    .default(false)
    .describe('A secret advancement: shown as "???" until someone takes first place.'),
});

export const questFlash = z.object({
  ...base,
  family: z.literal('flash'),
  objective: questObjective.extend({ type: z.enum(FLASH_OBJECTIVES) }),
  range: z
    .object({ min: z.int().min(1).max(100_000), max: z.int().min(1).max(100_000) })
    .refine((range) => range.max >= range.min, { message: 'max must be at least min.' }),
  rewardPerUnit: z.number().min(0).max(100_000),
  weight: z.int().min(1).max(100).default(1),
  minPlayers: z.int().min(1).max(200).default(2),
  hours: questHours.optional(),
});

/** Drawn each day (Paris), the same for everyone; each player who reaches the quantity before midnight is paid. */
export const questDaily = z.object({
  ...base,
  family: z.literal('daily'),
  objective: questObjective.extend({ type: z.enum(FLASH_OBJECTIVES) }),
  range: z
    .object({ min: z.int().min(1).max(1_000_000), max: z.int().min(1).max(1_000_000) })
    .refine((range) => range.max >= range.min, { message: 'max must be at least min.' }),
  rewardPerUnit: z.number().min(0).max(100_000),
  weight: z.int().min(1).max(100).default(1),
});

export const questDefinition = z.discriminatedUnion('family', [
  questIndividual,
  questServer,
  questFlash,
  questDaily,
]);
export type QuestDefinition = z.infer<typeof questDefinition>;
export type QuestDefinitionInput = z.input<typeof questDefinition>;

// Categories.

export const questSubcategory = z.object({ id: questCategoryId, name: localized });

export const questCategory = z.object({
  id: questCategoryId,
  family: z.enum(QUEST_CATEGORY_FAMILIES),
  name: localized,
  icon: resourceRef.describe('An item id: the chapter or group icon in the game.'),
  siteIcon: z
    .string()
    .regex(/^i-lucide-[a-z0-9-]+$/)
    .optional()
    .describe('A Lucide icon for the site, like `i-lucide-pickaxe`.'),
  subcategories: z
    .array(questSubcategory)
    .max(30)
    .default([])
    .refine((list) => new Set(list.map((entry) => entry.id)).size === list.length, {
      message: 'Two subcategories share an id.',
    }),
  sortOrder: z.int().min(0).max(100_000).optional(),
});
export type QuestCategory = z.infer<typeof questCategory>;
export type QuestCategoryInput = z.input<typeof questCategory>;

// Community quests.

export const questCommunityDefinition = z.object({
  title: localized,
  objective: questObjective.extend({ type: z.enum(FLASH_OBJECTIVES) }),
  goal: z.int().min(1).max(1_000_000_000_000),
  tiers: z
    .array(z.object({ name: z.string().min(1).max(24), at: z.number().min(1).max(1000), reward }))
    .min(1)
    .max(5),
  thresholdPercent: z.number().min(0).max(100).default(0.5),
  topBonusPercent: z.number().min(0).max(500).default(20),
});
export type QuestCommunityDefinition = z.infer<typeof questCommunityDefinition>;

export const questCommunityTemplateDefinition = questCommunityDefinition
  .omit({ goal: true })
  .extend({
    goal: z.object({ min: z.int().min(1), max: z.int().min(1) }),
    days: z.int().min(1).max(31).default(7),
  });

// Settings.

export const QUEST_SHARE_FAMILIES = [
  'individual',
  'server',
  'community',
  'flash',
  'daily',
] as const;
export type QuestShareFamily = (typeof QUEST_SHARE_FAMILIES)[number];

export const questSettings = z.object({
  formula: z
    .object({
      wMedian: z.number().min(0).max(1).default(0.75),
      wQ3: z.number().min(0).max(1).default(0.25),
      wMean: z.number().min(0).max(1).default(0),
      baselineIndex: z.number().min(1).max(1e12).default(1000),
      alpha: z.number().min(0).max(2).default(0.25),
      kMin: z.number().min(0).max(10).default(0.8),
      kMax: z.number().min(0.1).max(100).default(2),
      bMax: z.number().min(0).max(5).default(0.5),
    })
    .prefault({}),
  active: z
    .object({
      hours: z
        .int()
        .min(1)
        .max(24 * 60)
        .default(48),
      minPlaytimeMinutes: z.int().min(0).max(100_000).default(60),
      minPlayers: z.int().min(1).max(10_000).default(5),
    })
    .prefault({}),
  cap: z
    .object({
      percent: z.number().min(0).max(100).default(5),
      shares: z
        .object({
          individual: z.number().min(0).max(100).default(40),
          server: z.number().min(0).max(100).default(30),
          community: z.number().min(0).max(100).default(20),
          flash: z.number().min(0).max(100).default(10),
          daily: z.number().min(0).max(100).default(10),
        })
        .prefault({}),
    })
    .prefault({}),
  flash: z
    .object({
      intervalMinutes: z
        .int()
        .min(1)
        .max(24 * 60)
        .default(30),
      minPlayers: z.int().min(1).max(200).default(2),
      durationMinutes: z.int().min(1).max(240).default(15),
      hours: questHours.optional(),
    })
    .prefault({}),
  daily: z
    .object({ count: z.int().min(0).max(10).default(3) })
    .prefault({})
    .describe('How many daily quests are drawn each day (Paris). 0 turns them off.'),
  antiCheat: z
    .object({
      ignorePlacedBlocks: z.boolean().default(true),
      ignoreSpawnerMobs: z.boolean().default(true),
      ignoreMachineBreaks: z.boolean().default(true),
      countFluidBlocks: z.boolean().default(true),
      excludeCreative: z.boolean().default(true),
    })
    .prefault({}),
  community: z.object({ rotation: z.boolean().default(false) }).prefault({}),
  pollSeconds: z.int().min(30).max(3600).default(300),
});
export type QuestSettings = z.infer<typeof questSettings>;
export const questSettingsPatch = questSettings.partial();

export const questIndex = z.object({
  index: z.number(),
  kGlobal: z.number(),
});

// Server routes.

const idempotencyKey = z.uuid();

export const questCatalogBody = z.object({
  categories: z.array(z.unknown()).max(200).default([]),
  quests: z.array(z.unknown()).max(500),
});
export const questCatalogResult = z.object({
  added: z.array(z.string()),
  kept: z.array(z.string()),
  categoriesAdded: z.array(z.string()),
});

export const questProgressBody = z.object({
  items: z
    .array(z.object({ player: minecraftUuid, quest: questId, value: z.int().min(0) }))
    .min(1)
    .max(500),
});

export const questCompletionBody = z.object({
  idempotencyKey,
  player: minecraftUuid,
  quest: questId,
  tier: z.int().min(1).max(10),
});
export type QuestCompletionBody = z.input<typeof questCompletionBody>;

export const questCompletionResult = z.object({
  completionId: z.uuid(),
  replayed: z.boolean(),
  quest: questId,
  tier: z.int(),
  amount: z.number(),
  capped: z.boolean(),
  claimable: z.boolean(),
});
export type QuestCompletionResult = z.infer<typeof questCompletionResult>;

export const questClaimBody = z.object({ idempotencyKey, player: minecraftUuid });
export const questWebClaimBody = z.object({ idempotencyKey });

const paidTo = z
  .object({ accountId: z.string(), handle: z.null(), balance: z.number() })
  .nullable()
  .describe("The player's personal account, or null when nothing was paid.");

export const questClaimResult = z.object({
  transactionId: z.number().nullable(),
  replayed: z.boolean(),
  amount: z.number(),
  to: paidTo,
  mailboxItems: z.int(),
});
export type QuestClaimResult = z.infer<typeof questClaimResult>;

export const questAdvancementBody = z.object({
  idempotencyKey,
  player: minecraftUuid,
  quest: questId,
});
export type QuestAdvancementBody = z.input<typeof questAdvancementBody>;

export const questPodiumEntry = z.object({
  rank: z.int(),
  username: z.string(),
  amount: z.number(),
});
export const questAdvancementResult = z.object({
  replayed: z.boolean(),
  rank: z.int(),
  amount: z.number(),
  capped: z.boolean(),
  transactionId: z.number().nullable(),
  to: paidTo,
  mailboxItems: z.int(),
  podium: z.array(questPodiumEntry),
});
export type QuestAdvancementResult = z.infer<typeof questAdvancementResult>;

export const questFlashBody = z.object({
  idempotencyKey,
  quest: questId,
  quantity: z.int().min(1).max(100_000),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  winner: minecraftUuid.nullable(),
});
export type QuestFlashBody = z.input<typeof questFlashBody>;

export const questFlashResult = z.object({
  replayed: z.boolean(),
  flashId: z.uuid(),
  amount: z.number(),
  capped: z.boolean(),
  transactionId: z.number().nullable(),
  to: paidTo,
});
export type QuestFlashResult = z.infer<typeof questFlashResult>;

/** A Paris day, "YYYY-MM-DD". */
const parisDay = z.iso.date();

export const questDailyBody = z.object({
  idempotencyKey,
  player: minecraftUuid,
  day: parisDay.describe('The Paris day the quest was drawn for.'),
  quest: questId,
});
export type QuestDailyBody = z.input<typeof questDailyBody>;

export const questDailyResult = z.object({
  replayed: z.boolean(),
  completionId: z.uuid(),
  quantity: z.int(),
  amount: z.number(),
  capped: z.boolean(),
  transactionId: z.number().nullable(),
  to: paidTo,
});
export type QuestDailyResult = z.infer<typeof questDailyResult>;

/** Today's daily quests: the same draw for everyone until Paris midnight. */
export const questDailyView = z.object({
  day: parisDay,
  endsAt: isoDate,
  quests: z.array(z.object({ quest: questId, quantity: z.int() })),
});
export type QuestDailyView = z.infer<typeof questDailyView>;

export const questContributionBody = z.object({
  idempotencyKey,
  items: z
    .array(z.object({ player: minecraftUuid, amount: z.int().min(1).max(1_000_000_000) }))
    .min(1)
    .max(500),
});
export type QuestContributionBody = z.input<typeof questContributionBody>;
export const questContributionResult = z.object({
  replayed: z.boolean(),
  progress: z.number(),
  goal: z.number(),
});

export const questCommunityView = z.object({
  id: z.uuid(),
  title: localized,
  objective: questObjective,
  goal: z.number(),
  tiers: z.array(
    z.object({ name: z.string(), at: z.number(), reward: z.number(), rewardToday: z.number() }),
  ),
  thresholdPercent: z.number(),
  topBonusPercent: z.number(),
  startsAt: isoDate,
  endsAt: isoDate,
  status: z.enum(['scheduled', 'running', 'paid', 'cancelled']),
  progress: z.number(),
  contributors: z.int(),
});
export type QuestCommunityView = z.infer<typeof questCommunityView>;

export const questConfigResult = z.object({
  resetAt: isoDate
    .nullable()
    .describe(
      'When an admin last reset the quests, or null. A value the server has not handled yet means: start every player over.',
    ),
  quests: z
    .array(z.unknown())
    .describe('Every enabled quest of the catalogue, as `questDefinition`.'),
  categories: z.array(questCategory).describe('Categories in display order.'),
  daily: questDailyView,
  flash: z.object({
    intervalMinutes: z.int(),
    minPlayers: z.int(),
    durationMinutes: z.int(),
    hours: questHours.nullable(),
  }),
  antiCheat: questSettings.shape.antiCheat.unwrap(),
  community: questCommunityView.nullable(),
  index: questIndex,
  pollSeconds: z.int(),
});
export type QuestConfigResult = z.infer<typeof questConfigResult>;

export const questServerPlayerResult = z.object({
  completions: z.array(
    z.object({
      id: z.uuid(),
      quest: questId,
      tier: z.int(),
      amount: z.number(),
      capped: z.boolean(),
      completedAt: isoDate,
      claimedAt: isoDate.nullable(),
    }),
  ),
  podiums: z.record(z.string(), z.array(questPodiumEntry)),
  ranks: z.record(z.string(), z.int()),
  kPlayer: z.number(),
  community: z.object({ contribution: z.number(), qualified: z.boolean() }).nullable(),
  daily: z.array(questId).describe("Today's daily quests this person completed, with any account."),
});
export type QuestServerPlayerResult = z.infer<typeof questServerPlayerResult>;

// Admin.

export const questCommunityCreateBody = z.object({
  definition: questCommunityDefinition,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
export const questCommunityPatchBody = questCommunityCreateBody.partial();
export const questImportBody = z.object({
  categories: z.array(z.unknown()).max(200).default([]),
  quests: z.array(z.unknown()).max(500),
  overwrite: z.boolean().default(false),
});
export const questCategoryParams = z.object({
  family: z.enum(QUEST_CATEGORY_FAMILIES),
  id: questCategoryId,
});
/** What an admin types to wipe what players did. */
export const QUEST_RESET_CONFIRM = 'reset the quests';
export const questResetBody = z.object({ confirmation: z.literal(QUEST_RESET_CONFIRM) });
export const questAdminPatchBody = z.object({
  definition: z.unknown().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.int().optional(),
});

// Route parameters.

export const questIdParams = z.object({ id: questId });
export const questUuidParams = z.object({ id: z.uuid() });
export const questPlayerParams = z.object({ uuid: minecraftUuid });
export const questIndexQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
});
export const questTemplateBody = z.object({
  id: z.uuid().optional(),
  definition: z.unknown(),
  enabled: z.boolean().optional(),
});

/** The `data` of each event of GET /api/quests/server/events, by its `event` type. */
export const questServerEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('config'),
    data: z
      .object({})
      .describe(
        'A quest, the settings, the reset date or the community quest changed: read the config.',
      ),
  }),
  z.object({
    type: z.literal('player'),
    data: z.object({
      uuids: z.array(z.string()).describe('These players claimed a reward on the site.'),
    }),
  }),
]);
export type QuestServerEvent = z.infer<typeof questServerEvent>;
