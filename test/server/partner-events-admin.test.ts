import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  partnerEvent,
  partnerEventGame,
  partnerEventInterest,
  partnerEventTeam,
  user,
} from '~~/server/db/schema';
import { partnerEventService } from '~~/server/services/partner-events';
import { partnerEventAdminService } from '~~/server/services/partner-events-admin';
import { buildSheets } from '~~/server/services/partner-events-export';
import { partnerTeamService } from '~~/server/services/partner-teams';

// The event-images storage, in memory: the admin service checks that an image exists.
const files = new Map<string, Buffer>();
const storage = { hasItem: (key: string) => Promise.resolve(files.has(key)) };
vi.mock('nitropack/runtime', () => ({ useStorage: () => storage }));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const [ADMIN, CAP, BOB] = ['pea-admin', 'pea-cap', 'pea-bob'] as [string, string, string];
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
async function setup() {
  const slug = `admin-test-${String(++counter)}-${String(Date.now())}`;
  const [row] = await db.insert(partnerEvent).values({ slug }).returning();
  await db.insert(partnerEventGame).values({
    partnerEventId: row!.id,
    key: 'lol',
    status: 'confirmed',
    starters: 2,
    substitutes: 1,
    position: 0,
    referentPseudo: 'Camille',
    referentEmail: 'camille@bde.example',
    referentBirthDate: '2003-02-14',
  });
  for (const id of [CAP, BOB]) {
    await partnerEventService.saveInterest({
      userId: id,
      slug,
      body: { consent: true, games: [{ game: 'lol', inGameName: `${id}#1`, rank: 'Gold' }] },
    });
  }
  const { id: teamId } = await partnerTeamService.create({
    userId: CAP,
    slug,
    game: 'lol',
    body: { name: 'Les Éclairs', abbreviation: 'ecl', birthDate: DOB },
  });
  return { slug, teamId, eventId: row!.id };
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(
      [ADMIN, CAP, BOB].map((id) => ({
        id,
        name: id,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
    )
    .onConflictDoNothing();
});

describe('the admin view', () => {
  it('lists games, teams and interest with the personal data', async () => {
    const { slug } = await setup();
    const view = await partnerEventAdminService.view(slug);
    expect(view.games[0]).toMatchObject({
      key: 'lol',
      interested: 2,
      teams: 1,
      players: 1,
      referent: { pseudo: 'Camille', role: 'Manager' },
    });
    expect(view.teams[0]).toMatchObject({ abbreviation: 'ECL', captain: CAP, referent: null });
    expect(view.interest.map((i) => [i.userId, i.status])).toEqual([
      [CAP, 'team'],
      [BOB, 'looking'],
    ]);
    expect(view.interest[0]!.email).toBe(`${CAP}@epitech.eu`);
  });
});

describe('settings and games', () => {
  it('changes only what is sent, and refuses a missing image', async () => {
    const { slug } = await setup();
    await partnerEventAdminService.updateSettings({
      actorId: ADMIN,
      slug,
      body: { dateTextEn: 'January to May 2027', teamsOpen: false },
    });
    const view = await partnerEventAdminService.view(slug);
    expect(view).toMatchObject({
      dateTextEn: 'January to May 2027',
      teamsOpen: false,
      interestOpen: true,
    });
    const missing = `${'0'.repeat(64)}.webp`;
    expect(
      await problemOf(
        partnerEventAdminService.updateSettings({
          actorId: ADMIN,
          slug,
          body: { heroKey: missing },
        }),
      ),
    ).toBe('imageNotFound');
  });

  it('refuses under study or fewer places while teams use them', async () => {
    const { slug } = await setup();
    const update = (body: Parameters<typeof partnerEventAdminService.updateGame>[0]['body']) =>
      partnerEventAdminService.updateGame({ actorId: ADMIN, slug, game: 'lol', body });
    expect(await problemOf(update({ status: 'study' }))).toBe('gameHasTeams');
    expect(await problemOf(update({ starters: 0 }))).toBe('placesInUse');
    await update({ starters: 3, referentPseudo: 'Nora', referentRole: 'Manager / Joueur' });
    const view = await partnerEventAdminService.view(slug);
    expect(view.games[0]).toMatchObject({
      starters: 3,
      referent: { pseudo: 'Nora', role: 'Manager / Joueur' },
    });
  });

  it('sets and clears a team referent, and disbands a team', async () => {
    const { slug, teamId } = await setup();
    await partnerEventAdminService.setTeamReferent({
      actorId: ADMIN,
      slug,
      teamId,
      body: {
        referent: { pseudo: 'Nora', email: 'n@bde.example', birthDate: null, role: 'Manager' },
      },
    });
    expect((await partnerEventAdminService.view(slug)).teams[0]!.referent?.pseudo).toBe('Nora');
    await partnerEventAdminService.setTeamReferent({
      actorId: ADMIN,
      slug,
      teamId,
      body: { referent: null },
    });
    expect((await partnerEventAdminService.view(slug)).teams[0]!.referent).toBeNull();
    await partnerEventAdminService.disbandTeam({ actorId: ADMIN, slug, teamId });
    expect((await partnerEventAdminService.view(slug)).teams).toEqual([]);
    expect(
      await problemOf(partnerEventAdminService.disbandTeam({ actorId: ADMIN, slug, teamId })),
    ).toBe('teamNotFound');
  });
});

describe('closing and the purge', () => {
  it('close makes the page read-only, reopen cancels it', async () => {
    const { slug } = await setup();
    await partnerEventAdminService.close({ actorId: ADMIN, slug });
    const closed = await partnerEventAdminService.view(slug);
    expect(closed.closedAt).not.toBeNull();
    const days = (Date.parse(closed.purgeAt!) - Date.parse(closed.closedAt!)) / 86_400_000;
    expect(days).toBe(60);
    expect(
      await problemOf(
        partnerEventService.saveInterest({
          userId: BOB,
          slug,
          body: { consent: true, games: [{ game: 'lol' }] },
        }),
      ),
    ).toBe('partnerEventClosed');
    await partnerEventAdminService.reopen({ actorId: ADMIN, slug });
    expect((await partnerEventAdminService.view(slug)).closedAt).toBeNull();
  });

  it('deletes interest and teams 60 days after closing, and nothing before', async () => {
    const { slug, eventId } = await setup();
    await partnerEventAdminService.close({ actorId: ADMIN, slug });
    const closeAt = (daysAgo: number) =>
      db
        .update(partnerEvent)
        .set({ closedAt: new Date(Date.now() - daysAgo * 86_400_000) })
        .where(eq(partnerEvent.id, eventId));
    await closeAt(59);
    await partnerEventAdminService.purgeClosed();
    expect((await partnerEventAdminService.view(slug)).interest).toHaveLength(2);
    await closeAt(61);
    await partnerEventAdminService.purgeClosed();
    const after = await partnerEventAdminService.view(slug);
    expect(after.interest).toEqual([]);
    expect(after.teams).toEqual([]);
    expect(after.games).toHaveLength(1);
    const rows = await db.select().from(partnerEventInterest);
    expect(
      rows.filter((r) => r.userId === CAP).every((r) => r.gameId !== after.games[0]!.key),
    ).toBe(true);
    expect(
      await db.select().from(partnerEventTeam).where(eq(partnerEventTeam.name, 'zzz')),
    ).toEqual([]);
  });
});

describe('the spreadsheet', () => {
  it('has the organizer’s sheets, headers, roles and the team referent first', async () => {
    const { slug, teamId } = await setup();
    await partnerEventAdminService.setTeamReferent({
      actorId: ADMIN,
      slug,
      teamId,
      body: {
        referent: {
          pseudo: 'Nora',
          email: 'n@bde.example',
          birthDate: DOB,
          role: 'Manager / Joueur',
        },
      },
    });
    const file = await partnerEventAdminService.exportSheet({ actorId: ADMIN, slug });
    // An .xlsx is a zip.
    expect(file.subarray(0, 2).toString()).toBe('PK');

    const sheets = buildSheets(
      [
        {
          league: 'LOL',
          name: 'Les Éclairs',
          abbreviation: 'ECL',
          referent: {
            pseudo: 'Nora',
            email: 'n@bde.example',
            birthDate: DOB,
            role: 'Manager / Joueur',
          },
          players: [
            { inGameName: 'cap#1', role: 'captain', email: 'c@epitech.eu', birthDate: DOB },
            { inGameName: 'sub#1', role: 'substitute', email: 's@epitech.eu', birthDate: DOB },
          ],
        },
      ],
      [],
    );
    expect(sheets.Manager[0]!.map((c) => c.value)).toEqual([
      'Ligue',
      'Nom de l’équipe',
      'Abréviation',
      'Pseudo du manager',
      'Rôle',
      'Mail',
      'Date de naissance',
    ]);
    expect(sheets.Manager[1]!.map((c) => c.value).slice(0, 5)).toEqual([
      'LOL',
      'Les Éclairs',
      'ECL',
      'Nora',
      'Manager / Joueur',
    ]);
    expect(sheets.Joueur[0]!.map((c) => c.value)).toEqual([
      'Ligue',
      'Appartenance équipe',
      'Pseudo',
      'Rôle',
      'Mail',
      'Date de naissance',
    ]);
    expect(sheets.Joueur.slice(1).map((r) => r[3]!.value)).toEqual(['Capitaine', 'Remplaçant']);
  });
});
