import { z } from 'zod';

import { ECONOMY_MAX_AMOUNT, economyAccountRef } from './economy.ts';
import { minecraftUuid } from './warden.ts';

// Market contracts (docs/market.md). Every amount of money is an integer number of cents. Prices
// per item, stocks and windows are numbers: they can be fractional. Money fields are never
// converted by the X-Economy-Units header: these routes are cents only.

const isoDate = z.string().meta({ format: 'date-time' });

export const MARKET_PERIODS = ['24h', '7d', '30d', '1y'] as const;
export const MARKET_STATS_PERIODS = ['7d', '30d', '90d', 'all'] as const;
/** The most items one order covers, whatever the setting: a mailbox row's count is a smallint. */
export const MARKET_MAX_ITEMS = 32767;

export const marketItemId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z\d_.-]+:[a-z\d_./-]+$/)
  .max(100)
  .describe('A Minecraft registry ID, such as `minecraft:cobblestone`.');
export const marketTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const marketDirection = z.enum(['sell', 'buy']);
export type MarketDirectionName = z.infer<typeof marketDirection>;

export const marketItemParams = z.object({ id: z.string().trim().min(1).max(100) });
export const marketPlayerParams = z.object({ uuid: minecraftUuid });

const positive = z.number().positive().max(1e12);

/** An item's curve and flags, as an admin edits them. */
export const marketItemFields = z.object({
  tier: marketTier,
  enabled: z.boolean(),
  sellable: z.boolean(),
  buyable: z.boolean(),
  p0: positive.describe('LNBits per item at the equilibrium stock.'),
  pMin: positive,
  pMax: positive,
  s0: positive.describe('The equilibrium stock, and the depth of the market.'),
  sMin: positive,
  sMax: positive,
  k: z.number().positive().max(10),
  alpha: z.number().min(0).max(1),
});

/** The order of the bounds, as the database also checks it. */
function ordered(fields: {
  p0?: number;
  pMin?: number;
  pMax?: number;
  s0?: number;
  sMin?: number;
  sMax?: number;
}): boolean {
  const { p0, pMin, pMax, s0, sMin, sMax } = fields;
  const prices = [pMin, p0, pMax].filter((x): x is number => x !== undefined);
  const stocks = [sMin, s0, sMax].filter((x): x is number => x !== undefined);
  const increasing = (list: number[]) => list.every((x, i) => i === 0 || x >= list[i - 1]!);
  return increasing(prices) && increasing(stocks);
}

/** POST /items: the ID, the tier, p0 and s0. Everything else follows the tier's defaults. */
export const marketItemCreateBody = marketItemFields
  .pick({ tier: true, p0: true, s0: true })
  .extend({
    id: marketItemId,
    enabled: z.boolean().default(true),
    sellable: z.boolean().default(true),
    buyable: z.boolean().default(false),
    pMin: positive.optional(),
    pMax: positive.optional(),
    sMin: positive.optional(),
    sMax: positive.optional(),
    k: marketItemFields.shape.k.optional(),
    alpha: marketItemFields.shape.alpha.optional(),
  })
  .refine(ordered, { message: 'pMin <= p0 <= pMax and sMin <= s0 <= sMax' });
export type MarketItemCreateBody = z.input<typeof marketItemCreateBody>;

/** PATCH /items/:id: any of the fields. Changing the curve writes a version. */
export const marketItemPatchBody = marketItemFields
  .partial()
  .extend({
    keepPrice: z
      .boolean()
      .default(true)
      .describe('Recompute the stock so the current price does not jump. False: the new curve.'),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'keepPrice'), {
    message: 'Nothing to change.',
  })
  .refine(ordered, { message: 'pMin <= p0 <= pMax and sMin <= s0 <= sMax' });
export type MarketItemPatchBody = z.input<typeof marketItemPatchBody>;

export const marketResetStockBody = z.object({
  reason: z.string().trim().min(1).max(500).describe('Kept in the audit log.'),
});

export const marketTierSettingsBody = z
  .object({
    tier: marketTier,
    q1: z.int().positive().max(ECONOMY_MAX_AMOUNT).describe('Cents of nominal value.'),
    q2: z.int().positive().max(ECONOMY_MAX_AMOUNT).describe('Cents of nominal value.'),
    midPercent: z.int().min(1).max(100),
    tailPercent: z.int().min(1).max(100),
  })
  .refine((tier) => tier.q1 < tier.q2, { message: 'q1 < q2' });

export const marketSettingsPatch = z
  .object({
    sigmaPercent: z.number().min(0).max(50),
    tolerancePercent: z.number().min(0).max(50),
    maxOrderItems: z.int().min(1).max(MARKET_MAX_ITEMS),
    mintCapPercent: z.number().min(0).max(100),
    historyDays: z.int().min(1).max(3650),
    tiers: z.array(marketTierSettingsBody).min(1).max(3),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });
