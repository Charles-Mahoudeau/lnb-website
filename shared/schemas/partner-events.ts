import { z } from 'zod';

import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '../utils/event-teams.ts';

// Partner event contracts, shared by the routes and the pages. See docs/partner-events.md.

export const PARTNER_EVENT_PROBLEMS = [
  'partnerEventNotFound',
  'interestClosed',
  'partnerEventClosed',
  'consentRequired',
  'gameNotFound',
  'gameNotConfirmed',
  'teamsClosed',
  'interestRequired',
  'invalidTeamName',
  'invalidAbbreviation',
  'invalidBirthDate',
  'teamNameTaken',
  'abbreviationTaken',
  'teamNotFound',
  'notCaptain',
  'alreadyInTeam',
  'notInTeam',
  'teamFull',
  'inviteNotFound',
  'notYourInvite',
  'alreadyInvited',
  'alreadyRequested',
  'requestsClosed',
  'tooManyRequests',
  'tooManyInvites',
  'notLooking',
  'imageNotFound',
  'gameHasTeams',
  'placesInUse',
  'alreadyAnnounced',
] as const;
export type PartnerEventProblem = (typeof PARTNER_EVENT_PROBLEMS)[number];

/** The partner event the home page and the events list promote while it is open. */
export const FEATURED_PARTNER_EVENT = 'arena-league-universite-2027';

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
  teams: z.number().int().describe('Teams of this game.'),
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
  students: z
    .number()
    .int()
    .describe('Students interested in at least one game, each counted once.'),
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

// Teams

export const TEAM_ABBREVIATION_MIN = 2;
export const TEAM_ABBREVIATION_MAX = 5;
/** A student can have this many requests to join waiting at once, per game. */
export const MAX_PENDING_REQUESTS = 3;
/** A student can have this many invitations waiting per game. */
export const MAX_PENDING_INVITES = 10;

export const PARTNER_TEAM_ROLES = ['starter', 'substitute'] as const;
export type PartnerTeamRole = (typeof PARTNER_TEAM_ROLES)[number];

export const partnerGameParams = partnerEventParams.extend({ game: z.enum(PARTNER_GAME_KEYS) });
export const partnerTeamParams = partnerGameParams.extend({ teamId: z.uuid() });
export const partnerTeamMemberParams = partnerTeamParams.extend({
  userId: z.string().min(1).max(64),
});
export const partnerInviteParams = partnerGameParams.extend({
  inviteId: z.coerce.number().int().positive(),
});

/** A calendar date as `YYYY-MM-DD`, in the past, from 1940. */
export const birthDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value) &&
    date.getUTCFullYear() >= 1940 &&
    date.getTime() < Date.now()
  );
}, 'Not a valid date of birth.');

const teamName = z
  .string()
  .trim()
  .min(TEAM_NAME_MIN)
  .max(TEAM_NAME_MAX * 2);
const abbreviation = z
  .string()
  .trim()
  .min(TEAM_ABBREVIATION_MIN)
  .max(TEAM_ABBREVIATION_MAX * 2);

/** POST .../games/:game/teams. The captain gives their date of birth. */
export const partnerTeamCreateBody = z.object({ name: teamName, abbreviation, birthDate }).strict();
export type PartnerTeamCreateBody = z.input<typeof partnerTeamCreateBody>;

/** PATCH .../teams/:teamId: only what is sent changes. */
export const partnerTeamPatchBody = z
  .object({
    name: teamName.optional(),
    abbreviation: abbreviation.optional(),
    acceptsRequests: z.boolean().optional().describe('Whether students can ask to join.'),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.abbreviation !== undefined ||
      body.acceptsRequests !== undefined,
  );
export type PartnerTeamPatchBody = z.input<typeof partnerTeamPatchBody>;

/** PATCH .../members/:userId: moves a player between starter and substitute, or hands over captaincy. */
export const partnerMemberPatchBody = z
  .object({
    role: z.enum(PARTNER_TEAM_ROLES).optional(),
    captain: z.literal(true).optional().describe('Make this player the captain.'),
  })
  .strict()
  .refine((body) => (body.role !== undefined) !== (body.captain !== undefined));
export type PartnerMemberPatchBody = z.input<typeof partnerMemberPatchBody>;

/** POST .../teams/:teamId/invites */
export const partnerInviteBody = z.object({ userId: z.string().min(1).max(64) }).strict();
/** POST .../teams/:teamId/requests */
export const partnerRequestBody = z.object({ birthDate }).strict();
/** POST .../invites/:inviteId. Accepting an invitation needs the student's date of birth. */
export const partnerInviteAnswerBody = z
  .object({ accept: z.boolean(), birthDate: birthDate.optional() })
  .strict();
export type PartnerInviteAnswerBody = z.input<typeof partnerInviteAnswerBody>;

export const partnerPerson = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
  inGameName: z.string(),
  rank: z.string(),
});
export type PartnerPerson = z.infer<typeof partnerPerson>;

export const partnerTeamMemberView = partnerPerson.extend({
  role: z.enum(PARTNER_TEAM_ROLES),
  captain: z.boolean(),
});

const pendingPerson = partnerPerson.extend({ id: z.number().int() });

export const partnerTeamView = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  starters: z.number().int().describe('Starter places taken.'),
  substitutes: z.number().int().describe('Substitute places taken.'),
  complete: z.boolean().describe('Every starter place is taken.'),
  acceptsRequests: z.boolean(),
  members: z.array(partnerTeamMemberView).nullable().describe('Null for visitors.'),
  mine: z.boolean(),
  captain: z.boolean().describe('The caller is the captain.'),
  invited: z.array(pendingPerson).nullable().describe('Pending invitations, for the captain.'),
  requests: z.array(pendingPerson).nullable().describe('Pending requests, for the captain.'),
});
export type PartnerTeamView = z.infer<typeof partnerTeamView>;

