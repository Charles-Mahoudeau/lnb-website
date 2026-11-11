import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { partnerEvent, partnerEventGame, partnerEventTeamMember, user } from '~~/server/db/schema';
import { partnerEventService } from '~~/server/services/partner-events';
import { partnerTeamService } from '~~/server/services/partner-teams';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const IDS = ['a', 'b', 'c', 'd'].map((letter) => `partner-team-${letter}`);
const [CAP, BOB, CARA, DAN] = IDS as [string, string, string, string];
const DOB = '2004-05-06';

async function problemOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { data?: { problem?: unknown } }).data?.problem;
  }
  return undefined;
}

let counter = 0;
/** A throwaway event with a 2-starter, 1-substitute game, everyone interested. */
async function setup(options: { teamsOpen?: boolean; status?: string } = {}) {
  const slug = `team-test-${String(++counter)}-${String(Date.now())}`;
  const [row] = await db
    .insert(partnerEvent)
    .values({ slug, teamsOpen: options.teamsOpen ?? true })
    .returning();
  const [game] = await db
    .insert(partnerEventGame)
    .values({
      partnerEventId: row!.id,
      key: 'lol',
      status: options.status ?? 'confirmed',
      starters: 2,
      substitutes: 1,
      position: 0,
    })
    .returning();
  for (const id of IDS) {
    await partnerEventService.saveInterest({
      userId: id,
      slug,
      body: { consent: true, games: [{ game: 'lol', inGameName: id }] },
    });
  }
  return { slug, gameId: game!.id };
}

const make = (slug: string, userId = CAP, name = 'Les Éclairs', abbreviation = 'ecl') =>
  partnerTeamService.create({
    userId,
    slug,
    game: 'lol',
    body: { name, abbreviation, birthDate: DOB },
  });

