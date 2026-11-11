import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import {
  partnerEvent,
  partnerEventGame,
  partnerEventInterest,
  partnerEventTeam,
  partnerEventTeamInvite,
  partnerEventTeamMember,
  user,
} from '~~/server/db/schema';
import { nextCaptain } from '~~/server/services/events/team-rules';
import { flagService } from '~~/server/services/flags';
import { pushQueueService } from '~~/server/services/push/queue';

import type {
  PartnerEventProblem,
  PartnerGameKey,
  PartnerGameTeamsView,
  PartnerInviteAnswerBody,
  PartnerMemberPatchBody,
  PartnerTeamCreateBody,
  PartnerTeamPatchBody,
  PartnerTeamRole,
} from '#shared/schemas/partner-events';
import { MAX_PENDING_INVITES, MAX_PENDING_REQUESTS } from '#shared/schemas/partner-events';
import { cleanTeamName, isValidTeamName, teamNameKey } from '#shared/utils/event-teams';
import {
  cleanAbbreviation,
  isValidAbbreviation,
  placesLeft,
  roleForJoiner,
} from '#shared/utils/partner-teams';
import { schoolForTenant } from '#shared/utils/schools';

// Teams of a partner event's confirmed games: a captain, starters and substitutes, invitations
// and requests. Copied from the tournament teams (docs/tournaments.md) rather than shared with
// them, which hang on event registrations. See docs/partner-events.md.