/** GET .../games/:game */
export const partnerGameTeamsView = z.object({
  teams: z.array(partnerTeamView),
  looking: z.object({
    count: z.number().int(),
    players: z.array(partnerPerson).nullable().describe('Null for visitors.'),
  }),
  me: z
    .object({
      interested: z.boolean(),
      teamId: z.string().nullable(),
      invitations: z.array(
        z.object({
          id: z.number().int(),
          teamId: z.string(),
          teamName: z.string(),
          from: z.string().nullable(),
        }),
      ),
      requested: z.array(z.object({ id: z.number().int(), teamId: z.string() })),
      requestsLeft: z.number().int(),
    })
    .nullable(),
});
export type PartnerGameTeamsView = z.infer<typeof partnerGameTeamsView>;

export const partnerCreated = z.object({ id: z.string() });

// Admin

/** The days between closing an event and the deletion of its interest, teams and dates of birth. */
export const PARTNER_EVENT_PURGE_DAYS = 60;
export const PARTNER_REFERENT_ROLES = ['Manager', 'Manager / Joueur'] as const;
export type PartnerReferentRole = (typeof PARTNER_REFERENT_ROLES)[number];

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'An https link.');
const dateText = z.string().trim().max(80);
const mediaKey = z.string().regex(/^[0-9a-f]{64}\.(webp|jpg)$/);

/** PATCH /api/admin/partner-events/:slug: only what is sent changes. */
export const partnerEventSettingsBody = z
  .object({
    websiteUrl: httpsUrl.nullable(),
    discordUrl: httpsUrl.nullable(),
    dateTextEn: dateText,
    dateTextFr: dateText,
    dateConfirmed: z.boolean(),
    interestOpen: z.boolean(),
    teamsOpen: z.boolean(),
    heroKey: mediaKey.nullable(),
  })
  .partial()
  .strict();
export type PartnerEventSettingsBody = z.input<typeof partnerEventSettingsBody>;

const referentFields = {
  referentPseudo: z.string().trim().max(60),
  referentEmail: z.string().trim().max(120),
  referentBirthDate: birthDate.nullable(),
  referentRole: z.enum(PARTNER_REFERENT_ROLES),
};

/** PATCH /api/admin/partner-events/:slug/games/:game: only what is sent changes. */
export const partnerGameSettingsBody = z
  .object({
    status: z.enum(PARTNER_GAME_STATUSES),
    starters: z.number().int().min(1).max(16),
    substitutes: z.number().int().min(0).max(8),
    artKey: mediaKey.nullable(),
    ...referentFields,
  })
  .partial()
  .strict();
export type PartnerGameSettingsBody = z.input<typeof partnerGameSettingsBody>;

/** PATCH .../teams/:teamId. A null `referent` clears the team's own referent. */
export const partnerTeamReferentBody = z
  .object({
    referent: z
      .object({
        pseudo: referentFields.referentPseudo.min(1),
        email: referentFields.referentEmail,
        birthDate: referentFields.referentBirthDate,
        role: referentFields.referentRole,
      })
      .nullable(),
  })
  .strict();
export type PartnerTeamReferentBody = z.input<typeof partnerTeamReferentBody>;

export const partnerAdminTeamParams = partnerEventParams.extend({ teamId: z.uuid() });

const adminReferent = z.object({
  pseudo: z.string(),
  email: z.string(),
  birthDate: z.string().nullable(),
  role: z.enum(PARTNER_REFERENT_ROLES),
});

export const partnerAdminGame = z.object({
  key: z.enum(PARTNER_GAME_KEYS),
  status: z.enum(PARTNER_GAME_STATUSES),
  starters: z.number().int(),
  substitutes: z.number().int(),
  art: z.string().nullable(),
  artKey: z.string().nullable(),
  referent: adminReferent,
  interested: z.number().int(),
  teams: z.number().int(),
  players: z.number().int(),
});

export const partnerAdminTeam = z.object({
  id: z.string(),
  game: z.enum(PARTNER_GAME_KEYS),
  name: z.string(),
  abbreviation: z.string(),
  starters: z.number().int(),
  substitutes: z.number().int(),
  captain: z.string().nullable(),
  referent: adminReferent.nullable().describe('The team’s own referent, or null for the game’s.'),
});

export const partnerAdminInterest = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
  game: z.enum(PARTNER_GAME_KEYS),
  inGameName: z.string(),
  rank: z.string(),
  status: z.enum(['team', 'looking', 'hidden']),
});

/** GET /api/admin/partner-events/:slug */
export const partnerAdminView = z.object({
  slug: z.string(),
  websiteUrl: z.string().nullable(),
  discordUrl: z.string().nullable(),
  hero: z.string().nullable(),
  heroKey: z.string().nullable(),
  dateTextEn: z.string(),
  dateTextFr: z.string(),
  dateConfirmed: z.boolean(),
  interestOpen: z.boolean(),
  teamsOpen: z.boolean(),
  closedAt: isoDate.nullable(),
  announcedAt: isoDate.nullable().describe('When the push announcement was queued.'),
  purgeAt: isoDate.nullable().describe('When the data is deleted: 60 days after closing.'),
  games: z.array(partnerAdminGame),
  teams: z.array(partnerAdminTeam),
  interest: z.array(partnerAdminInterest),
});
export type PartnerAdminView = z.infer<typeof partnerAdminView>;

/** POST /api/admin/partner-events/:slug/announce-impact */
export const partnerAnnounceImpactBody = z.object({
  locale: z.enum(['en', 'fr']).default('en').describe('The language of the preview.'),
});