beforeAll(async () => {
  await db
    .insert(user)
    .values(
      IDS.map((id) => ({
        id,
        name: id,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
    )
    .onConflictDoNothing();
});

describe('creating a team', () => {
  it('makes the caller captain and first starter, abbreviation in capitals', async () => {
    const { slug } = await setup();
    await make(slug);
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: CAP });
    expect(view.teams).toHaveLength(1);
    expect(view.teams[0]).toMatchObject({
      name: 'Les Éclairs',
      abbreviation: 'ECL',
      starters: 1,
      substitutes: 0,
      complete: false,
      captain: true,
      mine: true,
    });
    expect(view.looking.count).toBe(3);
    expect(view.me?.teamId).toBe(view.teams[0]!.id);
    expect((await partnerEventService.view(slug, null)).games[0]!.teams).toBe(1);
  });

  it('needs interest, and refuses a second team, a taken name or abbreviation', async () => {
    const { slug } = await setup();
    await partnerEventService.saveInterest({
      userId: DAN,
      slug,
      body: { consent: false, games: [] },
    });
    expect(await problemOf(make(slug, DAN, 'Other', 'oth'))).toBe('interestRequired');
    await make(slug);
    expect(await problemOf(make(slug, CAP, 'Second', 'sec'))).toBe('alreadyInTeam');
    expect(await problemOf(make(slug, BOB, 'les eclairs', 'zz'))).toBe('teamNameTaken');
    expect(await problemOf(make(slug, BOB, 'Another', 'ECL'))).toBe('abbreviationTaken');
    expect(await problemOf(make(slug, BOB, 'Another', 'toolong'))).toBe('invalidAbbreviation');
    expect(await problemOf(make(slug, BOB, 'ab', 'ok'))).toBe('invalidTeamName');
  });

  it('refuses when teams are paused or the game is under study', async () => {
    const paused = await setup({ teamsOpen: false });
    expect(await problemOf(make(paused.slug))).toBe('teamsClosed');
    const study = await setup({ status: 'study' });
    expect(await problemOf(make(study.slug))).toBe('gameNotConfirmed');
  });
});

describe('invitations and requests', () => {
  it('fills starters first, then substitutes, then refuses', async () => {
    const { slug } = await setup();
    const { id: teamId } = await make(slug);
    const inv = await partnerTeamService.invite({
      userId: CAP,
      slug,
      game: 'lol',
      teamId,
      targetUserId: BOB,
    });
    await partnerTeamService.answer({
      userId: BOB,
      slug,
      game: 'lol',
      inviteId: inv.id,
      body: { accept: true, birthDate: DOB },
    });
    const req = await partnerTeamService.request({
      userId: CARA,
      slug,
      game: 'lol',
      teamId,
      birthDate: DOB,
    });
    await partnerTeamService.answer({
      userId: CAP,
      slug,
      game: 'lol',
      inviteId: req.id,
      body: { accept: true },
    });
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: CAP });
    const roles = view.teams[0]!.members!.map((m) => [m.userId, m.role]);
    expect(roles).toEqual([
      [CAP, 'starter'],
      [BOB, 'starter'],
      [CARA, 'substitute'],
    ]);
    expect(view.teams[0]!.complete).toBe(true);
    expect(
      await problemOf(
        partnerTeamService.invite({ userId: CAP, slug, game: 'lol', teamId, targetUserId: DAN }),
      ),
    ).toBe('teamFull');
    expect(
      await problemOf(
        partnerTeamService.request({ userId: DAN, slug, game: 'lol', teamId, birthDate: DOB }),
      ),
    ).toBe('teamFull');
  });

  it('only the invited player answers, accepting needs a date of birth, declining is silent', async () => {
    const { slug } = await setup();
    const { id: teamId } = await make(slug);
    const inv = await partnerTeamService.invite({
      userId: CAP,
      slug,
      game: 'lol',
      teamId,
      targetUserId: BOB,
    });
    expect(
      await problemOf(
        partnerTeamService.invite({ userId: CAP, slug, game: 'lol', teamId, targetUserId: BOB }),
      ),
    ).toBe('alreadyInvited');
    expect(
      await problemOf(
        partnerTeamService.answer({
          userId: CARA,
          slug,
          game: 'lol',
          inviteId: inv.id,
          body: { accept: true, birthDate: DOB },
        }),
      ),
    ).toBe('notYourInvite');
    expect(
      await problemOf(
        partnerTeamService.answer({
          userId: BOB,
          slug,
          game: 'lol',
          inviteId: inv.id,
          body: { accept: true },
        }),
      ),
    ).toBe('invalidBirthDate');
    await partnerTeamService.answer({
      userId: BOB,
      slug,
      game: 'lol',
      inviteId: inv.id,
      body: { accept: false },
    });
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: BOB });
    expect(view.teams[0]!.members!.map((m) => m.userId)).toEqual([CAP]);
    expect(view.me?.invitations).toEqual([]);
  });

  it('joining a team cancels the other pending items', async () => {
    const { slug } = await setup();
    const a = await make(slug);
    await partnerTeamService.create({
      userId: BOB,
      slug,
      game: 'lol',
      body: { name: 'Rival', abbreviation: 'RIV', birthDate: DOB },
    });
    const inv = await partnerTeamService.invite({
      userId: CAP,
      slug,
      game: 'lol',
      teamId: a.id,
      targetUserId: CARA,
    });
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: CARA });
    const rival = view.teams.find((t) => t.name === 'Rival')!;
    await partnerTeamService.request({
      userId: CARA,
      slug,
      game: 'lol',
      teamId: rival.id,
      birthDate: DOB,
    });
    await partnerTeamService.answer({
      userId: CARA,
      slug,
      game: 'lol',
      inviteId: inv.id,
      body: { accept: true, birthDate: DOB },
    });
    const after = await partnerTeamService.view({ slug, game: 'lol', userId: CARA });
    expect(after.me?.requested).toEqual([]);
    expect(after.me?.teamId).toBe(a.id);
  });
});

