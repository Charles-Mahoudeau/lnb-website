import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventRoom,
  eventTeam,
  eventTeamMember,
  eventType,
  user,
} from '~~/server/db/schema';
import { eventTeamService } from '~~/server/services/events/teams';

// The services refuse with Nuxt's createError, which a plain Node test can't load.
vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NAMES = Array.from({ length: 12 }, (_, i) => `tt-p${String(i + 1)}`);
let roomId: string;
let typeId: string;

beforeAll(async () => {
  await db
    .insert(user)
    .values(NAMES.map((id) => ({ id, name: id, email: `${id}@epitech.eu`, tenantId: EPITECH })))
    .onConflictDoNothing();
  const [room] = await db.insert(eventRoom).values({ name: 'Team service room' }).returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Team service', nameFr: 'Service équipes', icon: 'i-lucide-trophy' })
    .returning();
  roomId = room!.id;
  typeId = type!.id;
});

async function newEvent(patch: Partial<typeof event.$inferInsert> = {}) {
  const [row] = await db
    .insert(event)
    .values({
      name: 'Rocket League 3v3',
      description: 'Teams of three.',
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      endsAt: new Date(Date.now() + 8 * 86_400_000),
      capacity: 2,
      teamMode: true,
      teamMin: 2,
      teamMax: 3,
      hidden: false,
      ...patch,
    })
    .returning();
  return row!;
}

async function register(eventId: string, ...userIds: string[]) {
  const rows = await db
    .insert(eventRegistration)
    .values(userIds.map((userId) => ({ eventId, userId, status: 'registered' as const })))
    .returning();
  return rows;
}

/** A player joins a team directly, as an accepted invitation will. */
async function join(teamId: string, eventId: string, userId: string) {
  const [reg] = await db
    .select()
    .from(eventRegistration)
    .where(and(eq(eventRegistration.eventId, eventId), eq(eventRegistration.userId, userId)));
  await db.insert(eventTeamMember).values({ teamId, registrationId: reg!.id });
}

async function settle(eventId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(event).where(eq(event.id, eventId)).for('update');
    return eventTeamService.settle(tx, row!);
  });
}

const teamOf = async (id: string) =>
  (await db.select().from(eventTeam).where(eq(eventTeam.id, id)))[0];
const problem = (promise: Promise<unknown>, expected: string) =>
  expect(promise).rejects.toMatchObject({ data: { problem: expected } });

