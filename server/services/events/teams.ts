import { and, asc, eq, inArray, sql } from 'drizzle-orm';

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

import { lockEvent, refuse } from './shared';
import { isRosterLocked, nextCaptain, placeForNewTeam, teamsToPromote } from './team-rules';

import type {
  EventTeamPatchBody,
  EventTeamsView,
  EventTeamView,
} from '#shared/schemas/event-teams';
import { cleanTeamName, isValidTeamName, teamNameKey, teamSize } from '#shared/utils/event-teams';
import { schoolForTenant } from '#shared/utils/schools';

// Teams in tournaments. Players register to the event as usual, then create a team or join one.
// Every change locks the event row first, then `settle` recomputes what follows from the
// roster: empty teams go, a captain who left is replaced, teams that became valid take a place or
// wait, and waiting teams move up. See docs/tournaments.md.

type EventRow = typeof event.$inferSelect;

/** What a settle changed, for the notifications that follow. */
export interface SettleResult {
  /** Teams that were waiting and now hold a place. */
  promoted: string[];
  /** Teams that just became valid, with where they landed. */
  validated: { teamId: string; status: 'registered' | 'waitlist' }[];
}

/**
 * Recomputes every team of an event from its roster. The caller holds the event lock. Idempotent:
 * run it after any change to teams, registrations or the event's limits. Nothing happens for an
 * event without teams or a cancelled one.
 */
async function settle(tx: Tx, row: EventRow, now = new Date()): Promise<SettleResult> {
  const result: SettleResult = { promoted: [], validated: [] };
  if (!row.teamMode || row.cancelledAt || row.teamMin === null || row.teamMax === null) {
    return result;
  }
  const teams = await tx
    .select()
    .from(eventTeam)
    .where(eq(eventTeam.eventId, row.id))
    .orderBy(asc(eventTeam.createdAt), asc(eventTeam.id));
  const memberRows = await tx
    .select({
      id: eventTeamMember.id,
      teamId: eventTeamMember.teamId,
      userId: eventRegistration.userId,
      joinedAt: eventTeamMember.createdAt,
    })
    .from(eventTeamMember)
    .innerJoin(eventRegistration, eq(eventRegistration.id, eventTeamMember.registrationId))
    .where(eq(eventRegistration.eventId, row.id));
  const byTeam = Map.groupBy(memberRows, (member) => member.teamId);

  // Empty teams go, and a captain who is no longer a member is replaced.
  const alive = [];
  for (const team of teams) {
    const members = byTeam.get(team.id) ?? [];
    if (members.length === 0) {
      await tx.delete(eventTeam).where(eq(eventTeam.id, team.id));
      continue;
    }
    let captain = team.captainUserId;
    if (captain && !members.some((m) => m.userId === captain)) {
      captain = nextCaptain(members, captain);
    }
    alive.push({ team, players: members.length, captain });
  }

  // Which teams are valid: by size, or by a manager's hand. A forced team that is valid on its
  // own stops being forced, so it can lose its place again if it later shrinks.
  const next = alive.map(({ team, players, captain }) => {
    const natural = teamSize(players, row.teamMin!, row.teamMax!) === 'valid';
    const valid = natural || (team.forced && players > 0);
    return { team, captain, valid, forced: natural ? false : team.forced };
  });
  const status = new Map(next.map((t) => [t.team.id, t.valid ? t.team.status : 'incomplete']));
  const validatedAt = new Map(
    next.map((t) => [t.team.id, t.valid ? t.team.validatedAt : (null as Date | null)]),
  );

  const holding = () => next.filter((t) => status.get(t.team.id) === 'registered').length;
  // Waiting teams move up first, in order, so a team that just became valid never jumps them.
  const waiting = next
    .filter((t) => t.valid && status.get(t.team.id) === 'waitlist')
    .sort((a, b) => a.team.validatedAt!.getTime() - b.team.validatedAt!.getTime());
  const up = teamsToPromote(
    {
      startsAt: row.startsAt,
      capacity: row.capacity,
      registeredTeams: holding(),
      waitingTeams: waiting.length,
    },
    now,
  );
  for (const t of waiting.slice(0, up)) {
    status.set(t.team.id, 'registered');
    result.promoted.push(t.team.id);
  }
  // Then the teams that just became valid take a free place, or wait.
  for (const t of next.filter((x) => x.valid && x.team.status === 'incomplete')) {
    const placed = placeForNewTeam(row.capacity, holding());
    status.set(t.team.id, placed);
    validatedAt.set(t.team.id, now);
    result.validated.push({ teamId: t.team.id, status: placed });
  }

  for (const t of next) {
    const to = status.get(t.team.id)!;
    const at = validatedAt.get(t.team.id) ?? null;
    if (
      to !== t.team.status ||
      at?.getTime() !== t.team.validatedAt?.getTime() ||
      t.forced !== t.team.forced ||
      t.captain !== t.team.captainUserId
    ) {
      await tx
        .update(eventTeam)
        .set({ status: to, validatedAt: at, forced: t.forced, captainUserId: t.captain })
        .where(eq(eventTeam.id, t.team.id));
    }
  }
  return result;
}

