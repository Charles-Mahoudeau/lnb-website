import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

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

import { teamNameKey } from '#shared/utils/event-teams';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const MANAGER = 'teams-manager';
const PLAYERS = ['teams-p1', 'teams-p2', 'teams-p3'];
let roomId: string;
let typeId: string;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32);
  process.env.BETTER_AUTH_URL = 'https://lnb.example.com';
  process.env.MICROSOFT_CLIENT_ID ??= 'id';
  process.env.MICROSOFT_CLIENT_SECRET ??= 'secret';
  process.env.AUTH_ALLOWED_TENANTS ??= EPITECH;
  await db
    .insert(user)
    .values(
      [MANAGER, ...PLAYERS].map((id) => ({
        id,
        name: id,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
    )
    .onConflictDoNothing();
  const [room] = await db.insert(eventRoom).values({ name: 'Teams room' }).returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Teams tournament', nameFr: 'Tournoi équipes', icon: 'i-lucide-trophy' })
    .returning();
  roomId = room!.id;
  typeId = type!.id;
});

async function newEvent(patch: Partial<typeof event.$inferInsert> = {}) {
  const [row] = await db
    .insert(event)
    .values({
      name: 'Rocket League 3v3',
      description: 'Teams of three, best of three.',
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: new Date('2026-12-18T18:00:00Z'),
      endsAt: new Date('2026-12-18T22:00:00Z'),
      capacity: 4,
      teamMode: true,
      teamMin: 3,
      teamMax: 4,
      hidden: false,
      ...patch,
    })
    .returning({ id: event.id });
  return row!.id;
}

describe('team events', () => {
  it('stores the team size, and nothing for an event without teams', async () => {
    const id = await newEvent();
    const plain = await newEvent({ teamMode: false, teamMin: null, teamMax: null });
    const [teams] = await db.select().from(event).where(eq(event.id, id));
    const [none] = await db.select().from(event).where(eq(event.id, plain));
    expect(teams).toMatchObject({ teamMode: true, teamMin: 3, teamMax: 4 });
    expect(none).toMatchObject({ teamMode: false, teamMin: null, teamMax: null });
  });

  it('refuses a team size the database does not allow', async () => {
    const id = await newEvent();
    await expect(db.update(event).set({ teamMin: 1 }).where(eq(event.id, id))).rejects.toThrow();
    await expect(
      db.update(event).set({ teamMin: 5, teamMax: 4 }).where(eq(event.id, id)),
    ).rejects.toThrow();
    await expect(db.update(event).set({ teamMax: 33 }).where(eq(event.id, id))).rejects.toThrow();
    await expect(
      db.update(event).set({ teamMode: false }).where(eq(event.id, id)),
    ).rejects.toThrow();
  });
});

describe('team tables', () => {
  async function setup() {
    const id = await newEvent();
    const registrations = await db
      .insert(eventRegistration)
      .values(PLAYERS.map((userId) => ({ eventId: id, userId, status: 'registered' as const })))
      .returning();
    const [one] = await db
      .insert(eventTeam)
      .values({ eventId: id, name: 'Night Owls', nameKey: teamNameKey('Night Owls') })
      .returning();
    const [two] = await db
      .insert(eventTeam)
      .values({ eventId: id, name: 'Rocketeers', nameKey: teamNameKey('Rocketeers') })
      .returning();
    return { id, registrations, one: one!, two: two! };
  }

  it('keeps a team name unique within an event, ignoring case and accents', async () => {
    const { id } = await setup();
    await expect(
      db
        .insert(eventTeam)
        .values({ eventId: id, name: 'NIGHT  owls', nameKey: teamNameKey('NIGHT  owls') }),
    ).rejects.toThrow();
    const other = await newEvent();
    await db
      .insert(eventTeam)
      .values({ eventId: other, name: 'Night Owls', nameKey: teamNameKey('Night Owls') });
  });

  it('lets a manager put one player in two teams, but not twice in one', async () => {
    const { registrations, one, two } = await setup();
    const reg = registrations[0]!.id;
    await db.insert(eventTeamMember).values([
      { teamId: one.id, registrationId: reg },
      { teamId: two.id, registrationId: reg },
    ]);
    await expect(
      db.insert(eventTeamMember).values({ teamId: one.id, registrationId: reg }),
    ).rejects.toThrow();
  });

  it('removes a player from their teams when their registration goes', async () => {
    const { id, registrations, one } = await setup();
    const reg = registrations[0]!;
    await db.insert(eventTeamMember).values({ teamId: one.id, registrationId: reg.id });
    await db
      .delete(eventRegistration)
      .where(and(eq(eventRegistration.eventId, id), eq(eventRegistration.userId, reg.userId)));
    expect(
      await db.select().from(eventTeamMember).where(eq(eventTeamMember.teamId, one.id)),
    ).toHaveLength(0);
  });

  it('allows one pending invitation per team and player', async () => {
    const { one } = await setup();
    const row = { teamId: one.id, userId: PLAYERS[1]!, kind: 'invite' as const };
    await db.insert(eventTeamInvite).values(row);
    await expect(db.insert(eventTeamInvite).values({ ...row, kind: 'request' })).rejects.toThrow();
    await db
      .update(eventTeamInvite)
      .set({ status: 'declined', resolvedAt: new Date() })
      .where(eq(eventTeamInvite.teamId, one.id));
    await db.insert(eventTeamInvite).values(row);
  });

  it('ties a waiting or placed team to its validation date', async () => {
    const { one } = await setup();
    await expect(
      db.update(eventTeam).set({ status: 'registered' }).where(eq(eventTeam.id, one.id)),
    ).rejects.toThrow();
    await db
      .update(eventTeam)
      .set({ status: 'waitlist', validatedAt: new Date() })
      .where(eq(eventTeam.id, one.id));
  });
});
