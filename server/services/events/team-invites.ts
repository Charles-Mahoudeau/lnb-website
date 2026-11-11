import type { SQL } from 'drizzle-orm';
import { and, asc, count, eq, ilike, inArray, isNull, notInArray, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import {
  eventRegistration,
  eventTeam,
  eventTeamInvite,
  eventTeamMember,
  user,
} from '~~/server/db/schema';
import { pushQueueService } from '~~/server/services/push/queue';

import { registrationState } from './rules';
import { refuse } from './shared';
import { invitesLeft } from './team-rules';
import {
  assertRosterOpen,
  captainTeam,
  cancelPendingFor,
  eventTeamService,
  membershipOf,
  registrationOf,
  teamEvent,
} from './teams';
import type { SettleResult } from './teams';

import type { EventPlayerOption } from '#shared/schemas/event-teams';
import { MAX_PENDING_INVITES, MAX_PENDING_REQUESTS } from '#shared/utils/event-teams';
import { schoolForTenant } from '#shared/utils/schools';

// Invitations and requests to join a team. An invitation goes from the captain to a player, a
// request from a player to the captain; both live in `event_team_invite`, told apart by `kind`.
// Declines and cancellations are silent. See docs/tournaments.md.

type Reason = 'invited' | 'request' | 'accepted' | 'declined';

async function notify(
  tx: Tx,
  eventId: string,
  userId: string,
  reason: Reason,
  inviteId: number,
  names: { team: string; who?: string },
) {
  await pushQueueService.enqueue(tx, {
    kind: 'team',
    eventId,
    userIds: [userId],
    params: { reason, team: names.team, who: names.who ?? '' },
    dedupe: () => `team:${reason}:${String(inviteId)}`,
  });
}

async function playersIn(tx: Tx, teamId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(eventTeamMember)
    .where(eq(eventTeamMember.teamId, teamId));
  return row?.n ?? 0;
}

async function pendingCount(tx: Tx, where: SQL | undefined): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(eventTeamInvite).where(where);
  return row?.n ?? 0;
}