function refuse(status: number, problem: PartnerEventProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

type GameRow = typeof partnerEventGame.$inferSelect;
type EventRow = typeof partnerEvent.$inferSelect;

/** Finds the game and locks its row, so the counts made next can't change under the transaction. */
async function lockGame(
  tx: Tx,
  slug: string,
  key: PartnerGameKey,
): Promise<{ event: EventRow; game: GameRow }> {
  const [row] = await tx.select().from(partnerEvent).where(eq(partnerEvent.slug, slug));
  if (!row) refuse(404, 'partnerEventNotFound');
  const [game] = await tx
    .select()
    .from(partnerEventGame)
    .where(and(eq(partnerEventGame.partnerEventId, row.id), eq(partnerEventGame.key, key)))
    .for('update');
  if (!game) refuse(404, 'gameNotFound');
  if (game.status !== 'confirmed') refuse(409, 'gameNotConfirmed');
  if (row.closedAt) refuse(409, 'partnerEventClosed');
  return { event: row, game };
}

/** Creating, inviting and joining: the event's teams switch and the flag must be on. */
async function assertTeamsOpen(row: EventRow): Promise<void> {
  if (!row.teamsOpen || !(await flagService.isEnabled('partnerEvents.teams'))) {
    refuse(409, 'teamsClosed');
  }
}

async function interestOf(tx: Tx, gameId: string, userId: string) {
  const [row] = await tx
    .select()
    .from(partnerEventInterest)
    .where(and(eq(partnerEventInterest.gameId, gameId), eq(partnerEventInterest.userId, userId)));
  return row ?? null;
}

async function membershipOf(tx: Tx, gameId: string, userId: string) {
  const [row] = await tx
    .select()
    .from(partnerEventTeamMember)
    .where(
      and(eq(partnerEventTeamMember.gameId, gameId), eq(partnerEventTeamMember.userId, userId)),
    );
  return row ?? null;
}

async function takenIn(tx: Tx, teamId: string) {
  const rows = await tx
    .select({ role: partnerEventTeamMember.role, n: count() })
    .from(partnerEventTeamMember)
    .where(eq(partnerEventTeamMember.teamId, teamId))
    .groupBy(partnerEventTeamMember.role);
  return {
    starters: rows.find((r) => r.role === 'starter')?.n ?? 0,
    substitutes: rows.find((r) => r.role === 'substitute')?.n ?? 0,
  };
}

async function captainTeam(tx: Tx, gameId: string, teamId: string, userId: string) {
  const [team] = await tx
    .select()
    .from(partnerEventTeam)
    .where(and(eq(partnerEventTeam.id, teamId), eq(partnerEventTeam.gameId, gameId)));
  if (!team) refuse(404, 'teamNotFound');
  if (team.captainUserId !== userId) refuse(403, 'notCaptain');
  return team;
}

/** A tidied name and abbreviation that no other team of the game has. */
async function checkIdentity(
  tx: Tx,
  gameId: string,
  input: { name?: string; abbreviation?: string },
  exceptTeamId?: string,
) {
  const result: { name?: string; nameKey?: string; abbreviation?: string } = {};
  const others = (
    await tx.select().from(partnerEventTeam).where(eq(partnerEventTeam.gameId, gameId))
  ).filter((team) => team.id !== exceptTeamId);
  if (input.name !== undefined) {
    if (!isValidTeamName(input.name)) refuse(400, 'invalidTeamName');
    result.name = cleanTeamName(input.name);
    result.nameKey = teamNameKey(result.name);
    if (others.some((team) => team.nameKey === result.nameKey)) refuse(409, 'teamNameTaken');
  }
  if (input.abbreviation !== undefined) {
    if (!isValidAbbreviation(input.abbreviation)) refuse(400, 'invalidAbbreviation');
    result.abbreviation = cleanAbbreviation(input.abbreviation);
    if (others.some((team) => team.abbreviation === result.abbreviation)) {
      refuse(409, 'abbreviationTaken');
    }
  }
  return result;
}

/** A student joining a team drops their other waiting invitations and requests for the game. */
async function cancelPendingFor(tx: Tx, gameId: string, userId: string): Promise<void> {
  const teamIds = tx
    .select({ id: partnerEventTeam.id })
    .from(partnerEventTeam)
    .where(eq(partnerEventTeam.gameId, gameId));
  await tx
    .update(partnerEventTeamInvite)
    .set({ status: 'cancelled', resolvedAt: new Date() })
    .where(
      and(
        eq(partnerEventTeamInvite.userId, userId),
        eq(partnerEventTeamInvite.status, 'pending'),
        inArray(partnerEventTeamInvite.teamId, teamIds),
      ),
    );
}

/** Adds a student to a team in the first role with a free place, or refuses when it is full. */
async function addMember(
  tx: Tx,
  game: GameRow,
  teamId: string,
  userId: string,
  birthDate: string,
): Promise<void> {
  const role = roleForJoiner(game, await takenIn(tx, teamId));
  if (!role) refuse(409, 'teamFull');
  await tx.insert(partnerEventTeamMember).values({
    teamId,
    gameId: game.id,
    userId,
    role,
    birthDate,
  });
  await cancelPendingFor(tx, game.id, userId);
}

/**
 * Takes a student out of their team in a game, if they have one: the empty team goes, and a
 * captain who leaves hands over to the member who joined first, as a starter. Also used when
 * someone withdraws their interest.
 */
async function removeFromTeam(tx: Tx, gameId: string, userId: string): Promise<void> {
  const mine = await membershipOf(tx, gameId, userId);
  if (!mine) return;
  await tx.delete(partnerEventTeamMember).where(eq(partnerEventTeamMember.id, mine.id));
  const rest = await tx
    .select()
    .from(partnerEventTeamMember)
    .where(eq(partnerEventTeamMember.teamId, mine.teamId));
  if (rest.length === 0) {
    await tx.delete(partnerEventTeam).where(eq(partnerEventTeam.id, mine.teamId));
    return;
  }
  const [team] = await tx
    .select()
    .from(partnerEventTeam)
    .where(eq(partnerEventTeam.id, mine.teamId));
  if (team?.captainUserId === userId) {
    const next = nextCaptain(
      rest.map((m) => ({ userId: m.userId, joinedAt: m.createdAt, id: m.id })),
      userId,
    );
    await tx
      .update(partnerEventTeam)
      .set({ captainUserId: next })
      .where(eq(partnerEventTeam.id, mine.teamId));
    if (next) {
      await tx
        .update(partnerEventTeamMember)
        .set({ role: 'starter' })
        .where(
          and(
            eq(partnerEventTeamMember.teamId, mine.teamId),
            eq(partnerEventTeamMember.userId, next),
          ),
        );
    }
  }
}

/** Withdrawing interest in a game also leaves its team and drops the invitations and requests. */
async function withdrawFromGame(tx: Tx, gameId: string, userId: string): Promise<void> {
  await removeFromTeam(tx, gameId, userId);
  await cancelPendingFor(tx, gameId, userId);
}

/** Creates a team with the caller as captain and first starter. They must have shown interest. */
async function create(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  body: PartnerTeamCreateBody;
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const { event, game } = await lockGame(tx, input.slug, input.game);
    await assertTeamsOpen(event);
    if (!(await interestOf(tx, game.id, input.userId))) refuse(409, 'interestRequired');
    if (await membershipOf(tx, game.id, input.userId)) refuse(409, 'alreadyInTeam');
    const identity = await checkIdentity(tx, game.id, input.body);
    const [team] = await tx
      .insert(partnerEventTeam)
      .values({
        gameId: game.id,
        name: identity.name!,
        nameKey: identity.nameKey!,
        abbreviation: identity.abbreviation!,
        captainUserId: input.userId,
      })
      .returning({ id: partnerEventTeam.id });
    await addMember(tx, game, team!.id, input.userId, input.body.birthDate);
    return { id: team!.id };
  });
}

