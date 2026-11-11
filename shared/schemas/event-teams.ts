import { z } from 'zod';

import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '../utils/event-teams.ts';

// Team contracts for tournaments. See docs/tournaments.md. Responses are schemas too, so the API
// reference is built from the same definitions as the types.

/** A team name as typed: tidied on the server, checked for length and plain text there too. */
export const teamName = z
  .string()
  .trim()
  .min(TEAM_NAME_MIN)
  .max(TEAM_NAME_MAX * 2);

export const eventTeamParams = z.object({ id: z.uuid(), teamId: z.uuid() });
export const eventTeamMemberParams = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  userId: z.string().min(1).max(64),
});

/** POST /api/events/:id/teams */
export const eventTeamCreateBody = z.object({ name: teamName });
export type EventTeamCreateBody = z.input<typeof eventTeamCreateBody>;

/** PATCH /api/events/:id/teams/:teamId: only what is sent changes. */
export const eventTeamPatchBody = z
  .object({
    name: teamName.optional(),
    acceptsRequests: z.boolean().optional().describe('Whether players can ask to join.'),
  })
  .refine((body) => body.name !== undefined || body.acceptsRequests !== undefined);
export type EventTeamPatchBody = z.input<typeof eventTeamPatchBody>;

/** POST /api/events/:id/teams/:teamId/captain */
export const eventTeamCaptainBody = z.object({ userId: z.string().min(1).max(64) });

/** PATCH /api/events/:id/looking */
export const eventLookingBody = z.object({
  hidden: z
    .boolean()
    .describe('Hide the caller from the public list of players looking for a team.'),
});

export const eventInviteParams = z.object({
  id: z.uuid(),
  inviteId: z.coerce.number().int().positive(),
});

/** POST /api/events/:id/teams/:teamId/invites: the captain invites a player. */
export const eventTeamInviteBody = z.object({ userId: z.string().min(1).max(64) });

/** POST /api/events/:id/invites/:inviteId: answers an invitation, or a request as captain. */
export const eventInviteAnswerBody = z.object({ accept: z.boolean() });

/** GET /api/events/:id/team-players?q=: finds players to invite. */
export const eventPlayerSearchQuery = z.object({
  q: z.string().trim().min(3).max(100),
  teamId: z.uuid().optional().describe('The team inviting: marks those it already invited.'),
});
export const eventPlayerOption = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
  email: z.string(),
  invited: z.boolean().describe('The team already has a pending invitation for them.'),
});
export const eventPlayerOptions = z.object({ items: z.array(eventPlayerOption) });
export type EventPlayerOption = z.infer<typeof eventPlayerOption>;

const person = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
});

export const eventTeamMemberView = person.extend({
  captain: z.boolean(),
});

/** A pending invitation or request, as the captain or the player sees it. */
export const eventTeamInviteView = z.object({
  id: z.number(),
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
});

export const eventTeamView = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z
    .enum(['incomplete', 'registered', 'waitlist'])
    .describe(
      '`incomplete`: not enough players, takes no place. `registered`: validated, holds a place. `waitlist`: validated, waiting for a place.',
    ),
  position: z.number().nullable().describe('Place on the waitlist, from 1.'),
  players: z.number(),
  acceptsRequests: z.boolean(),
  members: z
    .array(eventTeamMemberView)
    .nullable()
    .describe('Null when signed out: names are for members only.'),
  mine: z.boolean().describe('The caller is in this team.'),
  captain: z.boolean().describe('The caller is its captain.'),
  invited: z
    .array(eventTeamInviteView)
    .nullable()
    .describe('Players invited and not answered yet. Captain only, else null.'),
  requests: z
    .array(eventTeamInviteView)
    .nullable()
    .describe('Players asking to join and not answered yet. Captain only, else null.'),
});
export type EventTeamView = z.infer<typeof eventTeamView>;

export const eventTeamsView = z.object({
  teams: z.array(eventTeamView),
  looking: z.object({
    count: z.number().describe('Registered players in no team who did not hide themselves.'),
    players: z
      .array(person)
      .nullable()
      .describe('Null when signed out: names are for members only.'),
  }),
  me: z
    .object({
      registered: z.boolean(),
      lookingHidden: z.boolean(),
      teamIds: z.array(z.uuid()),
      invitations: z.array(
        z.object({
          id: z.number(),
          teamId: z.uuid(),
          teamName: z.string(),
          from: z.string().nullable().describe("The captain's name."),
        }),
      ),
      requestedTeamIds: z.array(z.uuid()).describe('Teams the caller asked to join.'),
      requestsLeft: z.number(),
    })
    .nullable()
    .describe('Null when signed out.'),
});
export type EventTeamsView = z.infer<typeof eventTeamsView>;

export const eventTeamCreated = z.object({ id: z.uuid() });