/** Players the captain can invite: signed in once, of an allowed school, in no team yet. */
async function search(input: {
  eventId: string;
  userId: string;
  q: string;
  teamId?: string;
}): Promise<EventPlayerOption[]> {
  const row = await db.transaction(async (tx) => teamEvent(tx, input.eventId));
  const pattern = `%${input.q.replace(/[\\%_]/g, '\\$&')}%`;
  const inTeam = db
    .select({ userId: eventRegistration.userId })
    .from(eventTeamMember)
    .innerJoin(eventRegistration, eq(eventRegistration.id, eventTeamMember.registrationId))
    .where(eq(eventRegistration.eventId, row.id));
  const found = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(user)
    .where(
      and(
        or(ilike(user.name, pattern), ilike(user.email, pattern)),
        inArray(user.tenantId, row.schools),
        notInArray(user.id, inTeam),
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
    .orderBy(asc(user.name))
    .limit(8);
  const invited = input.teamId
    ? new Set(
        (
          await db
            .select({ userId: eventTeamInvite.userId })
            .from(eventTeamInvite)
            .where(
              and(eq(eventTeamInvite.teamId, input.teamId), eq(eventTeamInvite.status, 'pending')),
            )
        ).map((r) => r.userId),
      )
    : new Set<string>();
  return found
    .filter((p) => p.id !== input.userId)
    .map((p) => ({
      userId: p.id,
      name: p.name,
      image: p.image,
      school: schoolForTenant(p.tenantId) ?? null,
      email: p.email,
      invited: invited.has(p.id),
    }));
}

/** The captain invites a player. Room counts the invitations still waiting. */
async function invite(input: {
  userId: string;
  eventId: string;
  teamId: string;
  targetUserId: string;
}): Promise<number> {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertRosterOpen(row);
    const team = await captainTeam(tx, row.id, input.teamId, input.userId);
    if (input.targetUserId === input.userId) refuse(409, 'alreadyInTeam');
    const [target] = await tx.select().from(user).where(eq(user.id, input.targetUserId));
    if (!target) refuse(404, 'userNotFound');
    if (!row.schools.includes(target.tenantId.toLowerCase())) refuse(409, 'wrongSchool');
    if ((await membershipOf(tx, row.id, target.id)).length > 0) refuse(409, 'alreadyInTeam');

    const pendingHere = await pendingCount(
      tx,
      and(
        eq(eventTeamInvite.teamId, team.id),
        eq(eventTeamInvite.status, 'pending'),
        eq(eventTeamInvite.kind, 'invite'),
      ),
    );
    if (
      invitesLeft({
        max: row.teamMax!,
        players: await playersIn(tx, team.id),
        pending: pendingHere,
      }) === 0
    )
      refuse(409, 'teamFull');
    const teamIds = tx
      .select({ id: eventTeam.id })
      .from(eventTeam)
      .where(eq(eventTeam.eventId, row.id));
    const received = await pendingCount(
      tx,
      and(
        eq(eventTeamInvite.userId, target.id),
        eq(eventTeamInvite.status, 'pending'),
        eq(eventTeamInvite.kind, 'invite'),
        inArray(eventTeamInvite.teamId, teamIds),
      ),
    );
    if (received >= MAX_PENDING_INVITES) refuse(409, 'tooManyInvites');
    const [dup] = await tx
      .select({ id: eventTeamInvite.id })
      .from(eventTeamInvite)
      .where(
        and(
          eq(eventTeamInvite.teamId, team.id),
          eq(eventTeamInvite.userId, target.id),
          eq(eventTeamInvite.status, 'pending'),
        ),
      );
    if (dup) refuse(409, 'alreadyInvited');

    const [created] = await tx
      .insert(eventTeamInvite)
      .values({ teamId: team.id, userId: target.id, kind: 'invite' })
      .returning({ id: eventTeamInvite.id });
    const [captain] = await tx
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, input.userId));
    await notify(tx, row.id, target.id, 'invited', created!.id, {
      team: team.name,
      who: captain?.name,
    });
    return created!.id;
  });
}

/** A registered player without a team asks the captain to be let in. */
async function request(input: {
  userId: string;
  eventId: string;
  teamId: string;
}): Promise<number> {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    assertRosterOpen(row);
    if (!(await registrationOf(tx, row.id, input.userId))) refuse(409, 'notRegistered');
    if ((await membershipOf(tx, row.id, input.userId)).length > 0) refuse(409, 'alreadyInTeam');
    const [team] = await tx
      .select()
      .from(eventTeam)
      .where(and(eq(eventTeam.id, input.teamId), eq(eventTeam.eventId, row.id)));
    if (!team) refuse(404, 'teamNotFound');
    if (!team.acceptsRequests || !team.captainUserId) refuse(409, 'requestsClosed');
    if ((await playersIn(tx, team.id)) >= row.teamMax!) refuse(409, 'teamFull');
    const teamIds = tx
      .select({ id: eventTeam.id })
      .from(eventTeam)
      .where(eq(eventTeam.eventId, row.id));
    const mine = await tx
      .select({ teamId: eventTeamInvite.teamId })
      .from(eventTeamInvite)
      .where(
        and(
          eq(eventTeamInvite.userId, input.userId),
          eq(eventTeamInvite.status, 'pending'),
          eq(eventTeamInvite.kind, 'request'),
          inArray(eventTeamInvite.teamId, teamIds),
        ),
      );
    if (mine.some((m) => m.teamId === team.id)) refuse(409, 'alreadyRequested');
    if (mine.length >= MAX_PENDING_REQUESTS) refuse(409, 'tooManyRequests');
    const [created] = await tx
      .insert(eventTeamInvite)
      .values({ teamId: team.id, userId: input.userId, kind: 'request' })
      .returning({ id: eventTeamInvite.id });
    const [who] = await tx.select({ name: user.name }).from(user).where(eq(user.id, input.userId));
    await notify(tx, row.id, team.captainUserId, 'request', created!.id, {
      team: team.name,
      who: who?.name,
    });
    return created!.id;
  });
}

