import { z } from 'zod';

// Gamesplanet promotion contracts, shared by the routes and the pages. See docs/gamesplanet.md.

export const GAMESPLANET_PROBLEMS = [
  'gameNotFound',
  'notSoldInFrance',
  'alreadyPinned',
  'tooManyPins',
  'pinNotFound',
  'syncFailed',
] as const;
export type GamesplanetProblem = (typeof GAMESPLANET_PROBLEMS)[number];

/** How many games admins can put first. */
export const GAMESPLANET_MAX_PINS = 3;
/** How many deals the partners band and the home card show. */
export const GAMESPLANET_DEALS_SHOWN = 3;

const UID = /^\d+-\d+$/;
export const gamesplanetUidParams = z.object({ uid: z.string().regex(UID) });
export const gamesplanetCoverParams = z.object({ key: z.string().regex(/^[0-9a-f]{64}\.webp$/) });

// Public

export const gamesplanetDeal = z.object({
  uid: z.string(),
  name: z.string(),
  publisher: z.string().nullable(),
  url: z.string().describe('The game page on Gamesplanet, with the affiliate ref.'),
  priceCents: z.number().int().describe('The price in euro cents.'),
  basePriceCents: z.number().int().describe('The regular price in euro cents.'),
  discountPercent: z
    .number()
    .int()
    .nullable()
    .describe('Null when the price is not under the regular one.'),
  endsAt: z
    .string()
    .nullable()
    .describe('When a flash price ends. Null for other prices, and once it has passed.'),
  cover: z.string().nullable().describe('Our copy of the 620 × 300 art. Null until downloaded.'),
  packshot: z.string().nullable().describe('Our copy of the cover, 500 px wide.'),
  pinned: z.boolean().describe('True when an admin put the game first.'),
});
export type GamesplanetDeal = z.infer<typeof gamesplanetDeal>;

/** GET /api/gamesplanet */
export const gamesplanetPublicView = z.object({
  deals: z
    .array(gamesplanetDeal)
    .describe('Pinned games first, then the best sellers France can buy. At most three.'),
  siteUrl: z.string().describe('Gamesplanet’s home page, with the affiliate ref.'),
});
export type GamesplanetPublicView = z.infer<typeof gamesplanetPublicView>;

// Admin

export const gamesplanetAdminGame = gamesplanetDeal.extend({
  chartRank: z.number().int().nullable(),
  availableInFrance: z.boolean(),
  pegi: z.number().int().nullable(),
});
export type GamesplanetAdminGame = z.infer<typeof gamesplanetAdminGame>;

/** GET /api/admin/gamesplanet */
export const gamesplanetAdminView = z.object({
  refCode: z.string(),
  pins: z.array(gamesplanetAdminGame).describe('The pinned games, in order.'),
  charts: z.array(gamesplanetAdminGame).describe('The first ten best sellers.'),
  stats: z.object({
    games: z.number().int().describe('Games in the catalog.'),
    charts: z.number().int().describe('Games in the best sellers.'),
    covers: z.number().int().describe('Games with a stored cover.'),
    catalogSyncedAt: z.string().nullable(),
    dealsSyncedAt: z.string().nullable(),
  }),
});
export type GamesplanetAdminView = z.infer<typeof gamesplanetAdminView>;

/** PATCH /api/admin/gamesplanet/settings */
export const gamesplanetSettingsBody = z.object({
  refCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,40}$/),
});
export type GamesplanetSettingsBody = z.input<typeof gamesplanetSettingsBody>;
export const gamesplanetSettingsView = z.object({ refCode: z.string() });

/** POST /api/admin/gamesplanet/pins */
export const gamesplanetPinBody = z.object({ uid: z.string().regex(UID) });
export type GamesplanetPinBody = z.infer<typeof gamesplanetPinBody>;

/** POST .../pins/:uid/move */
export const gamesplanetMoveBody = z.object({ direction: z.enum(['up', 'down']) });
export type GamesplanetMoveBody = z.infer<typeof gamesplanetMoveBody>;

/** GET /api/admin/gamesplanet/search */
export const gamesplanetSearchQuery = z.object({
  q: z.string().trim().min(2).max(300).describe('Part of a name, or a Gamesplanet or Steam link.'),
});
export const gamesplanetSearchView = z.object({
  games: z.array(gamesplanetAdminGame).describe('Up to ten matches, best sellers first.'),
});
export type GamesplanetSearchView = z.infer<typeof gamesplanetSearchView>;

/** POST /api/admin/gamesplanet/sync */
export const gamesplanetSyncBody = z.object({ feed: z.enum(['deals', 'catalog']) });
export type GamesplanetSyncBody = z.infer<typeof gamesplanetSyncBody>;
export const gamesplanetSyncView = z.object({
  games: z.number().int().describe('Games the feed listed. Zero when nothing had changed.'),
  unchanged: z.boolean(),
});
export type GamesplanetSyncView = z.infer<typeof gamesplanetSyncView>;
