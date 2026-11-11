import { and, asc, eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventTeam,
  eventTeamInvite,
  eventTeamMember,
  user,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { lockEvent, refuse } from './shared';
import { checkName, eventTeamService, membershipOf, registrationOf } from './teams';

import type { AdminTeamPatchBody, AdminTeamsView } from '#shared/schemas/event-teams';
import { schoolForTenant } from '#shared/utils/schools';

// What events managers do to teams: create, rename, delete, validate by hand, move players.
// A manager can bypass the player rules (the window, the start, the maximum, the minimum, one
// team per player), but a player still needs an account and a registration. Nobody is notified
// of these changes, except through the usual places notifications when a team becomes valid. Each
// change is logged in `admin_audit`.

type Actor = { actorId: string };

async function teamEventOf(tx: Tx, eventId: string) {
  const row = await lockEvent(tx, eventId);
  if (!row.teamMode) refuse(409, 'notTeamEvent');
  if (row.cancelledAt) refuse(409, 'cancelled');
  return row;
}

async function teamOf(tx: Tx, eventId: string, teamId: string) {
  const [team] = await tx
    .select()
    .from(eventTeam)
    .where(and(eq(eventTeam.id, teamId), eq(eventTeam.eventId, eventId)));
  if (!team) refuse(404, 'teamNotFound');
  return team;
}

async function playerName(tx: Tx, userId: string): Promise<string | null> {
  const [row] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
  return row?.name ?? null;
}

/** Everything the Teams tab shows: teams with players and emails, and who has no team. */
async function view(eventId: string): Promise<AdminTeamsView> {
  const [row] = await db.select().from(event).where(eq(event.id, eventId));
  if (!row) refuse(404, 'notFound');
  if (!row.teamMode || row.teamMin === null || row.teamMax === null) refuse(409, 'notTeamEvent');

  const teams = await db
    .select()
    .from(eventTeam)
    .where(eq(eventTeam.eventId, eventId))
    .orderBy(asc(eventTeam.createdAt));
  const members = await db
    .select({
      teamId: eventTeamMember.teamId,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(eventTeamMember)
    .innerJoin(eventRegistration, eq(eventRegistration.id, eventTeamMember.registrationId))
    .innerJoin(user, eq(user.id, eventRegistration.userId))
    .where(eq(eventRegistration.eventId, eventId))
    .orderBy(asc(eventTeamMember.id));
  const inTeams = Map.groupBy(members, (m) => m.userId);
  const byTeam = Map.groupBy(members, (m) => m.teamId);
  const pending = await db
    .select({ teamId: eventTeamInvite.teamId })
    .from(eventTeamInvite)
    .innerJoin(eventTeam, eq(eventTeam.id, eventTeamInvite.teamId))
    .where(and(eq(eventTeam.eventId, eventId), eq(eventTeamInvite.status, 'pending')));
  const invitesBy = Map.groupBy(pending, (p) => p.teamId);

  const rank = { registered: 0, waitlist: 1, incomplete: 2 } as const;
  const sorted = [...teams].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.validatedAt?.getTime() ?? a.createdAt.getTime()) -
        (b.validatedAt?.getTime() ?? b.createdAt.getTime()),
  );
  let position = 0;
  const teamViews = sorted.map((team) => ({
    id: team.id,
    name: team.name,
    status: team.status,
    position: team.status === 'waitlist' ? ++position : null,
    forced: team.forced,
    captainUserId: team.captainUserId,
    pendingInvites: invitesBy.get(team.id)?.length ?? 0,
    members: (byTeam.get(team.id) ?? []).map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      image: m.image,
      school: schoolForTenant(m.tenantId) ?? null,
      captain: m.userId === team.captainUserId,
      otherTeams: (inTeams.get(m.userId)?.length ?? 1) - 1,
    })),
  }));

  const registrations = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
      lookingHidden: eventRegistration.lookingHidden,
    })
    .from(eventRegistration)
    .innerJoin(user, eq(user.id, eventRegistration.userId))
    .where(eq(eventRegistration.eventId, eventId))
    .orderBy(asc(eventRegistration.id));
  const without = registrations
    .filter((p) => !inTeams.has(p.userId))
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      email: p.email,
      image: p.image,
      school: schoolForTenant(p.tenantId) ?? null,
      lookingHidden: p.lookingHidden,
    }));

  const of = (status: 'registered' | 'waitlist' | 'incomplete') =>
    teams.filter((t) => t.status === status).length;
  return {
    min: row.teamMin,
    max: row.teamMax,
    capacity: row.capacity,
    counts: {
      registered: of('registered'),
      waitlist: of('waitlist'),
      incomplete: of('incomplete'),
      without: without.length,
    },
    teams: teamViews,
    without,
  };
}

