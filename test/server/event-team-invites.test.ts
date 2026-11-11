import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventRoom,
  eventTeam,
  eventTeamInvite,
  eventTeamMember,
  eventType,
  user,
} from '~~/server/db/schema';
import { eventTeamInviteService as invites } from '~~/server/services/events/team-invites';
import { eventTeamService } from '~~/server/services/events/teams';

// The services refuse with Nuxt's createError, which a plain Node test can't load.
vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const OTHER_SCHOOL = '00000000-0000-4000-8000-000000000001';
const NAMES = Array.from({ length: 6 }, (_, i) => `ti-p${String(i + 1)}`);
let roomId: string;
let typeId: string;

beforeAll(async () => {
  await db
    .insert(user)
    .values([
      ...NAMES.map((id) => ({
        id,
        name: `Player ${id}`,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
      {
        id: 'ti-other',
        name: 'Player other',
        email: 'ti-other@elsewhere.eu',
        tenantId: OTHER_SCHOOL,
      },
    ])
    .onConflictDoNothing();
  const [room] = await db.insert(eventRoom).values({ name: 'Invite room' }).returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Invites', nameFr: 'Invitations', icon: 'i-lucide-trophy' })
    .returning();
  roomId = room!.id;
  typeId = type!.id;
});

async function newEvent(patch: Partial<typeof event.$inferInsert> = {}) {
  const [row] = await db
    .insert(event)
    .values({
      name: 'Invite night',
      description: 'Teams of two.',
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      endsAt: new Date(Date.now() + 8 * 86_400_000),
      capacity: null,
      teamMode: true,
      teamMin: 2,
      teamMax: 2,
      hidden: false,
      ...patch,
    })
    .returning();
  return row!;
}

const register = (eventId: string, ...ids: string[]) =>
  db
    .insert(eventRegistration)
    .values(ids.map((userId) => ({ eventId, userId, status: 'registered' as const })));
const problem = (promise: Promise<unknown>, expected: string) =>
  expect(promise).rejects.toMatchObject({ data: { problem: expected } });
const members = async (teamId: string) =>
  (await db.select().from(eventTeamMember).where(eq(eventTeamMember.teamId, teamId))).length;
const teamOf = async (id: string) =>
  (await db.select().from(eventTeam).where(eq(eventTeam.id, id)))[0];

describe('invitations', () => {
  it('invites, accepts, and validates the team', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const { id: teamId } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Duo',
    });
    const inviteId = await invites.invite({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId,
      targetUserId: NAMES[1]!,
    });
    await problem(
      invites.answer({ userId: NAMES[2]!, eventId: e.id, inviteId, accept: true }),
      'notYourInvite',
    );
    const settled = await invites.answer({
      userId: NAMES[1]!,
      eventId: e.id,
      inviteId,
      accept: true,
    });
    expect(await members(teamId)).toBe(2);
    expect((await teamOf(teamId))!.status).toBe('registered');
    expect(settled.validated).toEqual([{ teamId, status: 'registered' }]);
    await problem(
      invites.answer({ userId: NAMES[1]!, eventId: e.id, inviteId, accept: true }),
      'inviteNotFound',
    );
  });

  it('registers an unregistered invitee who accepts, and refuses other schools', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!);
    const { id: teamId } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Recruiters',
    });
    await problem(
      invites.invite({ userId: NAMES[0]!, eventId: e.id, teamId, targetUserId: 'ti-other' }),
      'wrongSchool',
    );
    await problem(
      invites.invite({ userId: NAMES[1]!, eventId: e.id, teamId, targetUserId: NAMES[2]! }),
      'notCaptain',
    );
    const inviteId = await invites.invite({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId,
      targetUserId: NAMES[3]!,
    });
    await invites.answer({ userId: NAMES[3]!, eventId: e.id, inviteId, accept: true });
    const [reg] = await db
      .select()
      .from(eventRegistration)
      .where(and(eq(eventRegistration.eventId, e.id), eq(eventRegistration.userId, NAMES[3]!)));
    expect(reg).toMatchObject({ status: 'registered' });
    expect(await members(teamId)).toBe(2);
  });

  it('caps pending invitations by the room left, and refuses duplicates', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!);
    const { id: teamId } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Tiny',
    });
    await invites.invite({ userId: NAMES[0]!, eventId: e.id, teamId, targetUserId: NAMES[1]! });
    await problem(
      invites.invite({ userId: NAMES[0]!, eventId: e.id, teamId, targetUserId: NAMES[1]! }),
      'teamFull',
    );
    await problem(
      invites.invite({ userId: NAMES[0]!, eventId: e.id, teamId, targetUserId: NAMES[2]! }),
      'teamFull',
    );
  });

  it('cancels the other invitations of a player who joins, and declines silently', async () => {
    const e = await newEvent({ teamMax: 3 });
    await register(e.id, NAMES[0]!, NAMES[1]!, NAMES[2]!);
    const a = (await eventTeamService.create({ userId: NAMES[0]!, eventId: e.id, name: 'Team A' }))
      .id;
    const b = (await eventTeamService.create({ userId: NAMES[1]!, eventId: e.id, name: 'Team B' }))
      .id;
    const fromA = await invites.invite({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId: a,
      targetUserId: NAMES[2]!,
    });
    const fromB = await invites.invite({
      userId: NAMES[1]!,
      eventId: e.id,
      teamId: b,
      targetUserId: NAMES[2]!,
    });
    await invites.answer({ userId: NAMES[2]!, eventId: e.id, inviteId: fromA, accept: true });
    const [other] = await db.select().from(eventTeamInvite).where(eq(eventTeamInvite.id, fromB));
    expect(other!.status).toBe('cancelled');
    // Declining marks the invitation without joining anything.
    const c = await newEvent();
    await register(c.id, NAMES[0]!, NAMES[1]!);
    const t = (await eventTeamService.create({ userId: NAMES[0]!, eventId: c.id, name: 'Maybe' }))
      .id;
    const inviteId = await invites.invite({
      userId: NAMES[0]!,
      eventId: c.id,
      teamId: t,
      targetUserId: NAMES[1]!,
    });
    await invites.answer({ userId: NAMES[1]!, eventId: c.id, inviteId, accept: false });
    expect(await members(t)).toBe(1);
    const [declined] = await db
      .select()
      .from(eventTeamInvite)
      .where(eq(eventTeamInvite.id, inviteId));
    expect(declined!.status).toBe('declined');
  });

  it('refuses once the roster is locked', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const { id: teamId } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Late',
    });
    const inviteId = await invites.invite({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId,
      targetUserId: NAMES[1]!,
    });
    await db
      .update(event)
      .set({ registrationClosesAt: new Date(Date.now() - 1000) })
      .where(eq(event.id, e.id));
    await problem(
      invites.answer({ userId: NAMES[1]!, eventId: e.id, inviteId, accept: true }),
      'rosterLocked',
    );
    await problem(
      invites.invite({ userId: NAMES[0]!, eventId: e.id, teamId, targetUserId: NAMES[2]! }),
      'rosterLocked',
    );
  });
});