/** Renames the team, changes its abbreviation or turns requests on or off. The captain only. */
async function update(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
  body: PartnerTeamPatchBody;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, input.slug, input.game);
    await captainTeam(tx, game.id, input.teamId, input.userId);
    const identity = await checkIdentity(tx, game.id, input.body, input.teamId);
    const set: Partial<typeof partnerEventTeam.$inferInsert> = { ...identity };
    if (input.body.acceptsRequests !== undefined) set.acceptsRequests = input.body.acceptsRequests;
    await tx.update(partnerEventTeam).set(set).where(eq(partnerEventTeam.id, input.teamId));
  });
}

/** Leaves the caller's team. The captain's role passes on; the last one out ends the team. */
async function leave(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, input.slug, input.game);
    const mine = await membershipOf(tx, game.id, input.userId);
    if (mine?.teamId !== input.teamId) refuse(404, 'notInTeam');
    await removeFromTeam(tx, game.id, input.userId);
  });
}

/** Disbands a team: its players keep their interest and look for another one. */
async function disband(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, input.slug, input.game);
    await captainTeam(tx, game.id, input.teamId, input.userId);
    await tx.delete(partnerEventTeam).where(eq(partnerEventTeam.id, input.teamId));
  });
}

/** The captain removes a player from the team. */
async function kick(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
  targetUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, input.slug, input.game);
    await captainTeam(tx, game.id, input.teamId, input.userId);
    if (input.targetUserId === input.userId) refuse(409, 'notCaptain');
    const target = await membershipOf(tx, game.id, input.targetUserId);
    if (target?.teamId !== input.teamId) refuse(404, 'notInTeam');
    await removeFromTeam(tx, game.id, input.targetUserId);
  });
}

/**
 * The captain moves a player between starter and substitute, or hands over captaincy (the new
 * captain becomes a starter, and swaps with the old one if no starter place is free).
 */