/** Creates a team by hand around a registered player, who is its captain unless told not. */
async function create(
  input: Actor & { eventId: string; name: string; userId: string; captain: boolean },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const row = await teamEventOf(tx, input.eventId);
    const { name, key } = await checkName(tx, row.id, input.name);
    const reg = await registrationOf(tx, row.id, input.userId);
    if (!reg) refuse(409, 'notRegistered');
    if ((await membershipOf(tx, row.id, input.userId)).length > 0) refuse(409, 'alreadyInTeam');
    const [team] = await tx
      .insert(eventTeam)
      .values({
        eventId: row.id,
        name,
        nameKey: key,
        captainUserId: input.captain ? input.userId : null,
      })
      .returning({ id: eventTeam.id });
    await tx.insert(eventTeamMember).values({ teamId: team!.id, registrationId: reg.id });
    await eventTeamService.settle(tx, row);
    await adminAuditService.record(tx, {
      action: 'eventTeam.create',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { eventId: row.id, name: row.name, team: name },
    });
    return { id: team!.id };
  });
}

/** Renames a team, validates it by hand (or stops), or changes its captain. */
async function update(
  input: Actor & { eventId: string; teamId: string; body: AdminTeamPatchBody },
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await teamEventOf(tx, input.eventId);
    const team = await teamOf(tx, row.id, input.teamId);
    const set: Partial<typeof eventTeam.$inferInsert> = {};
    const { body } = input;
    if (body.name !== undefined) {
      const checked = await checkName(tx, row.id, body.name, team.id);
      set.name = checked.name;
      set.nameKey = checked.key;
    }
    if (body.forced !== undefined) set.forced = body.forced;
    if (body.captainUserId !== undefined) {
      if (body.captainUserId !== null) {
        const mine = (await membershipOf(tx, row.id, body.captainUserId)).find(
          (m) => m.teamId === team.id,
        );
        if (!mine) refuse(404, 'notInTeam');
      }
      set.captainUserId = body.captainUserId;
    }
    await tx.update(eventTeam).set(set).where(eq(eventTeam.id, team.id));
    await eventTeamService.settle(tx, row);
    const audit = (action: 'eventTeam.rename' | 'eventTeam.force' | 'eventTeam.captain') =>
      adminAuditService.record(tx, {
        action,
        actorUserId: input.actorId,
        targetUserId: body.captainUserId ?? null,
        data: { eventId: row.id, name: row.name, team: set.name ?? team.name, forced: set.forced },
      });
    if (body.name !== undefined) await audit('eventTeam.rename');
    if (body.forced !== undefined) await audit('eventTeam.force');
    if (body.captainUserId !== undefined) await audit('eventTeam.captain');
  });
}

/** Deletes a team: its players stay registered, in no team. */
async function remove(input: Actor & { eventId: string; teamId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockEvent(tx, input.eventId);
    const team = await teamOf(tx, row.id, input.teamId);
    await tx.delete(eventTeam).where(eq(eventTeam.id, team.id));
    await eventTeamService.settle(tx, row);
    await adminAuditService.record(tx, {
      action: 'eventTeam.delete',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: row.id, name: row.name, team: team.name },
    });
  });
}

/**
 * Puts a registered player in a team, past the window and the start. A full team or a player
 * already in another team needs `force`: that makes a double membership, which counts for both
 * teams.
 */
async function addMember(
  input: Actor & { eventId: string; teamId: string; userId: string; force: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await teamEventOf(tx, input.eventId);
    const team = await teamOf(tx, row.id, input.teamId);
    const reg = await registrationOf(tx, row.id, input.userId);
    if (!reg) refuse(409, 'notRegistered');
    const memberships = await membershipOf(tx, row.id, input.userId);
    if (memberships.some((m) => m.teamId === team.id)) refuse(409, 'alreadyInTeam');
    const players = (
      await tx.select().from(eventTeamMember).where(eq(eventTeamMember.teamId, team.id))
    ).length;
    if (players >= row.teamMax! && !input.force) refuse(409, 'teamFull');
    if (memberships.length > 0 && !input.force) refuse(409, 'alreadyInTeam');
    await tx.insert(eventTeamMember).values({ teamId: team.id, registrationId: reg.id });
    if (!team.captainUserId) {
      await tx
        .update(eventTeam)
        .set({ captainUserId: input.userId })
        .where(eq(eventTeam.id, team.id));
    }
    await eventTeamService.settle(tx, row);
    await adminAuditService.record(tx, {
      action: 'eventTeam.memberAdd',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: {
        eventId: row.id,
        name: row.name,
        team: team.name,
        full: players >= row.teamMax!,
        double: memberships.length > 0,
      },
    });
  });
}

/** Takes a player out of a team. They stay registered. */
async function removeMember(
  input: Actor & { eventId: string; teamId: string; userId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockEvent(tx, input.eventId);
    const team = await teamOf(tx, row.id, input.teamId);
    const mine = (await membershipOf(tx, row.id, input.userId)).find((m) => m.teamId === team.id);
    if (!mine) refuse(404, 'notInTeam');
    await tx.delete(eventTeamMember).where(eq(eventTeamMember.id, mine.id));
    await eventTeamService.settle(tx, row);
    await adminAuditService.record(tx, {
      action: 'eventTeam.memberRemove',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: {
        eventId: row.id,
        name: row.name,
        team: team.name,
        player: await playerName(tx, input.userId),
      },
    });
  });
}

export const adminTeamService = { view, create, update, remove, addMember, removeMember };