describe('requests', () => {
  it('lets a player ask, the captain accept, and limits them to three', async () => {
    const e = await newEvent({ teamMax: 3 });
    await register(e.id, ...NAMES);
    const teams: string[] = [];
    for (const [i, name] of ['Team 1', 'Team 2', 'Team 3', 'Team 4'].entries()) {
      teams.push((await eventTeamService.create({ userId: NAMES[i]!, eventId: e.id, name })).id);
    }
    const asker = NAMES[4]!;
    const first = await invites.request({ userId: asker, eventId: e.id, teamId: teams[0]! });
    await problem(
      invites.request({ userId: asker, eventId: e.id, teamId: teams[0]! }),
      'alreadyRequested',
    );
    await invites.request({ userId: asker, eventId: e.id, teamId: teams[1]! });
    await invites.request({ userId: asker, eventId: e.id, teamId: teams[2]! });
    await problem(
      invites.request({ userId: asker, eventId: e.id, teamId: teams[3]! }),
      'tooManyRequests',
    );
    // Only the captain of the team decides.
    await problem(
      invites.answer({ userId: NAMES[1]!, eventId: e.id, inviteId: first, accept: true }),
      'notCaptain',
    );
    await invites.answer({ userId: NAMES[0]!, eventId: e.id, inviteId: first, accept: true });
    expect(await members(teams[0]!)).toBe(2);
    // Joining a team cancels the other requests.
    const left = await db
      .select()
      .from(eventTeamInvite)
      .where(and(eq(eventTeamInvite.userId, asker), eq(eventTeamInvite.status, 'pending')));
    expect(left).toHaveLength(0);
  });

  it('refuses a team that closed requests or has no room', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!, NAMES[2]!);
    const { id: teamId } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Closed',
    });
    await eventTeamService.update({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId,
      body: { acceptsRequests: false },
    });
    await problem(invites.request({ userId: NAMES[1]!, eventId: e.id, teamId }), 'requestsClosed');
    await eventTeamService.update({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId,
      body: { acceptsRequests: true },
    });
    const ok = await invites.request({ userId: NAMES[1]!, eventId: e.id, teamId });
    await invites.answer({ userId: NAMES[0]!, eventId: e.id, inviteId: ok, accept: true });
    await problem(invites.request({ userId: NAMES[2]!, eventId: e.id, teamId }), 'teamFull');
    await problem(invites.request({ userId: 'ti-p5', eventId: e.id, teamId }), 'notRegistered');
  });
});

describe('searching players', () => {
  it('finds by name or email, leaving out people in a team and other schools', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const { id: teamId } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Finders',
    });
    const found = await invites.search({ eventId: e.id, userId: NAMES[0]!, q: 'ti-p', teamId });
    const ids = found.map((p) => p.userId);
    expect(ids).not.toContain(NAMES[0]);
    expect(ids).toContain(NAMES[1]);
    expect(ids).not.toContain('ti-other');
    await invites.invite({ userId: NAMES[0]!, eventId: e.id, teamId, targetUserId: NAMES[1]! });
    const again = await invites.search({
      eventId: e.id,
      userId: NAMES[0]!,
      q: 'Player ti-p2',
      teamId,
    });
    expect(again[0]).toMatchObject({ userId: NAMES[1], invited: true, email: 'ti-p2@epitech.eu' });
  });
});