describe('creating and leaving', () => {
  it('creates a team with the caller as captain, incomplete', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!);
    const { id } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: '  Night   Owls ',
    });
    expect(await teamOf(id)).toMatchObject({
      name: 'Night Owls',
      captainUserId: NAMES[0],
      status: 'incomplete',
      validatedAt: null,
    });
  });

  it('refuses unregistered players, a second team, a taken name and a bad name', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!);
    await problem(
      eventTeamService.create({ userId: NAMES[5]!, eventId: e.id, name: 'Ghosts' }),
      'notRegistered',
    );
    await eventTeamService.create({ userId: NAMES[0]!, eventId: e.id, name: 'Les Éclairs' });
    await problem(
      eventTeamService.create({ userId: NAMES[0]!, eventId: e.id, name: 'Another' }),
      'alreadyInTeam',
    );
    await problem(
      eventTeamService.create({ userId: NAMES[1]!, eventId: e.id, name: 'les ECLAIRS' }),
      'teamNameTaken',
    );
    await problem(
      eventTeamService.create({ userId: NAMES[1]!, eventId: e.id, name: 'ab' }),
      'invalidTeamName',
    );
  });

  it('refuses when the event has no teams, is cancelled, or the roster is locked', async () => {
    const plain = await newEvent({ teamMode: false, teamMin: null, teamMax: null });
    await register(plain.id, NAMES[0]!);
    await problem(
      eventTeamService.create({ userId: NAMES[0]!, eventId: plain.id, name: 'Nope' }),
      'notTeamEvent',
    );
    const closed = await newEvent({ registrationClosesAt: new Date(Date.now() - 1000) });
    await register(closed.id, NAMES[0]!);
    await problem(
      eventTeamService.create({ userId: NAMES[0]!, eventId: closed.id, name: 'Late' }),
      'rosterLocked',
    );
    const cancelled = await newEvent({ cancelledAt: new Date() });
    await register(cancelled.id, NAMES[0]!);
    await problem(
      eventTeamService.create({ userId: NAMES[0]!, eventId: cancelled.id, name: 'Gone' }),
      'cancelled',
    );
  });

  it('hands the captain role to whoever joined first, and ends an empty team', async () => {
    const e = await newEvent({ capacity: null });
    await register(e.id, NAMES[0]!, NAMES[1]!, NAMES[2]!);
    const { id } = await eventTeamService.create({
      userId: NAMES[0]!,
      eventId: e.id,
      name: 'Trio',
    });
    await join(id, e.id, NAMES[1]!);
    await join(id, e.id, NAMES[2]!);
    await eventTeamService.leave({ userId: NAMES[0]!, eventId: e.id, teamId: id });
    expect((await teamOf(id))!.captainUserId).toBe(NAMES[1]);
    await eventTeamService.leave({ userId: NAMES[1]!, eventId: e.id, teamId: id });
    await eventTeamService.leave({ userId: NAMES[2]!, eventId: e.id, teamId: id });
    expect(await teamOf(id)).toBeUndefined();
  });

  it('lets only the captain rename, remove, hand over and disband', async () => {
    const e = await newEvent({ capacity: null });
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const { id } = await eventTeamService.create({ userId: NAMES[0]!, eventId: e.id, name: 'Duo' });
    await join(id, e.id, NAMES[1]!);
    await problem(
      eventTeamService.update({
        userId: NAMES[1]!,
        eventId: e.id,
        teamId: id,
        body: { name: 'Hijack' },
      }),
      'notCaptain',
    );
    await eventTeamService.update({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId: id,
      body: { name: 'Duo Plus', acceptsRequests: false },
    });
    expect(await teamOf(id)).toMatchObject({ name: 'Duo Plus', acceptsRequests: false });
    await eventTeamService.transferCaptain({
      userId: NAMES[0]!,
      eventId: e.id,
      teamId: id,
      targetUserId: NAMES[1]!,
    });
    await problem(
      eventTeamService.kick({
        userId: NAMES[0]!,
        eventId: e.id,
        teamId: id,
        targetUserId: NAMES[1]!,
      }),
      'notCaptain',
    );
    await eventTeamService.kick({
      userId: NAMES[1]!,
      eventId: e.id,
      teamId: id,
      targetUserId: NAMES[0]!,
    });
    await eventTeamService.disband({ userId: NAMES[1]!, eventId: e.id, teamId: id });
    expect(await teamOf(id)).toBeUndefined();
    // Both are still registered, and looking for a team.
    const view = await eventTeamService.view({
      eventId: e.id,
      userId: NAMES[0]!,
      canSeeDrafts: false,
    });
    expect(view.looking.count).toBe(2);
  });
});

