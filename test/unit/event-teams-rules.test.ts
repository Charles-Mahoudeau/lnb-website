import { describe, expect, it } from 'vitest';

import {
  invitesLeft,
  isRosterLocked,
  nextCaptain,
  nextTeamStatus,
  teamsToPromote,
} from '../../server/services/events/team-rules.ts';
import {
  cleanTeamName,
  isValidTeamName,
  teamNameKey,
  teamSize,
  teamSizeProblem,
} from '../../shared/utils/event-teams.ts';

describe('team names', () => {
  it('tidies spaces', () => {
    expect(cleanTeamName('  Night   Owls ')).toBe('Night Owls');
  });

  it('counts people-visible characters, from 3 to 30', () => {
    expect(isValidTeamName('ab')).toBe(false);
    expect(isValidTeamName('abc')).toBe(true);
    expect(isValidTeamName('é'.repeat(30))).toBe(true);
    expect(isValidTeamName('a'.repeat(31))).toBe(false);
    expect(isValidTeamName('  a b  ')).toBe(true);
    expect(isValidTeamName('  a  ')).toBe(false);
  });

  it('refuses control characters', () => {
    expect(isValidTeamName('Night\u0007Owls')).toBe(false);
    expect(cleanTeamName('Night\nOwls')).toBe('Night Owls');
  });

  it('treats names that differ by case, accents or spaces as the same', () => {
    expect(teamNameKey('Les  Éclairs')).toBe(teamNameKey('les eclairs'));
    expect(teamNameKey('Night Owls')).not.toBe(teamNameKey('Night Owl'));
  });
});

describe('team sizes', () => {
  it('sorts a team against the event limits', () => {
    expect(teamSize(2, 3, 4)).toBe('incomplete');
    expect(teamSize(3, 3, 4)).toBe('valid');
    expect(teamSize(4, 3, 4)).toBe('valid');
    expect(teamSize(5, 3, 4)).toBe('over');
  });

  it('checks the limits an event asks for', () => {
    expect(teamSizeProblem(3, 4)).toBeNull();
    expect(teamSizeProblem(2, 2)).toBeNull();
    expect(teamSizeProblem(1, 4)).toBe('min');
    expect(teamSizeProblem(4, 3)).toBe('max');
    expect(teamSizeProblem(3, 33)).toBe('max');
    expect(teamSizeProblem(2.5, 4)).toBe('min');
  });
});

describe('nextTeamStatus', () => {
  const base = { min: 3, max: 4, capacity: 4, placesTaken: 2, current: 'incomplete' as const };

  it('stays incomplete under the minimum', () => {
    expect(nextTeamStatus({ ...base, players: 2 })).toBe('incomplete');
  });

  it('takes a free place on becoming valid', () => {
    expect(nextTeamStatus({ ...base, players: 3 })).toBe('registered');
  });

  it('waits when no place is free', () => {
    expect(nextTeamStatus({ ...base, players: 3, placesTaken: 4 })).toBe('waitlist');
  });

  it('has no limit without a capacity', () => {
    expect(nextTeamStatus({ ...base, players: 3, capacity: null, placesTaken: 99 })).toBe(
      'registered',
    );
  });

  it('keeps its place and its waitlist position while valid', () => {
    expect(nextTeamStatus({ ...base, players: 4, current: 'registered', placesTaken: 4 })).toBe(
      'registered',
    );
    expect(nextTeamStatus({ ...base, players: 3, current: 'waitlist', placesTaken: 3 })).toBe(
      'waitlist',
    );
  });

  it('goes back to incomplete under the minimum, losing the place', () => {
    expect(nextTeamStatus({ ...base, players: 2, current: 'registered' })).toBe('incomplete');
    expect(nextTeamStatus({ ...base, players: 2, current: 'waitlist' })).toBe('incomplete');
  });

  it('does not take a place over the maximum, unless forced', () => {
    expect(nextTeamStatus({ ...base, players: 5 })).toBe('incomplete');
    expect(nextTeamStatus({ ...base, players: 5, forced: true })).toBe('registered');
  });

  it('lets a manager validate a small team by hand, but never an empty one', () => {
    expect(nextTeamStatus({ ...base, players: 2, forced: true })).toBe('registered');
    expect(nextTeamStatus({ ...base, players: 0, forced: true })).toBe('incomplete');
  });
});

describe('teamsToPromote', () => {
  const startsAt = new Date('2026-11-20T18:00:00Z');
  const now = new Date('2026-11-18T10:00:00Z');

  it('promotes as many as there are free places', () => {
    expect(
      teamsToPromote({ startsAt, capacity: 4, registeredTeams: 3, waitingTeams: 5 }, now),
    ).toBe(1);
    expect(
      teamsToPromote({ startsAt, capacity: 4, registeredTeams: 4, waitingTeams: 5 }, now),
    ).toBe(0);
  });

  it('promotes everyone without a limit', () => {
    expect(
      teamsToPromote({ startsAt, capacity: null, registeredTeams: 9, waitingTeams: 2 }, now),
    ).toBe(2);
  });

  it('freezes once the event has started', () => {
    expect(
      teamsToPromote(
        { startsAt, capacity: 4, registeredTeams: 1, waitingTeams: 2 },
        new Date('2026-11-20T18:00:01Z'),
      ),
    ).toBe(0);
  });
});

describe('isRosterLocked', () => {
  const startsAt = new Date('2026-11-20T18:00:00Z');
  const closes = new Date('2026-11-18T22:59:00Z');

  it('locks when the registration window closes', () => {
    expect(
      isRosterLocked({ startsAt, registrationClosesAt: closes }, new Date('2026-11-18T22:00:00Z')),
    ).toBe(false);
    expect(isRosterLocked({ startsAt, registrationClosesAt: closes }, closes)).toBe(true);
  });

  it('locks at the start when the window has no end', () => {
    expect(
      isRosterLocked({ startsAt, registrationClosesAt: null }, new Date('2026-11-20T17:59:00Z')),
    ).toBe(false);
    expect(isRosterLocked({ startsAt, registrationClosesAt: null }, startsAt)).toBe(true);
  });
});

describe('invitesLeft', () => {
  it('counts the room left, minus invitations already waiting', () => {
    expect(invitesLeft({ max: 4, players: 2, pending: 0 })).toBe(2);
    expect(invitesLeft({ max: 4, players: 2, pending: 1 })).toBe(1);
    expect(invitesLeft({ max: 4, players: 4, pending: 0 })).toBe(0);
    expect(invitesLeft({ max: 4, players: 5, pending: 1 })).toBe(0);
  });
});

describe('nextCaptain', () => {
  const at = (d: string) => new Date(`2026-11-1${d}T10:00:00Z`);
  const members = [
    { id: 1, userId: 'a', joinedAt: at('0') },
    { id: 3, userId: 'c', joinedAt: at('2') },
    { id: 2, userId: 'b', joinedAt: at('2') },
  ];

  it('hands over to the member who joined first', () => {
    expect(nextCaptain(members, 'a')).toBe('b');
  });

  it('breaks ties by order of joining', () => {
    expect(nextCaptain(members.slice(1), 'zz')).toBe('b');
  });

  it('has nobody when the captain was alone', () => {
    expect(nextCaptain([members[0]!], 'a')).toBeNull();
  });
});