async function patchMember(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
  targetUserId: string;
  body: PartnerMemberPatchBody;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, input.slug, input.game);
    const team = await captainTeam(tx, game.id, input.teamId, input.userId);
    const target = await membershipOf(tx, game.id, input.targetUserId);
    if (target?.teamId !== team.id) refuse(404, 'notInTeam');
    const setRole = (userId: string, role: PartnerTeamRole) =>
      tx
        .update(partnerEventTeamMember)
        .set({ role })
        .where(
          and(
            eq(partnerEventTeamMember.teamId, team.id),
            eq(partnerEventTeamMember.userId, userId),
          ),
        );

    if (input.body.captain) {
      if (input.targetUserId === input.userId) return;
      // The old captain steps down to the new captain's place if starters are full.
      if (target.role === 'substitute') {
        const taken = await takenIn(tx, team.id);
        if (taken.starters >= game.starters) await setRole(input.userId, 'substitute');
        await setRole(input.targetUserId, 'starter');
      }
      await tx
        .update(partnerEventTeam)
        .set({ captainUserId: input.targetUserId })
        .where(eq(partnerEventTeam.id, team.id));
      return;
    }

    const role = input.body.role!;
    if (role === target.role) return;
    // The captain is always a starter.
    if (input.targetUserId === team.captainUserId) refuse(409, 'notCaptain');
    const taken = await takenIn(tx, team.id);
    if (role === 'starter' && taken.starters >= game.starters) refuse(409, 'teamFull');
    if (role === 'substitute' && taken.substitutes >= game.substitutes) refuse(409, 'teamFull');
    await setRole(input.targetUserId, role);
  });
}

/** Tells one person about an invitation, a request or its answer. Part of the caller's transaction. */
async function notify(
  tx: Tx,
  input: {
    partnerEventId: string;
    game: PartnerGameKey;
    userId: string;
    inviteId: number;
    reason: 'invited' | 'request' | 'accepted' | 'declined';
    team: string;
    whoUserId?: string;
  },
): Promise<void> {
  const [who] = input.whoUserId
    ? await tx.select({ name: user.name }).from(user).where(eq(user.id, input.whoUserId))
    : [];
  await pushQueueService.enqueue(tx, {
    kind: 'partnerTeam',
    partnerEventId: input.partnerEventId,
    userIds: [input.userId],
    params: { reason: input.reason, game: input.game, team: input.team, who: who?.name ?? '' },
    dedupe: () => `partnerTeam:${String(input.inviteId)}:${input.reason}`,
  });
}

async function pendingCount(tx: Tx, where: ReturnType<typeof and>): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(partnerEventTeamInvite).where(where);
  return row?.n ?? 0;
}

/** The captain invites a student who showed interest, has no team and is not banned. */
async function invite(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
  targetUserId: string;
}): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const { event, game } = await lockGame(tx, input.slug, input.game);
    await assertTeamsOpen(event);
    const team = await captainTeam(tx, game.id, input.teamId, input.userId);
    if (input.targetUserId === input.userId) refuse(409, 'alreadyInTeam');
    const [target] = await tx.select().from(user).where(eq(user.id, input.targetUserId));
    if (!target || target.banned) refuse(404, 'notLooking');
    if (!(await interestOf(tx, game.id, target.id))) refuse(404, 'notLooking');
    if (await membershipOf(tx, game.id, target.id)) refuse(409, 'alreadyInTeam');

    const waiting = await pendingCount(
      tx,
      and(
        eq(partnerEventTeamInvite.teamId, team.id),
        eq(partnerEventTeamInvite.status, 'pending'),
        eq(partnerEventTeamInvite.kind, 'invite'),
      ),
    );
    if (placesLeft(game, await takenIn(tx, team.id), waiting) === 0) refuse(409, 'teamFull');
    const teamIds = tx
      .select({ id: partnerEventTeam.id })
      .from(partnerEventTeam)
      .where(eq(partnerEventTeam.gameId, game.id));
    const received = await pendingCount(
      tx,
      and(
        eq(partnerEventTeamInvite.userId, target.id),
        eq(partnerEventTeamInvite.status, 'pending'),
        eq(partnerEventTeamInvite.kind, 'invite'),
        inArray(partnerEventTeamInvite.teamId, teamIds),
      ),
    );
    if (received >= MAX_PENDING_INVITES) refuse(409, 'tooManyInvites');
    const [dup] = await tx
      .select({ id: partnerEventTeamInvite.id })
      .from(partnerEventTeamInvite)
      .where(
        and(
          eq(partnerEventTeamInvite.teamId, team.id),
          eq(partnerEventTeamInvite.userId, target.id),
          eq(partnerEventTeamInvite.status, 'pending'),
        ),
      );
    if (dup) refuse(409, 'alreadyInvited');
    const [created] = await tx
      .insert(partnerEventTeamInvite)
      .values({ teamId: team.id, userId: target.id, kind: 'invite' })
      .returning({ id: partnerEventTeamInvite.id });
    await notify(tx, {
      partnerEventId: event.id,
      game: input.game,
      userId: target.id,
      inviteId: created!.id,
      reason: 'invited',
      team: team.name,
      whoUserId: input.userId,
    });
    return { id: created!.id };
  });
}

