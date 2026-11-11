import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  adminAudit,
  event,
  eventRegistration,
  eventRoom,
  eventTeam,
  eventType,
  user,
} from '~~/server/db/schema';
import { adminTeamService as admin } from '~~/server/services/events/admin-teams';
import { eventRegistrationService } from '~~/server/services/events/registrations';

// The services refuse with Nuxt's createError, which a plain Node test can't load.
vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NAMES = Array.from({ length: 6 }, (_, i) => `ta-p${String(i + 1)}`);
const MANAGER = 'ta-manager';
let roomId: string;
let typeId: string;

beforeAll(async () => {
  await db
    .insert(user)
    .values(
      [...NAMES, MANAGER].map((id) => ({
        id,
        name: id,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
    )
    .onConflictDoNothing();
  const [room] = await db.insert(eventRoom).values({ name: 'Admin teams room' }).returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Admin teams', nameFr: 'Équipes admin', icon: 'i-lucide-trophy' })
    .returning();
  roomId = room!.id;
  typeId = type!.id;
});

async function newEvent(patch: Partial<typeof event.$inferInsert> = {}) {
  const [row] = await db
    .insert(event)
    .values({
      name: 'Admin night',
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
const actor = { actorId: MANAGER };
const problem = (promise: Promise<unknown>, expected: string) =>
  expect(promise).rejects.toMatchObject({ data: { problem: expected } });
const teamOf = async (id: string) =>
  (await db.select().from(eventTeam).where(eq(eventTeam.id, id)))[0];

describe('managing teams', () => {
  it('creates a captainless team, fills it, and validates it by size', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const { id } = await admin.create({
      ...actor,
      eventId: e.id,
      name: 'By hand',
      userId: NAMES[0]!,
      captain: false,
    });
    expect(await teamOf(id)).toMatchObject({ captainUserId: null, status: 'incomplete' });
    await admin.addMember({ ...actor, eventId: e.id, teamId: id, userId: NAMES[1]!, force: false });
    expect((await teamOf(id))!.status).toBe('registered');
    const view = await admin.view(e.id);
    expect(view.counts).toMatchObject({ registered: 1, incomplete: 0, without: 0 });
    expect(view.teams[0]!.members.map((m) => m.email)).toEqual([
      'ta-p1@epitech.eu',
      'ta-p2@epitech.eu',
    ]);
  });

  it('needs force for a full team or a second team, and a registration always', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!, NAMES[2]!);
    const a = (
      await admin.create({
        ...actor,
        eventId: e.id,
        name: 'Alpha',
        userId: NAMES[0]!,
        captain: true,
      })
    ).id;
    const b = (
      await admin.create({
        ...actor,
        eventId: e.id,
        name: 'Bravo',
        userId: NAMES[1]!,
        captain: true,
      })
    ).id;
    await admin.addMember({ ...actor, eventId: e.id, teamId: a, userId: NAMES[2]!, force: false });
    await problem(
      admin.addMember({ ...actor, eventId: e.id, teamId: a, userId: NAMES[1]!, force: false }),
      'teamFull',
    );
    await problem(
      admin.addMember({ ...actor, eventId: e.id, teamId: b, userId: NAMES[2]!, force: false }),
      'alreadyInTeam',
    );
    await admin.addMember({ ...actor, eventId: e.id, teamId: b, userId: NAMES[2]!, force: true });
    const view = await admin.view(e.id);
    const double = view.teams.flatMap((t) => t.members).filter((m) => m.userId === NAMES[2]);
    expect(double).toHaveLength(2);
    expect(double[0]!.otherTeams).toBe(1);
    await problem(
      admin.addMember({ ...actor, eventId: e.id, teamId: b, userId: NAMES[5]!, force: true }),
      'notRegistered',
    );
    // The CSV lists both teams of the double.
    const csv = await eventRegistrationService.csv(e.id);
    expect(csv).toContain('"Alpha; Bravo"');
  });

  it('forces a short team valid, and lets it go', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!);
    const { id } = await admin.create({
      ...actor,
      eventId: e.id,
      name: 'Short',
      userId: NAMES[0]!,
      captain: true,
    });
    await admin.update({ ...actor, eventId: e.id, teamId: id, body: { forced: true } });
    expect(await teamOf(id)).toMatchObject({ status: 'registered', forced: true });
    await admin.update({ ...actor, eventId: e.id, teamId: id, body: { forced: false } });
    expect((await teamOf(id))!.status).toBe('incomplete');
  });

  it('renames, hands the captain over, removes players and deletes, with an audit trail', async () => {
    const e = await newEvent();
    await register(e.id, NAMES[0]!, NAMES[1]!);
    const { id } = await admin.create({
      ...actor,
      eventId: e.id,
      name: 'Old name',
      userId: NAMES[0]!,
      captain: true,
    });
    await admin.addMember({ ...actor, eventId: e.id, teamId: id, userId: NAMES[1]!, force: false });
    await admin.update({ ...actor, eventId: e.id, teamId: id, body: { name: 'New name' } });
    await admin.update({ ...actor, eventId: e.id, teamId: id, body: { captainUserId: NAMES[1]! } });
    await problem(
      admin.update({ ...actor, eventId: e.id, teamId: id, body: { captainUserId: NAMES[5]! } }),
      'notInTeam',
    );
    expect(await teamOf(id)).toMatchObject({ name: 'New name', captainUserId: NAMES[1] });
    await admin.removeMember({ ...actor, eventId: e.id, teamId: id, userId: NAMES[0]! });
    await admin.remove({ ...actor, eventId: e.id, teamId: id });
    expect(await teamOf(id)).toBeUndefined();
    const view = await admin.view(e.id);
    expect(view.counts.without).toBe(2);
    const log = await db.select().from(adminAudit).where(eq(adminAudit.actorUserId, MANAGER));
    const actions = log
      .filter((l) => (l.data as { eventId?: string }).eventId === e.id)
      .map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'eventTeam.create',
        'eventTeam.memberAdd',
        'eventTeam.rename',
        'eventTeam.captain',
        'eventTeam.memberRemove',
        'eventTeam.delete',
      ]),
    );
  });

  it('refuses a plain event and a cancelled one', async () => {
    const plain = await newEvent({ teamMode: false, teamMin: null, teamMax: null });
    await problem(admin.view(plain.id), 'notTeamEvent');
    await problem(
      admin.create({ ...actor, eventId: plain.id, name: 'Nope', userId: NAMES[0]!, captain: true }),
      'notTeamEvent',
    );
    const cancelled = await newEvent({ cancelledAt: new Date() });
    await problem(
      admin.create({
        ...actor,
        eventId: cancelled.id,
        name: 'Gone',
        userId: NAMES[0]!,
        captain: true,
      }),
      'cancelled',
    );
  });
});