describe('places and the waitlist', () => {
  /** A team of the size, made by a manager-like direct insert, then settled. */
  async function team(eventId: string, name: string, players: string[]) {
    const [t] = await db
      .insert(eventTeam)
      .values({ eventId, name, nameKey: name.toLowerCase(), captainUserId: players[0] })
      .returning();
    for (const p of players) await join(t!.id, eventId, p);
    return t!.id;
  }

  it('validates teams in order, then waitlists, then promotes when a place frees up', async () => {
    const e = await newEvent(); // 2 places, teams of 2 to 3
    await register(e.id, ...NAMES.slice(0, 8));
    const a = await team(e.id, 'Alpha', NAMES.slice(0, 2));
    await settle(e.id);
    const b = await team(e.id, 'Bravo', NAMES.slice(2, 4));
    await settle(e.id);
    const c = await team(e.id, 'Charlie', NAMES.slice(4, 6));
    const d = await team(e.id, 'Delta', NAMES.slice(6, 7));
    const result = await settle(e.id);
    expect((await teamOf(a))!.status).toBe('registered');
    expect((await teamOf(b))!.status).toBe('registered');
    expect((await teamOf(c))!.status).toBe('waitlist');
    expect((await teamOf(d))!.status).toBe('incomplete');
    expect(result.validated).toEqual([{ teamId: c, status: 'waitlist' }]);

    // A joins Delta's missing player: Delta becomes valid and waits behind Charlie.
    await join(d, e.id, NAMES[7]!);
    await settle(e.id);
    expect((await teamOf(d))!.status).toBe('waitlist');

    // Alpha loses a player: it drops out, and Charlie (first in line) takes the place.
    await db.delete(eventRegistration).where(eq(eventRegistration.userId, NAMES[1]!));
    const after = await settle(e.id);
    const alpha = await teamOf(a);
    expect(alpha).toMatchObject({ status: 'incomplete', validatedAt: null });
    expect((await teamOf(c))!.status).toBe('registered');
    expect((await teamOf(d))!.status).toBe('waitlist');
    expect(after.promoted).toEqual([c]);
  });

  it('removes a team whose players all cancelled, and replaces a captain who did', async () => {
    const e = await newEvent({ capacity: null });
    await register(e.id, NAMES[0]!, NAMES[1]!, NAMES[2]!);
    const t = await team(e.id, 'Solo', [NAMES[0]!, NAMES[1]!]);
    const u = await team(e.id, 'Lonely', [NAMES[2]!]);
    await db.delete(eventRegistration).where(eq(eventRegistration.userId, NAMES[0]!));
    await db.delete(eventRegistration).where(eq(eventRegistration.userId, NAMES[2]!));
    await settle(e.id);
    expect((await teamOf(t))!.captainUserId).toBe(NAMES[1]);
    expect(await teamOf(u)).toBeUndefined();
  });

  it('keeps a team a manager validated by hand, until it is valid on its own', async () => {
    const e = await newEvent({ capacity: null });
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const t = await team(e.id, 'Short', [NAMES[0]!]);
    await db.update(eventTeam).set({ forced: true }).where(eq(eventTeam.id, t));
    await settle(e.id);
    expect(await teamOf(t)).toMatchObject({ status: 'registered', forced: true });
    await join(t, e.id, NAMES[1]!);
    await settle(e.id);
    expect(await teamOf(t)).toMatchObject({ status: 'registered', forced: false });
  });

  it('recomputes when the event asks for other team sizes', async () => {
    const e = await newEvent({ capacity: null });
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const t = await team(e.id, 'Pair', [NAMES[0]!, NAMES[1]!]);
    await settle(e.id);
    expect((await teamOf(t))!.status).toBe('registered');
    await db.update(event).set({ teamMin: 3, teamMax: 3 }).where(eq(event.id, e.id));
    await settle(e.id);
    expect((await teamOf(t))!.status).toBe('incomplete');
  });
});

describe('what the page shows', () => {
  it('hides names from visitors, and hidden players from the list', async () => {
    const e = await newEvent({ capacity: null });
    await register(e.id, NAMES[0]!, NAMES[1]!, NAMES[2]!);
    await eventTeamService.create({ userId: NAMES[0]!, eventId: e.id, name: 'Visible' });
    await eventTeamService.setLookingHidden({ userId: NAMES[2]!, eventId: e.id, hidden: true });

    const visitor = await eventTeamService.view({
      eventId: e.id,
      userId: null,
      canSeeDrafts: false,
    });
    expect(visitor.teams[0]).toMatchObject({ name: 'Visible', players: 1, members: null });
    expect(visitor.looking).toEqual({ count: 1, players: null });
    expect(visitor.me).toBeNull();

    const member = await eventTeamService.view({
      eventId: e.id,
      userId: NAMES[0]!,
      canSeeDrafts: false,
    });
    expect(member.teams[0]).toMatchObject({ mine: true, captain: true });
    expect(member.teams[0]!.members![0]).toMatchObject({ userId: NAMES[0], captain: true });
    expect(member.looking.players!.map((p) => p.userId)).toEqual([NAMES[1]]);
    expect(member.me).toMatchObject({ registered: true, lookingHidden: false });
  });

  it('refuses a draft to everyone but managers', async () => {
    const e = await newEvent({ hidden: true });
    await problem(
      eventTeamService.view({ eventId: e.id, userId: null, canSeeDrafts: false }),
      'notFound',
    );
    await eventTeamService.view({ eventId: e.id, userId: null, canSeeDrafts: true });
  });
});