/** The team's captain's members, as the service needs them: the membership of one player. */
async function membershipOf(tx: Tx, eventId: string, userId: string) {
  return tx
    .select({
      id: eventTeamMember.id,
      teamId: eventTeamMember.teamId,
      registrationId: eventRegistration.id,
    })
    .from(eventTeamMember)
    .innerJoin(eventRegistration, eq(eventRegistration.id, eventTeamMember.registrationId))
    .where(and(eq(eventRegistration.eventId, eventId), eq(eventRegistration.userId, userId)));
}

async function registrationOf(tx: Tx, eventId: string, userId: string) {
  const [reg] = await tx
    .select({ id: eventRegistration.id, lookingHidden: eventRegistration.lookingHidden })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.eventId, eventId), eq(eventRegistration.userId, userId)));
  return reg ?? null;
}

/** A team event players can act on: published, with teams, not cancelled. */
async function teamEvent(tx: Tx, eventId: string): Promise<EventRow> {
  const row = await lockEvent(tx, eventId);
  if (row.hidden) refuse(404, 'notFound');
  if (!row.teamMode) refuse(409, 'notTeamEvent');
  if (row.cancelledAt) refuse(409, 'cancelled');
  return row;
}

/** Players can join, invite and create teams until the registration window closes. */
function assertRosterOpen(row: EventRow, now = new Date()): void {
  if (isRosterLocked(row, now)) refuse(409, 'rosterLocked');
}

/** Players can leave, rename and disband until the event starts. */
function assertNotStarted(row: EventRow, now = new Date()): void {
  if (now >= row.startsAt) refuse(409, 'started');
}

/** A tidied, valid name that no other team of the event has. */
async function checkName(tx: Tx, eventId: string, name: string, exceptTeamId?: string) {
  if (!isValidTeamName(name)) refuse(400, 'invalidTeamName');
  const clean = cleanTeamName(name);
  const key = teamNameKey(clean);
  const [taken] = await tx
    .select({ id: eventTeam.id })
    .from(eventTeam)
    .where(
      and(
        eq(eventTeam.eventId, eventId),
        eq(eventTeam.nameKey, key),
        exceptTeamId ? sql`${eventTeam.id} <> ${exceptTeamId}` : undefined,
      ),
    );
  if (taken) refuse(409, 'teamNameTaken');
  return { name: clean, key };
}

/** A player joining a team drops their other waiting invitations and requests for the event. */
async function cancelPendingFor(tx: Tx, eventId: string, userId: string): Promise<void> {
  const teamIds = tx
    .select({ id: eventTeam.id })
    .from(eventTeam)
    .where(eq(eventTeam.eventId, eventId));
  await tx
    .update(eventTeamInvite)
    .set({ status: 'cancelled', resolvedAt: new Date() })
    .where(
      and(
        eq(eventTeamInvite.userId, userId),
        eq(eventTeamInvite.status, 'pending'),
        inArray(eventTeamInvite.teamId, teamIds),
      ),
    );
}