/** A student with interest and no team asks the captain to be let in. */
async function request(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  teamId: string;
  birthDate: string;
}): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const { event, game } = await lockGame(tx, input.slug, input.game);
    await assertTeamsOpen(event);
    if (!(await interestOf(tx, game.id, input.userId))) refuse(409, 'interestRequired');
    if (await membershipOf(tx, game.id, input.userId)) refuse(409, 'alreadyInTeam');
    const [team] = await tx
      .select()
      .from(partnerEventTeam)
      .where(and(eq(partnerEventTeam.id, input.teamId), eq(partnerEventTeam.gameId, game.id)));
    if (!team) refuse(404, 'teamNotFound');
    if (!team.acceptsRequests || !team.captainUserId) refuse(409, 'requestsClosed');
    if (placesLeft(game, await takenIn(tx, team.id), 0) === 0) refuse(409, 'teamFull');
    const teamIds = tx
      .select({ id: partnerEventTeam.id })
      .from(partnerEventTeam)
      .where(eq(partnerEventTeam.gameId, game.id));
    const mine = await tx
      .select({ teamId: partnerEventTeamInvite.teamId })
      .from(partnerEventTeamInvite)
      .where(
        and(
          eq(partnerEventTeamInvite.userId, input.userId),
          eq(partnerEventTeamInvite.status, 'pending'),
          eq(partnerEventTeamInvite.kind, 'request'),
          inArray(partnerEventTeamInvite.teamId, teamIds),
        ),
      );
    if (mine.some((m) => m.teamId === team.id)) refuse(409, 'alreadyRequested');
    if (mine.length >= MAX_PENDING_REQUESTS) refuse(409, 'tooManyRequests');
    const [created] = await tx
      .insert(partnerEventTeamInvite)
      .values({
        teamId: team.id,
        userId: input.userId,
        kind: 'request',
        birthDate: input.birthDate,
      })
      .returning({ id: partnerEventTeamInvite.id });
    await notify(tx, {
      partnerEventId: event.id,
      game: input.game,
      userId: team.captainUserId,
      inviteId: created!.id,
      reason: 'request',
      team: team.name,
      whoUserId: input.userId,
    });
    return { id: created!.id };
  });
}

async function findInvite(tx: Tx, gameId: string, inviteId: number) {
  const [item] = await tx
    .select({ invite: partnerEventTeamInvite, team: partnerEventTeam })
    .from(partnerEventTeamInvite)
    .innerJoin(partnerEventTeam, eq(partnerEventTeam.id, partnerEventTeamInvite.teamId))
    .where(and(eq(partnerEventTeamInvite.id, inviteId), eq(partnerEventTeam.gameId, gameId)));
  if (!item || item.invite.status !== 'pending') refuse(404, 'inviteNotFound');
  return item;
}

