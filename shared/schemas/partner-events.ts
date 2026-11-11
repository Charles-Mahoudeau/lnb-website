import { z } from 'zod';

// Partner event contracts, shared by the routes and the pages. See docs/partner-events.md.

export const PARTNER_EVENT_PROBLEMS = [
  'partnerEventNotFound',
  'interestClosed',
  'partnerEventClosed',
  'consentRequired',
] as const;
export type PartnerEventProblem = (typeof PARTNER_EVENT_PROBLEMS)[number];

/** The games a partner event can have, in the page's order. */
export const PARTNER_GAME_KEYS = ['lol', 'valorant', 'rocket-league', 'cs2'] as const;
export type PartnerGameKey = (typeof PARTNER_GAME_KEYS)[number];

/** `confirmed` games take teams, `study` games only interest. */
export const PARTNER_GAME_STATUSES = ['confirmed', 'study'] as const;
export type PartnerGameStatus = (typeof PARTNER_GAME_STATUSES)[number];

/** The longest in-game name or rank. */
export const INTEREST_TEXT_MAX = 40;

export const partnerEventParams = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
});

const isoDate = z.string().meta({ format: 'date-time' });

// Public page

export const partnerGameView = z.object({
  key: z.enum(PARTNER_GAME_KEYS),
  status: z.enum(PARTNER_GAME_STATUSES),
  starters: z.number().int(),
  substitutes: z.number().int(),
  art: z.string().nullable().describe('The card art URL, or null for the tinted fallback.'),
  interested: z.number().int().describe('Students interested in this game.'),
  teams: z.number().int().describe('Teams of this game. Always 0 until teams are built.'),
});
export type PartnerGameView = z.infer<typeof partnerGameView>;

/** A signed-in student's own interest in one game. */
export const partnerInterestView = z.object({
  game: z.enum(PARTNER_GAME_KEYS),
  inGameName: z.string(),
  rank: z.string(),
  hidden: z.boolean(),
});
export type PartnerInterestView = z.infer<typeof partnerInterestView>;

/** GET /api/partner-events/:slug */
export const partnerEventView = z.object({
  slug: z.string(),
  websiteUrl: z.string().nullable(),
  discordUrl: z.string().nullable(),
  hero: z.string().nullable().describe('The hero art URL, or null for the tinted fallback.'),
  dateText: z
    .object({ en: z.string(), fr: z.string() })
    .describe('The date as given by the organizer. Empty while it is not fixed.'),
  dateConfirmed: z.boolean(),
  interestOpen: z.boolean().describe('False while an admin or the flag pauses saving interest.'),
  teamsOpen: z.boolean(),
  closedAt: isoDate.nullable().describe('Set once the event is closed: the page is read-only.'),
  games: z.array(partnerGameView),
  mine: z
    .array(partnerInterestView)
    .nullable()
    .describe('The signed-in student’s own interest. Null for visitors.'),
});
export type PartnerEventView = z.infer<typeof partnerEventView>;

// Interest

const interestText = z.string().trim().max(INTEREST_TEXT_MAX);

/**
 * PUT /api/partner-events/:slug/interest. The whole set of games the student is interested in:
 * games left out are withdrawn, and an empty list withdraws everything (no consent needed then).
 */
export const partnerInterestBody = z
  .object({
    consent: z
      .boolean()
      .describe(
        'Agreement to share name, school email, game, in-game name and rank with the organizer.',
      ),
    games: z
      .array(
        z.object({
          game: z.enum(PARTNER_GAME_KEYS),
          inGameName: interestText.default(''),
          rank: interestText.default(''),
          hidden: z.boolean().default(false),
        }),
      )
      .max(PARTNER_GAME_KEYS.length)
      .refine((games) => new Set(games.map((game) => game.game)).size === games.length, {
        message: 'A game can only be listed once.',
      }),
  })
  .strict();
export type PartnerInterestBody = z.input<typeof partnerInterestBody>;