async function captainTeam(tx: Tx, eventId: string, teamId: string, userId: string) {
  const [team] = await tx
    .select()
    .from(eventTeam)
    .where(and(eq(eventTeam.id, teamId), eq(eventTeam.eventId, eventId)));
  if (!team) refuse(404, 'teamNotFound');
  if (team.captainUserId !== userId) refuse(403, 'notCaptain');
  return team;
}

/** Creates a team with the caller as captain and only member. They must be registered. */
async function create(input: {
  userId: string;
  eventId: string;
  name: string;
}): Promise<{ id: string; settled: SettleResult }> {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertRosterOpen(row);
    const reg = await registrationOf(tx, row.id, input.userId);
    if (!reg) refuse(409, 'notRegistered');
    if ((await membershipOf(tx, row.id, input.userId)).length > 0) refuse(409, 'alreadyInTeam');
    const { name, key } = await checkName(tx, row.id, input.name);
    const [team] = await tx
      .insert(eventTeam)
      .values({ eventId: row.id, name, nameKey: key, captainUserId: input.userId })
      .returning({ id: eventTeam.id });
    await tx.insert(eventTeamMember).values({ teamId: team!.id, registrationId: reg.id });
    await cancelPendingFor(tx, row.id, input.userId);
    return { id: team!.id, settled: await settle(tx, row) };
  });
}

/** Renames the team or turns requests on or off. The captain only, until the event starts. */
async function update(input: {
  userId: string;
  eventId: string;
  teamId: string;
  body: EventTeamPatchBody;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertNotStarted(row);
    await captainTeam(tx, row.id, input.teamId, input.userId);
    const set: Partial<typeof eventTeam.$inferInsert> = {};
    if (input.body.name !== undefined) {
      const { name, key } = await checkName(tx, row.id, input.body.name, input.teamId);
      set.name = name;
      set.nameKey = key;
    }
    if (input.body.acceptsRequests !== undefined) set.acceptsRequests = input.body.acceptsRequests;
    await tx.update(eventTeam).set(set).where(eq(eventTeam.id, input.teamId));
  });
}

/** Leaves a team, until the event starts. The captain's role passes on; the last one out ends it. */
async function leave(input: { userId: string; eventId: string; teamId: string }) {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertNotStarted(row);
    const mine = (await membershipOf(tx, row.id, input.userId)).find(
      (m) => m.teamId === input.teamId,
    );
    if (!mine) refuse(404, 'notInTeam');
    await tx.delete(eventTeamMember).where(eq(eventTeamMember.id, mine.id));
    return settle(tx, row);
  });
}

/** Disbands a team: its players stay registered, and look for another one. */
async function disband(input: { userId: string; eventId: string; teamId: string }) {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertNotStarted(row);
    await captainTeam(tx, row.id, input.teamId, input.userId);
    await tx.delete(eventTeam).where(eq(eventTeam.id, input.teamId));
    return settle(tx, row);
  });
}

/** The captain removes a player from the team, until the event starts. */
async function kick(input: {
  userId: string;
  eventId: string;
  teamId: string;
  targetUserId: string;
}) {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertNotStarted(row);
    await captainTeam(tx, row.id, input.teamId, input.userId);
    if (input.targetUserId === input.userId) refuse(409, 'notCaptain');
    const target = (await membershipOf(tx, row.id, input.targetUserId)).find(
      (m) => m.teamId === input.teamId,
    );
    if (!target) refuse(404, 'notInTeam');
    await tx.delete(eventTeamMember).where(eq(eventTeamMember.id, target.id));
    return settle(tx, row);
  });
}

/** The captain hands the role to another member of the team. */
async function transferCaptain(input: {
  userId: string;
  eventId: string;
  teamId: string;
  targetUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertNotStarted(row);
    await captainTeam(tx, row.id, input.teamId, input.userId);
    const target = (await membershipOf(tx, row.id, input.targetUserId)).find(
      (m) => m.teamId === input.teamId,
    );
    if (!target) refuse(404, 'notInTeam');
    await tx
      .update(eventTeam)
      .set({ captainUserId: input.targetUserId })
      .where(eq(eventTeam.id, input.teamId));
  });
}