/**
 * Answers a pending item. The invited student answers an invitation (and gives their date of
 * birth when accepting); the captain answers a request. Accepting adds the student and cancels
 * their other pending items for the game. Declining is silent.
 */
async function answer(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  inviteId: number;
  body: PartnerInviteAnswerBody;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { event, game } = await lockGame(tx, input.slug, input.game);
    const { invite, team } = await findInvite(tx, game.id, input.inviteId);
    const isInvite = invite.kind === 'invite';
    if (isInvite ? invite.userId !== input.userId : team.captainUserId !== input.userId) {
      refuse(403, isInvite ? 'notYourInvite' : 'notCaptain');
    }
    const close = (status: 'accepted' | 'declined') =>
      tx
        .update(partnerEventTeamInvite)
        .set({ status, resolvedAt: new Date() })
        .where(eq(partnerEventTeamInvite.id, invite.id));
    // Only a request's answer is news to the student: an invitation they turn down is silent.
    const tell = (reason: 'accepted' | 'declined') =>
      isInvite
        ? Promise.resolve()
        : notify(tx, {
            partnerEventId: event.id,
            game: input.game,
            userId: invite.userId,
            inviteId: invite.id,
            reason,
            team: team.name,
          });
    if (!input.body.accept) {
      await close('declined');
      await tell('declined');
      return;
    }

    await assertTeamsOpen(event);
    const birthDate = isInvite ? input.body.birthDate : invite.birthDate;
    if (!birthDate) refuse(400, 'invalidBirthDate');
    if (!(await interestOf(tx, game.id, invite.userId))) refuse(409, 'interestRequired');
    if (await membershipOf(tx, game.id, invite.userId)) refuse(409, 'alreadyInTeam');
    await addMember(tx, game, team.id, invite.userId, birthDate);
    await close('accepted');
    await tell('accepted');
  });
}

/** The captain withdraws an invitation, or a student withdraws their request. */
async function cancel(input: {
  userId: string;
  slug: string;
  game: PartnerGameKey;
  inviteId: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const { game } = await lockGame(tx, input.slug, input.game);
    const { invite, team } = await findInvite(tx, game.id, input.inviteId);
    const owns =
      invite.kind === 'invite'
        ? team.captainUserId === input.userId
        : invite.userId === input.userId;
    if (!owns) refuse(403, invite.kind === 'invite' ? 'notCaptain' : 'notYourInvite');
    await tx
      .update(partnerEventTeamInvite)
      .set({ status: 'cancelled', resolvedAt: new Date() })
      .where(eq(partnerEventTeamInvite.id, invite.id));
  });
}

/**
 * A game's teams and the students looking for one. Names and avatars are for signed-in
 * students; visitors only get counts.
 */
