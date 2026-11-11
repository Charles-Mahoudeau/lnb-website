// Team rules with no database and no Nuxt imports, so unit tests can load them. See
// docs/tournaments.md.
import { teamSize } from '../../../shared/utils/event-teams.ts';
import type { EventTeamStatus } from '../../db/schema/events.ts';

/** What a team's status should be after its roster or the event's places changed. */
export interface TeamStatusInput {
  /** How many players are in the team. */
  players: number;
  min: number;
  max: number;
  current: EventTeamStatus;
  /** Null: no limit on teams. */
  capacity: number | null;
  /** Validated teams holding a place right now, this team not counted. */
  placesTaken: number;
  /**
   * Set when a manager validated the team by hand: it stays valid under the minimum. Over the
   * maximum is allowed too, so a forced team keeps its place.
   */
  forced?: boolean;
}

/**
 * The status a team moves to. An incomplete team that becomes valid takes a place if one is free,
 * else joins the waitlist. A team that stops being valid goes back to incomplete and loses its
 * place and its waitlist position. A team already holding a place, or waiting, keeps it while it
 * stays valid.
 */
export function nextTeamStatus(input: TeamStatusInput): EventTeamStatus {
  const size = teamSize(input.players, input.min, input.max);
  const valid = size === 'valid' || (input.forced && input.players > 0);
  if (!valid) return 'incomplete';
  if (input.current === 'registered' || input.current === 'waitlist') return input.current;
  const hasRoom = input.capacity === null || input.placesTaken < input.capacity;
  return hasRoom ? 'registered' : 'waitlist';
}

/**
 * How many waiting teams get a place: as many as there are free places, or all once there's no
 * limit. None after the start, when the list is frozen.
 */
export function teamsToPromote(
  event: { startsAt: Date; capacity: number | null; registeredTeams: number; waitingTeams: number },
  now = new Date(),
): number {
  if (now >= event.startsAt || event.waitingTeams === 0) return 0;
  if (event.capacity === null) return event.waitingTeams;
  return Math.max(0, Math.min(event.capacity - event.registeredTeams, event.waitingTeams));
}

/**
 * Whether players can still join teams, invite or ask: until the registration window closes, or
 * the event starts if the window has no end. Leaving stays possible until the start.
 */
export function isRosterLocked(
  event: { startsAt: Date; registrationClosesAt: Date | null },
  now = new Date(),
): boolean {
  if (now >= event.startsAt) return true;
  return event.registrationClosesAt !== null && now >= event.registrationClosesAt;
}

/** How many invitations a captain can still send: the room left, counting those waiting. */
export function invitesLeft(input: { max: number; players: number; pending: number }): number {
  return Math.max(0, input.max - input.players - input.pending);
}

/** Who becomes captain when the captain leaves: the member who joined first. Null if nobody. */
export function nextCaptain(
  members: readonly { userId: string; joinedAt: Date; id: number }[],
  leavingUserId: string,
): string | null {
  const rest = members.filter((m) => m.userId !== leavingUserId);
  rest.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id - b.id);
  return rest[0]?.userId ?? null;
}