/**
 * Answers a pending item. The invited player answers an invitation; the captain answers a
 * request. Accepting adds the player (registering them first if need be) and cancels their other
 * pending items for the event. Declining is silent, except that a declined request is answered.
 */
async function answer(input: {
  userId: string;
  eventId: string;
  inviteId: number;
  accept: boolean;
}): Promise<SettleResult> {
  return db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    const [item] = await tx
      .select({ invite: eventTeamInvite, team: eventTeam })
      .from(eventTeamInvite)
      .innerJoin(eventTeam, eq(eventTeam.id, eventTeamInvite.teamId))
      .where(and(eq(eventTeamInvite.id, input.inviteId), eq(eventTeam.eventId, row.id)));
    if (!item || item.invite.status !== 'pending') refuse(404, 'inviteNotFound');
    const { invite, team } = item;
    const isInvite = invite.kind === 'invite';
    if (isInvite ? invite.userId !== input.userId : team.captainUserId !== input.userId)
      refuse(403, isInvite ? 'notYourInvite' : 'notCaptain');
    const close = (status: 'accepted' | 'declined') =>
      tx
        .update(eventTeamInvite)
        .set({ status, resolvedAt: new Date() })
        .where(eq(eventTeamInvite.id, invite.id));

    if (!input.accept) {
      await close('declined');
      if (!isInvite)
        await notify(tx, row.id, invite.userId, 'declined', invite.id, { team: team.name });
      return { promoted: [], validated: [] };
    }

    assertRosterOpen(row);
    if ((await playersIn(tx, team.id)) >= row.teamMax!) refuse(409, 'teamFull');
    let reg: { id: number } | null | undefined = await registrationOf(tx, row.id, invite.userId);
    if (!reg) {
      // Only an invitation can bring an unregistered player: it registers them, school and window
      // checked like any registration. A request always comes from someone registered.
      const [invitee] = await tx.select().from(user).where(eq(user.id, invite.userId));
      const state = registrationState(
        { ...row, capacity: null, registered: 0 },
        invitee?.tenantId ?? null,
      );
      if (state !== 'open') refuse(409, state);
      [reg] = await tx
        .insert(eventRegistration)
        .values({ eventId: row.id, userId: invite.userId, status: 'registered' })
        .returning({ id: eventRegistration.id });
    }
    if ((await membershipOf(tx, row.id, invite.userId)).length > 0) refuse(409, 'alreadyInTeam');
    await tx.insert(eventTeamMember).values({ teamId: team.id, registrationId: reg!.id });
    await cancelPendingFor(tx, row.id, invite.userId);
    await close('accepted');
    if (!isInvite)
      await notify(tx, row.id, invite.userId, 'accepted', invite.id, { team: team.name });
    return eventTeamService.settle(tx, row);
  });
}

/** The captain withdraws an invitation, or a player withdraws their request. Silent. */
async function cancel(input: { userId: string; eventId: string; inviteId: number }): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await teamEvent(tx, input.eventId);
    const [item] = await tx
      .select({ invite: eventTeamInvite, team: eventTeam })
      .from(eventTeamInvite)
      .innerJoin(eventTeam, eq(eventTeam.id, eventTeamInvite.teamId))
      .where(and(eq(eventTeamInvite.id, input.inviteId), eq(eventTeam.eventId, row.id)));
    if (!item || item.invite.status !== 'pending') refuse(404, 'inviteNotFound');
    const owns =
      item.invite.kind === 'invite'
        ? item.team.captainUserId === input.userId
        : item.invite.userId === input.userId;
    if (!owns) refuse(403, item.invite.kind === 'invite' ? 'notCaptain' : 'notYourInvite');
    await tx
      .update(eventTeamInvite)
      .set({ status: 'cancelled', resolvedAt: new Date() })
      .where(eq(eventTeamInvite.id, item.invite.id));
  });
}

export const eventTeamInviteService = { search, invite, request, answer, cancel };