describe('roles and leaving', () => {
  it('the captain moves players, and the captain stays a starter', async () => {
    const { slug } = await setup();
    const { id: teamId } = await make(slug);
    const join = async (userId: string) => {
      const inv = await partnerTeamService.invite({
        userId: CAP,
        slug,
        game: 'lol',
        teamId,
        targetUserId: userId,
      });
      await partnerTeamService.answer({
        userId,
        slug,
        game: 'lol',
        inviteId: inv.id,
        body: { accept: true, birthDate: DOB },
      });
    };
    await join(BOB);
    await join(CARA);
    const patch = (body: { role?: 'starter' | 'substitute'; captain?: true }, target: string) =>
      partnerTeamService.patchMember({
        userId: CAP,
        slug,
        game: 'lol',
        teamId,
        targetUserId: target,
        body,
      });
    expect(await problemOf(patch({ role: 'starter' }, CARA))).toBe('teamFull');
    await patch({ role: 'substitute' }, BOB).catch(() => undefined);
    expect(await problemOf(patch({ role: 'substitute' }, CAP))).toBe('notCaptain');
    // Captain hands over to the substitute: the old captain steps down, full starters.
    await patch({ captain: true }, CARA);
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: CAP });
    const roles = Object.fromEntries(view.teams[0]!.members!.map((m) => [m.userId, m.role]));
    expect(roles[CARA]).toBe('starter');
    expect(roles[CAP]).toBe('substitute');
    expect(view.teams[0]!.captain).toBe(false);
  });

  it('a leaving captain hands over to the first to join, and the last out ends the team', async () => {
    const { slug } = await setup();
    const { id: teamId } = await make(slug);
    const inv = await partnerTeamService.invite({
      userId: CAP,
      slug,
      game: 'lol',
      teamId,
      targetUserId: BOB,
    });
    await partnerTeamService.answer({
      userId: BOB,
      slug,
      game: 'lol',
      inviteId: inv.id,
      body: { accept: true, birthDate: DOB },
    });
    await partnerTeamService.leave({ userId: CAP, slug, game: 'lol', teamId });
    let view = await partnerTeamService.view({ slug, game: 'lol', userId: BOB });
    expect(view.teams[0]!.captain).toBe(true);
    await partnerTeamService.leave({ userId: BOB, slug, game: 'lol', teamId });
    view = await partnerTeamService.view({ slug, game: 'lol', userId: BOB });
    expect(view.teams).toEqual([]);
  });

  it('withdrawing interest leaves the team', async () => {
    const { slug, gameId } = await setup();
    await make(slug);
    await partnerEventService.saveInterest({
      userId: CAP,
      slug,
      body: { consent: false, games: [] },
    });
    const rows = await db
      .select()
      .from(partnerEventTeamMember)
      .where(eq(partnerEventTeamMember.gameId, gameId));
    expect(rows).toEqual([]);
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: null });
    expect(view.teams).toEqual([]);
  });

  it('only the captain disbands, edits and removes players', async () => {
    const { slug } = await setup();
    const { id: teamId } = await make(slug);
    expect(
      await problemOf(partnerTeamService.disband({ userId: BOB, slug, game: 'lol', teamId })),
    ).toBe('notCaptain');
    expect(
      await problemOf(
        partnerTeamService.update({
          userId: BOB,
          slug,
          game: 'lol',
          teamId,
          body: { name: 'Hijack' },
        }),
      ),
    ).toBe('notCaptain');
    await partnerTeamService.update({
      userId: CAP,
      slug,
      game: 'lol',
      teamId,
      body: { name: 'Renamed', acceptsRequests: false },
    });
    expect(
      await problemOf(
        partnerTeamService.request({ userId: BOB, slug, game: 'lol', teamId, birthDate: DOB }),
      ),
    ).toBe('requestsClosed');
    await partnerTeamService.disband({ userId: CAP, slug, game: 'lol', teamId });
    const view = await partnerTeamService.view({ slug, game: 'lol', userId: null });
    expect(view.teams).toEqual([]);
    expect(view.me).toBeNull();
    expect(view.looking.players).toBeNull();
  });
});