export type MarketSettingsPatch = z.input<typeof marketSettingsPatch>;

export const marketValidateBody = z.object({
  items: z
    .array(marketItemFields.partial().extend({ id: marketItemId }))
    .max(100)
    .default([])
    .describe('Changes to try, by item. An unknown ID is a new item and needs its fields.'),
  sigmaPercent: z.number().min(0).max(50).optional(),
});
export type MarketValidateBody = z.input<typeof marketValidateBody>;

export const marketRecipeBody = z.object({
  recipes: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(100),
        output: z.object({ id: z.string().min(1).max(100), count: z.int().min(1).max(1000) }),
        inputs: z
          .array(z.object({ id: z.string().min(1).max(100), count: z.int().min(1).max(1000) }))
          .min(1)
          .max(27),
      }),
    )
    .min(1)
    .max(100_000),
});
export type MarketRecipeBody = z.input<typeof marketRecipeBody>;

/** An order, or a quote: the same request without the key and the expected total. */
export const marketQuoteBody = z.object({
  player: minecraftUuid,
  item: marketItemId,
  direction: marketDirection,
  quantity: z.int().min(1).max(MARKET_MAX_ITEMS),
});
export type MarketQuoteBody = z.input<typeof marketQuoteBody>;

export const marketOrderBody = marketQuoteBody.extend({
  idempotencyKey: z.uuid(),
  account: economyAccountRef
    .optional()
    .describe("A purchase only: the account that pays. The player's default one without it."),
  expectedTotal: z
    .int()
    .min(0)
    .max(ECONOMY_MAX_AMOUNT)
    .describe('The total the player saw, in cents.'),
});
export type MarketOrderBody = z.input<typeof marketOrderBody>;

export const marketOrdersQuery = z.object({
  cursor: z.string().max(20).optional(),
  item: z.string().trim().max(100).optional(),
  direction: marketDirection.optional(),
  q: z.string().trim().max(100).optional().describe("The player's name, email or username."),
});
export type MarketOrdersQuery = z.input<typeof marketOrdersQuery>;

export const marketStatsQuery = z.object({ period: z.enum(MARKET_STATS_PERIODS).default('30d') });
export const marketHistoryQuery = z.object({ period: z.enum(MARKET_PERIODS).default('24h') });

// ---------------------------------------------------------------------------------------------
// Responses

export const marketBracket = z.object({
  rate: z.number().describe('The share of the price paid, as a fraction.'),
  quantity: z.number().describe('Items sold at this rate. The one at a boundary is split.'),
  total: z.number().describe('Cents this part paid.'),
});

export const marketQuote = z.object({
  direction: marketDirection,
  item: z.string(),
  quantity: z.number(),
  total: z.number().describe('Cents. A sale is floored, a purchase rounded up, a sale capped.'),
  capped: z.boolean().describe('The 30-day mint budget cut the payout.'),
  brackets: z.array(marketBracket).optional().describe('A sale only.'),
  price: z.number().describe('The reference price after the order, LNBits per item.'),
  stock: z.number().describe('The stock after the order.'),
});
export type MarketQuote = z.infer<typeof marketQuote>;

const accountSide = z.object({
  accountId: z.uuid(),
  handle: z.string().nullable(),
  balance: z.number(),
});

export const marketOrderResult = marketQuote.extend({
  transactionId: z.number(),
  replayed: z.boolean(),
  account: accountSide,
  mailboxItemId: z.uuid().optional().describe('A purchase only: claim it to hand the items over.'),
});
export type MarketOrderResult = z.infer<typeof marketOrderResult>;

export const marketStateItem = marketItemFields
  .pick({ tier: true, sellable: true, buyable: true })
  .extend({
    id: z.string(),
    p0: z.number(),
    pMin: z.number(),
    pMax: z.number(),
    s0: z.number(),
    sMin: z.number(),
    sMax: z.number(),
    k: z.number(),
    alpha: z.number(),
    stock: z.number().describe('Drifted to `asOf`.'),
    stockAt: isoDate,
  });

export const marketTierWindow = z.object({
  tier: z.number(),
  nominal: z.number().describe('LNBits sold in the last 24 hours, before any reduction.'),
  rate: z.number(),
  toNextBracket: z.number().nullable().describe('LNBits of nominal value, null in the last one.'),
});

export type MarketTierWindowView = z.infer<typeof marketTierWindow>;

