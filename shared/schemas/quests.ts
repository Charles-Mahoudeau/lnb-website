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
] as const;
export type QuestProblem = (typeof QUEST_PROBLEMS)[number];

// The catalogue.

export const QUEST_FAMILIES = ['individual', 'server', 'flash'] as const;
export const QUEST_CATEGORIES = [
  'mining',
  'combat',
  'fishing',
  'exploration',
  'crafting',
  'delivery',
] as const;
export const QUEST_OBJECTIVES = [
  'kill',
  'mine',
  'fish',
  'craft',
  'travel',
  'deliver',
  'advancement',
] as const;
/** Objectives a flash race can use: delivering would reward a full chest, not the race. */
export const FLASH_OBJECTIVES = ['kill', 'mine', 'fish', 'craft', 'travel'] as const;

export const questId = z
  .string()
  .regex(/^[a-z0-9_]{3,48}$/)
  .describe('Stable key of the quest: 3 to 48 lower-case letters, digits or underscores.');

const localized = z.object({ fr: z.string().min(1).max(80), en: z.string().min(1).max(80) });
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

export const questIndividual = z.object({
  ...base,
  family: z.literal('individual'),
  category: z.enum(QUEST_CATEGORIES),
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

export const questDefinition = z.discriminatedUnion('family', [
  questIndividual,
  questServer,
  questFlash,
]);
export type QuestDefinition = z.infer<typeof questDefinition>;
export type QuestDefinitionInput = z.input<typeof questDefinition>;

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

export const QUEST_SHARE_FAMILIES = ['individual', 'server', 'community', 'flash'] as const;
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

export const questCatalogBody = z.object({ quests: z.array(z.unknown()).max(500) });
export const questCatalogResult = z.object({
  added: z.array(z.string()),
  kept: z.array(z.string()),
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
  season: z.object({ id: z.int(), number: z.int(), startedAt: isoDate }),
  quests: z
    .array(z.unknown())
    .describe('Every enabled quest of the catalogue, as `questDefinition`.'),
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
  quests: z.array(z.unknown()).max(500),
  overwrite: z.boolean().default(false),
});
export const questSeasonBody = z.object({ confirmation: z.literal('new season') });
export const questAdminPatchBody = z.object({
  definition: z.unknown().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.int().optional(),
});

// Route parameters.

export const questIdParams = z.object({ id: questId });
export const questUuidParams = z.object({ id: z.uuid() });
export const questPlayerParams = z.object({ uuid: minecraftUuid });
export const questOverviewQuery = z.object({ season: z.coerce.number().int().min(1).optional() });
export const questIndexQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
});
export const questTemplateBody = z.object({
  id: z.uuid().optional(),
  definition: z.unknown(),
  enabled: z.boolean().optional(),
});