/** Shows or hides the caller in the public list of players looking for a team. */
async function setLookingHidden(input: {
  userId: string;
  eventId: string;
  hidden: boolean;
}): Promise<void> {
  const updated = await db
    .update(eventRegistration)
    .set({ lookingHidden: input.hidden })
    .where(
      and(eq(eventRegistration.eventId, input.eventId), eq(eventRegistration.userId, input.userId)),
    )
    .returning({ id: eventRegistration.id });
  if (updated.length === 0) refuse(409, 'notRegistered');
}

/** Everything the event page shows about teams. Names and avatars are for signed-in members. */
async function view(input: {
  eventId: string;
  userId: string | null;
  canSeeDrafts: boolean;
}): Promise<EventTeamsView> {
  const [row] = await db.select().from(event).where(eq(event.id, input.eventId));
  if (!row || (row.hidden && !input.canSeeDrafts)) refuse(404, 'notFound');
  if (!row.teamMode) refuse(409, 'notTeamEvent');
  const signedIn = input.userId !== null;

  const teams = await db.select().from(eventTeam).where(eq(eventTeam.eventId, row.id));
  const members = await db
    .select({
      id: eventTeamMember.id,
      teamId: eventTeamMember.teamId,
      userId: user.id,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(eventTeamMember)
    .innerJoin(eventRegistration, eq(eventRegistration.id, eventTeamMember.registrationId))
    .innerJoin(user, eq(user.id, eventRegistration.userId))
    .where(eq(eventRegistration.eventId, row.id))
    .orderBy(asc(eventTeamMember.id));
  const byTeam = Map.groupBy(members, (m) => m.teamId);

  const rank = { registered: 0, waitlist: 1, incomplete: 2 } as const;
  const sorted = teams.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.validatedAt?.getTime() ?? a.createdAt.getTime()) -
        (b.validatedAt?.getTime() ?? b.createdAt.getTime()),
  );
  let position = 0;
  const teamViews: EventTeamView[] = sorted.map((team) => {
    const ms = byTeam.get(team.id) ?? [];
    return {
      id: team.id,
      name: team.name,
      status: team.status,
      position: team.status === 'waitlist' ? ++position : null,
      players: ms.length,
      acceptsRequests: team.acceptsRequests,
      members: signedIn
        ? ms.map((m) => ({
            userId: m.userId,
            name: m.name,
            image: m.image,
            school: schoolForTenant(m.tenantId) ?? null,
            captain: m.userId === team.captainUserId,
          }))
        : null,
      mine: ms.some((m) => m.userId === input.userId),
      captain: team.captainUserId !== null && team.captainUserId === input.userId,
    };
  });

  const inTeam = new Set(members.map((m) => m.userId));
  const looking = await db
    .select({
      userId: user.id,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
      hidden: eventRegistration.lookingHidden,
    })
    .from(eventRegistration)
    .innerJoin(user, eq(user.id, eventRegistration.userId))
    .where(eq(eventRegistration.eventId, row.id))
    .orderBy(asc(eventRegistration.id));
  const visible = looking.filter((p) => !inTeam.has(p.userId) && !p.hidden);
  const mine = input.userId ? looking.find((p) => p.userId === input.userId) : undefined;

  return {
    teams: teamViews,
    looking: {
      count: visible.length,
      players: signedIn
        ? visible.map((p) => ({
            userId: p.userId,
            name: p.name,
            image: p.image,
            school: schoolForTenant(p.tenantId) ?? null,
          }))
        : null,
    },
    me: signedIn
      ? {
          registered: mine !== undefined,
          lookingHidden: mine?.hidden ?? false,
          teamIds: teamViews.filter((t) => t.mine).map((t) => t.id),
        }
      : null,
  };
}

export const eventTeamService = {
  settle,
  create,
  update,
  leave,
  disband,
  kick,
  transferCaptain,
  setLookingHidden,
  view,
};