export const marketState = z.object({
  revision: z.number(),
  asOf: isoDate,
  settings: z.object({
    sigma: z.number(),
    tolerancePercent: z.number(),
    maxOrderItems: z.number(),
    sell: z.boolean(),
    buy: z.boolean(),
  }),
  tiers: z.array(
    z.object({
      tier: z.number(),
      q1: z.number(),
      q2: z.number(),
      midPercent: z.number(),
      tailPercent: z.number(),
    }),
  ),
  mintRemaining: z.number().describe('Cents the Market may still mint over the next 30 days.'),
  items: z.array(marketStateItem),
});
export type MarketState = z.infer<typeof marketState>;

export const marketPlayerWindow = z.object({
  tiers: z.array(marketTierWindow),
  capped: z.boolean().describe('The mint budget is spent.'),
});

export const marketRecipeResult = z.object({ stored: z.number(), problems: z.array(z.unknown()) });

const marketLoop = z.object({
  item: z.string(),
  value: z.number(),
  cost: z.number(),
  path: marketRecipeBody.shape.recipes.element.array(),
});
export const marketValidation = z.object({
  ok: z.boolean(),
  reason: z.enum(['noRecipes', 'loop']).nullable(),
  loops: z.array(marketLoop),
});
export type MarketValidationView = z.infer<typeof marketValidation>;

/** GET /api/market */
export const marketPublicItem = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.number(),
  sellable: z.boolean(),
  buyable: z.boolean(),
  price: z.number().describe('The reference price, LNBits per item.'),
  p0: z.number(),
  deltaPercent: z.number().describe('Against the base price p0.'),
  sell: z.object({ one: z.number(), stack: z.number() }).describe('Cents for 1 and 64 items.'),
  buy: z.object({ one: z.number(), stack: z.number() }).describe('Cents for 1 and 64 items.'),
  sparkline: z.array(z.number()).describe('The price over the last 24 hours, hourly.'),
});
export const marketPublic = z.object({
  items: z.array(marketPublicItem),
  sell: z.boolean(),
  buy: z.boolean(),
  me: marketPlayerWindow.optional().describe('Signed in with a linked Minecraft account.'),
});
export type MarketPublic = z.infer<typeof marketPublic>;

export const marketHistory = z.object({
  period: z.enum(MARKET_PERIODS),
  points: z.array(z.object({ at: isoDate, price: z.number(), stock: z.number() })),
});

export const marketAdminItem = marketStateItem.extend({
  enabled: z.boolean(),
  price: z.number(),
  name: z.string(),
  updatedAt: isoDate,
});
export type MarketAdminItem = z.infer<typeof marketAdminItem>;

export const marketAdminSettings = z.object({
  sigmaPercent: z.number(),
  tolerancePercent: z.number(),
  maxOrderItems: z.number(),
  mintCapPercent: z.number(),
  historyDays: z.number(),
  revision: z.number(),
  tiers: z.array(
    z.object({
      tier: z.number(),
      q1: z.number(),
      q2: z.number(),
      midPercent: z.number(),
      tailPercent: z.number(),
    }),
  ),
  updatedAt: isoDate,
});
export type MarketAdminSettings = z.infer<typeof marketAdminSettings>;

export const marketAdminRecipes = z.object({
  total: z.number(),
  items: z.array(
    z.object({
      type: z.string(),
      output: z.object({ id: z.string(), count: z.number() }),
      inputs: z.array(z.object({ id: z.string(), count: z.number() })),
    }),
  ),
});

export const marketAdminRecipesQuery = z.object({
  item: z.string().trim().max(100).optional().describe('Recipes that make this item.'),
});

export const marketAdminStats = z.object({
  period: z.enum(MARKET_STATS_PERIODS),
  days: z.array(z.object({ day: z.string(), minted: z.number(), burned: z.number() })),
  items: z.array(
    z.object({
      item: z.string(),
      minted: z.number(),
      burned: z.number(),
      sold: z.number(),
      bought: z.number(),
    }),
  ),
  volume: z.object({ orders: z.number(), minted: z.number(), burned: z.number() }),
  mintCap: z.object({ cap: z.number(), used: z.number(), remaining: z.number() }),
  topSellers: z.array(
    z.object({ userId: z.string().nullable(), name: z.string(), minted: z.number() }),
  ),
  stocks: z.array(
    z.object({
      item: z.string(),
      tier: z.number(),
      stock: z.number(),
      s0: z.number(),
      price: z.number(),
    }),
  ),
});

export const marketAdminOrder = z.object({
  id: z.number(),
  at: isoDate,
  userId: z.string().nullable(),
  name: z.string(),
  item: z.string(),
  direction: marketDirection,
  quantity: z.number(),
  total: z.number(),
  capped: z.boolean(),
  transactionId: z.number(),
  stockBefore: z.number(),
  stockAfter: z.number(),
});
export const marketAdminOrders = z.object({
  items: z.array(marketAdminOrder),
  nextCursor: z.string().nullable(),
});