async function view(input: {
  slug: string;
  game: PartnerGameKey;
  userId: string | null;
}): Promise<PartnerGameTeamsView> {
  const [row] = await db.select().from(partnerEvent).where(eq(partnerEvent.slug, input.slug));
  if (!row) refuse(404, 'partnerEventNotFound');
  const [game] = await db
    .select()
    .from(partnerEventGame)
    .where(and(eq(partnerEventGame.partnerEventId, row.id), eq(partnerEventGame.key, input.game)));
  if (!game) refuse(404, 'gameNotFound');
  const signedIn = input.userId !== null;

  const teams = await db
    .select()
    .from(partnerEventTeam)
    .where(eq(partnerEventTeam.gameId, game.id))
    .orderBy(asc(partnerEventTeam.createdAt), asc(partnerEventTeam.id));
  const interests = await db
    .select({
      userId: partnerEventInterest.userId,
      inGameName: partnerEventInterest.inGameName,
      rank: partnerEventInterest.rank,
      hidden: partnerEventInterest.hidden,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
      banned: user.banned,
    })
    .from(partnerEventInterest)
    .innerJoin(user, eq(user.id, partnerEventInterest.userId))
    .where(eq(partnerEventInterest.gameId, game.id))
    .orderBy(asc(partnerEventInterest.createdAt));
  const people = new Map(interests.map((p) => [p.userId, p]));
  const asPerson = (userId: string) => {
    const p = people.get(userId);
    return {
      userId,
      name: p?.name ?? '',
      image: p?.image ?? null,
      school: p ? (schoolForTenant(p.tenantId) ?? null) : null,
      inGameName: p?.inGameName ?? '',
      rank: p?.rank ?? '',
    };
  };

  const members = await db
    .select()
    .from(partnerEventTeamMember)
    .where(eq(partnerEventTeamMember.gameId, game.id))
    .orderBy(asc(partnerEventTeamMember.id));
  const byTeam = Map.groupBy(members, (m) => m.teamId);
  const pending =
    signedIn && teams.length > 0
      ? await db
          .select()
          .from(partnerEventTeamInvite)
          .where(
            and(
              eq(partnerEventTeamInvite.status, 'pending'),
              inArray(
                partnerEventTeamInvite.teamId,
                teams.map((t) => t.id),
              ),
            ),
          )
          .orderBy(asc(partnerEventTeamInvite.id))
      : [];

  const teamViews = teams.map((team) => {
    const ms = byTeam.get(team.id) ?? [];
    const starters = ms.filter((m) => m.role === 'starter').length;
    const isCaptain = signedIn && team.captainUserId === input.userId;
    const pendingOf = (kind: 'invite' | 'request') =>
      pending
        .filter((p) => p.teamId === team.id && p.kind === kind)
        .map((p) => ({ id: p.id, ...asPerson(p.userId) }));
    return {
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      starters,
      substitutes: ms.length - starters,
      complete: starters >= game.starters,
      acceptsRequests: team.acceptsRequests,
      members: signedIn
        ? ms.map((m) => ({
            ...asPerson(m.userId),
            role: m.role as PartnerTeamRole,
            captain: m.userId === team.captainUserId,
          }))
        : null,
      mine: ms.some((m) => m.userId === input.userId),
      captain: isCaptain,
      invited: isCaptain ? pendingOf('invite') : null,
      requests: isCaptain ? pendingOf('request') : null,
    };
  });

  const inTeam = new Set(members.map((m) => m.userId));
  const visible = interests.filter((p) => !inTeam.has(p.userId) && !p.hidden && !p.banned);
  const mine = input.userId ? myPending(pending, input.userId) : null;
  return {
    teams: teamViews,
    looking: {
      count: visible.length,
      players: signedIn
        ? visible.filter((p) => p.userId !== input.userId).map((p) => asPerson(p.userId))
        : null,
    },
    me: input.userId
      ? {
          interested: people.has(input.userId),
          teamId: members.find((m) => m.userId === input.userId)?.teamId ?? null,
          invitations: mine!.invitations.map((p) => {
            const team = teams.find((t) => t.id === p.teamId)!;
            return {
              id: p.id,
              teamId: team.id,
              teamName: team.name,
              from: team.captainUserId ? (people.get(team.captainUserId)?.name ?? null) : null,
            };
          }),
          requested: mine!.requests.map((p) => ({ id: p.id, teamId: p.teamId })),
          requestsLeft: Math.max(0, MAX_PENDING_REQUESTS - mine!.requests.length),
        }
      : null,
  };
}

function myPending(pending: (typeof partnerEventTeamInvite.$inferSelect)[], userId: string) {
  return {
    invitations: pending.filter((p) => p.kind === 'invite' && p.userId === userId),
    requests: pending.filter((p) => p.kind === 'request' && p.userId === userId),
  };
}

export const partnerTeamService = {
  create,
  update,
  leave,
  disband,
  kick,
  patchMember,
  invite,
  request,
  answer,
  cancel,
  view,
  withdrawFromGame,
};
