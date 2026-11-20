import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatPlayer,
  anticheatUsage,
  economyAccount,
  event,
  eventRegistration,
  eventRoom,
  eventType,
  minecraftAccount,
  playtimeLedger,
  user,
  wardenBan,
  wardenSession,
} from '~~/server/db/schema';
import { economyLedger } from '~~/server/services/economy/ledger';
import { peopleService } from '~~/server/services/people';
import { weekStart } from '~~/server/services/playtime/rules';
import { usersService } from '~~/server/services/users';

import type { AnticheatFileBand, AnticheatFileKind } from '#shared/schemas/anticheat';
import { fileStatus } from '#shared/utils/anticheat';

// The services refuse with Nuxt's createError, which a plain Node test can't load.
vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));
// The anticheat settings reach the mod catalog, which caches through Nitro.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ISEG = '0d4d6f3e-6a5a-4a7c-9e1f-6a0d4b1c2e11';
const tag = `Ppl${String(Date.now())}`;
const ids = {
  alice: `${tag}-alice`,
  bob: `${tag}-bob`,
  carol: `${tag}-carol`,
  dave: `${tag}-dave`,
};
const ALICE_UUID = '00000000-0000-4000-8000-00000000a11c';
const hex = () => crypto.randomUUID().replaceAll('-', '').repeat(4);

const ROLES = {
  admin: 'admin',
  warden: 'warden-admin',
  events: 'events-manager',
  economy: 'economy-admin',
} as const;

beforeAll(async () => {
  await db.insert(user).values([
    // Alice: banned from Warden, held by the anticheat, over the playtime limit, a Minecraft account.
    {
      id: ids.alice,
      name: `${tag} Alice`,
      email: `${ids.alice}@epitech.eu`,
      tenantId: EPITECH,
    },
    // Bob: a ghost.
    { id: ids.bob, name: `${tag} Bob`, email: `${ids.bob}@iseg.fr`, tenantId: ISEG, ghost: true },
    // Carol: an events manager with a bank account and a registration.
    {
      id: ids.carol,
      name: `${tag} Carol`,
      email: `${ids.carol}@epitech.eu`,
      tenantId: EPITECH,
      role: 'events-manager',
    },
    // Dave: banned from the site.
    {
      id: ids.dave,
      name: `${tag} Dave`,
      email: `${ids.dave}@epitech.eu`,
      tenantId: EPITECH,
      banned: true,
      banReason: 'spam',
    },
  ]);
  await db
    .insert(minecraftAccount)
    .values({ uuid: ALICE_UUID, userId: ids.alice, username: 'AliceCraft', playtimeSeconds: 90 });
  await db
    .insert(wardenBan)
    .values({ userId: ids.alice, reason: 'Griefing', source: 'web', expiresAt: null });
  await db.insert(anticheatPlayer).values({ userId: ids.alice, score: 10 });
  const [session] = await db
    .insert(wardenSession)
    .values({ minecraftUuid: ALICE_UUID, userId: ids.alice })
    .returning({ id: wardenSession.id });
  await db.insert(playtimeLedger).values({
    sessionId: session!.id,
    weekStart: weekStart(Date.now()),
    userId: ids.alice,
    minecraftUuid: ALICE_UUID,
    overSeconds: 600,
    countedUntil: new Date(),
  });
  // The balance comes through the ledger, so the books stay consistent for the other tests.
  const [account] = await db
    .insert(economyAccount)
    .values({ kind: 'personal', ownerUserId: ids.carol })
    .returning();
  await db.transaction((tx) =>
    economyLedger.mint(tx, {
      accountId: account!.id,
      amount: 420,
      reason: 'startingBalance',
      actor: { source: 'system' },
    }),
  );
  const [room] = await db
    .insert(eventRoom)
    .values({ name: `${tag} room` })
    .returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: tag, nameFr: tag, icon: 'i-lucide-trophy' })
    .returning();
  const [upcoming] = await db
    .insert(event)
    .values({
      name: `${tag} LAN`,
      description: 'x',
      roomId: room!.id,
      typeId: type!.id,
      schools: [EPITECH],
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000),
    })
    .returning();
  await db
    .insert(eventRegistration)
    .values({ eventId: upcoming!.id, userId: ids.carol, status: 'registered' });
});

const find = (page: { items: { userId: string }[] }, id: string) =>
  page.items.find((row) => row.userId === id);

describe('the columns of the People list, by role', () => {
  it('gives site admins everything', async () => {
    const page = await peopleService.list(ROLES.admin, { q: tag });
    expect(page.items.map((row) => row.name)).toEqual([
      `${tag} Alice`,
      `${tag} Bob`,
      `${tag} Carol`,
      `${tag} Dave`,
    ]);
    expect(find(page, ids.alice)).toMatchObject({
      email: `${ids.alice}@epitech.eu`,
      school: 'Epitech',
      roles: { admin: false, eventsManager: false },
      siteBan: null,
      ban: { reason: 'Griefing', expiresAt: null },
      minecraft: {
        accounts: [{ uuid: ALICE_UUID, username: 'AliceCraft', online: true }],
        playtimeSeconds: 90,
      },
      anticheat: { score: 10, band: 'held', flagged: true },
      overLimit: true,
      balance: null,
      registrations: { upcoming: 0, total: 0 },
    });
    expect(find(page, ids.carol)).toMatchObject({
      roles: { eventsManager: true },
      balance: 420,
      registrations: { upcoming: 1, total: 1 },
    });
    expect(find(page, ids.dave)).toMatchObject({ siteBan: { reason: 'spam', expiresAt: null } });
  });

  it('gives Warden admins Minecraft and anticheat data, not the site account or balances', async () => {
    const row = find(await peopleService.list(ROLES.warden, { q: tag }), ids.alice)!;
    expect(row).toMatchObject({
      email: `${ids.alice}@epitech.eu`,
      ban: { reason: 'Griefing' },
      minecraft: { playtimeSeconds: 90 },
      anticheat: { flagged: true },
      overLimit: true,
    });
    for (const key of ['lastSignInAt', 'inactive', 'siteBan', 'balance', 'registrations']) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it('gives economy admins balances and names, no email and no Minecraft data', async () => {
    const page = await peopleService.list(ROLES.economy, { q: tag });
    expect(find(page, ids.carol)).toMatchObject({ balance: 420, school: 'Epitech' });
    expect(find(page, ids.alice)).toMatchObject({ balance: null });
    for (const row of page.items) {
      for (const key of ['email', 'roles', 'minecraft', 'anticheat', 'ban', 'registrations']) {
        expect(row).not.toHaveProperty(key);
      }
    }
  });

  it('gives events managers registrations, and never an email', async () => {
    const page = await peopleService.list(ROLES.events, { q: tag });
    expect(find(page, ids.carol)).toMatchObject({ registrations: { upcoming: 1, total: 1 } });
    for (const row of page.items) {
      for (const key of ['email', 'roles', 'minecraft', 'balance', 'siteBan']) {
        expect(row).not.toHaveProperty(key);
      }
    }
  });
});

describe('searching and filtering', () => {
  it('searches by email for events managers and Warden admins, but not economy admins', async () => {
    const email = `${ids.bob}@iseg.fr`;
    expect(
      (await peopleService.list(ROLES.events, { q: email })).items.map((r) => r.userId),
    ).toEqual([ids.bob]);
    expect((await peopleService.list(ROLES.warden, { q: email })).items).toHaveLength(1);
    expect((await peopleService.list(ROLES.economy, { q: email })).items).toHaveLength(0);
  });

  it('searches by Minecraft name and UUID for Warden and economy admins, not events managers', async () => {
    for (const role of [ROLES.warden, ROLES.economy, ROLES.admin]) {
      for (const q of ['aliceCr', ALICE_UUID, ALICE_UUID.replaceAll('-', '').toUpperCase()]) {
        const page = await peopleService.list(role, { q });
        expect(page.items.map((row) => row.userId)).toEqual([ids.alice]);
      }
    }
    expect((await peopleService.list(ROLES.events, { q: 'AliceCraft' })).items).toEqual([]);
  });

  it('resolves an exact Minecraft name or UUID to its owner', async () => {
    expect((await peopleService.list(ROLES.warden, { q: 'alicecraft' })).match).toEqual({
      userId: ids.alice,
    });
    expect((await peopleService.list(ROLES.economy, { q: ALICE_UUID })).match).toEqual({
      userId: ids.alice,
    });
    // A part of a name isn't an exact match, and events managers get none.
    expect((await peopleService.list(ROLES.warden, { q: 'aliceCr' })).match).toBeNull();
    expect((await peopleService.list(ROLES.events, { q: 'AliceCraft' })).match).toBeNull();
  });

  it('filters by the quick filters and the school', async () => {
    const by = async (filters: string[], tenantId?: string) =>
      (
        await peopleService.list(ROLES.admin, {
          q: tag,
          filters: filters as never,
          tenantId,
        })
      ).items.map((row) => row.userId);
    expect(await by(['banned'])).toEqual([ids.alice, ids.dave]);
    expect(await by(['flagged'])).toEqual([ids.alice]);
    expect(await by(['overLimit'])).toEqual([ids.alice]);
    expect(await by(['ghost'])).toEqual([ids.bob]);
    expect(await by(['hasRole'])).toEqual([ids.carol]);
    expect(await by(['banned', 'flagged'])).toEqual([ids.alice]);
    expect(await by([], ISEG)).toEqual([ids.bob]);
    expect(await by(['inactive'])).toEqual([]);
    const events = await peopleService.list(ROLES.events, {
      q: tag,
      role: 'any',
      filters: ['ghost'],
    });
    expect(events.items.map((row) => row.userId)).toEqual([ids.bob]);
    // A Warden admin's `banned` doesn't count site bans.
    const warden = await peopleService.list(ROLES.warden, { q: tag, filters: ['banned'] });
    expect(warden.items.map((row) => row.userId)).toEqual([ids.alice]);
  });

  it('refuses filters a role may not see', async () => {
    const refused = { status: 403, data: { problem: 'notAllowed' } };
    await expect(peopleService.list(ROLES.events, { filters: ['banned'] })).rejects.toMatchObject(
      refused,
    );
    await expect(peopleService.list(ROLES.economy, { filters: ['flagged'] })).rejects.toMatchObject(
      refused,
    );
    await expect(peopleService.list(ROLES.warden, { filters: ['inactive'] })).rejects.toMatchObject(
      refused,
    );
    await expect(peopleService.list(ROLES.warden, { role: 'admin' })).rejects.toMatchObject(
      refused,
    );
    await expect(peopleService.list(ROLES.economy, { filters: ['hasRole'] })).rejects.toMatchObject(
      refused,
    );
  });

  it('pages by name with a cursor and counts every match', async () => {
    const first = await peopleService.list(ROLES.admin, { q: tag });
    expect(first.total).toBe(4);
    expect(first.nextCursor).toBeNull();
    // 50 per page: a broader search has a next page and a total beyond the page.
    const everyone = await peopleService.list(ROLES.admin, {});
    expect(everyone.items.length).toBeLessThanOrEqual(50);
    expect(everyone.total).toBeGreaterThanOrEqual(4);
    await expect(peopleService.list(ROLES.admin, { cursor: 'nonsense' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('the anticheat rule in SQL and in fileStatus', () => {
  it('flags the same files as fileStatus calls review, refused or banned', async () => {
    const kinds: AnticheatFileKind[] = ['mod', 'resourcepack', 'shader', 'client'];
    const bands: (AnticheatFileBand | null)[] = [
      null,
      'banned',
      'low',
      'middle',
      'accepted',
      'approved',
    ];
    const reviewed: (AnticheatFileBand | null)[] = [null, 'accepted'];
    for (const kind of kinds) {
      for (const band of bands) {
        for (const reviewedBand of reviewed) {
          const probe = `${tag}-probe-${kind}-${String(band)}-${String(reviewedBand)}`;
          await db
            .insert(user)
            .values({ id: probe, name: probe, email: `${probe}@epitech.eu`, tenantId: EPITECH });
          const sha512 = hex();
          await db.insert(anticheatFile).values({
            sha512,
            kind,
            filename: 'probe.jar',
            lookupState: 'notFound',
            band,
            score: band === null ? null : 50,
            reviewedBand,
          });
          await db
            .insert(anticheatUsage)
            .values({ userId: probe, sha512, lastMinecraftUuid: crypto.randomUUID() });
          const status = fileStatus({ kind, band, score: band === null ? null : 50, reviewedBand });
          const wanted = status === 'review' || status === 'refused' || status === 'banned';
          const page = await peopleService.list(ROLES.warden, {
            q: probe,
            filters: ['flagged'],
          });
          expect(
            page.items.some((row) => row.userId === probe),
            `${kind} ${String(band)} reviewed ${String(reviewedBand)} is ${String(status)}`,
          ).toBe(wanted);
        }
      }
    }
  });
});

describe('the summary', () => {
  it('gives Warden admins the Minecraft, moderation, playtime and anticheat figures', async () => {
    const summary = await peopleService.summary(ROLES.warden, ids.alice);
    expect(summary).toMatchObject({
      name: `${tag} Alice`,
      email: `${ids.alice}@epitech.eu`,
      school: 'Epitech',
      minecraft: { accounts: [{ username: 'AliceCraft' }], playtimeSeconds: 90, devices: 0 },
      moderation: { activeBan: { reason: 'Griefing' }, appeal: null, bans: 1, notes: 0 },
      playtime: { overSeconds: 600 },
      anticheat: { score: 10, band: 'held', flagged: true, flaggedFile: null },
    });
    for (const key of ['siteBan', 'lastSignInAt', 'economy', 'events']) {
      expect(summary).not.toHaveProperty(key);
    }
  });

  it('names the file to look at first', async () => {
    const sha512 = hex();
    await db.insert(anticheatFile).values({
      sha512,
      kind: 'mod',
      filename: 'freecam.jar',
      lookupState: 'notFound',
      band: 'low',
    });
    await db
      .insert(anticheatUsage)
      .values({ userId: ids.dave, sha512, lastMinecraftUuid: crypto.randomUUID() });
    const summary = await peopleService.summary(ROLES.warden, ids.dave);
    expect(summary?.anticheat).toMatchObject({
      flagged: true,
      flaggedFiles: 1,
      flaggedFile: { sha512, filename: 'freecam.jar', status: 'refused' },
    });
  });

  it('gives economy admins the account and events managers the registrations', async () => {
    const economy = await peopleService.summary(ROLES.economy, ids.carol);
    expect(economy).toMatchObject({ economy: { balance: 420, frozen: false } });
    for (const key of ['email', 'roles', 'minecraft', 'moderation', 'events']) {
      expect(economy).not.toHaveProperty(key);
    }
    const events = await peopleService.summary(ROLES.events, ids.carol);
    expect(events?.events?.registrations).toMatchObject([
      { name: `${tag} LAN`, status: 'registered', team: null },
    ]);
    for (const key of ['email', 'roles', 'minecraft', 'economy', 'siteBan']) {
      expect(events).not.toHaveProperty(key);
    }
  });

  it('gives site admins the site account, and leaves Minecraft out for a ghost', async () => {
    expect(await peopleService.summary(ROLES.admin, ids.dave)).toMatchObject({
      siteBan: { reason: 'spam' },
      tenantId: EPITECH,
      roles: { admin: false },
    });
    const ghost = await peopleService.summary(ROLES.admin, ids.bob);
    expect(ghost).toMatchObject({ ghost: true, economy: null, events: { registrations: [] } });
    for (const key of ['minecraft', 'moderation', 'playtime', 'anticheat']) {
      expect(ghost).not.toHaveProperty(key);
    }
  });

  it('answers null for an account that does not exist', async () => {
    expect(await peopleService.summary(ROLES.admin, 'nobody-here')).toBeNull();
  });
});

describe('bulk actions on the same filters', () => {
  it('select the people the list shows', async () => {
    const result = await usersService.bulk({
      actorId: ids.carol,
      body: {
        action: 'signOut',
        dryRun: true,
        selection: { filters: { q: tag, filters: ['banned', 'ghost'] } },
      },
    });
    expect(result.total).toBe(0);
    const banned = await usersService.bulk({
      actorId: ids.carol,
      body: {
        action: 'signOut',
        dryRun: true,
        selection: { filters: { q: tag, filters: ['banned'] } },
      },
    });
    expect(banned).toMatchObject({ total: 2, applied: 2 });
  });
});

describe('who may open People', () => {
  it('is Warden admins, events managers, economy admins and site admins', async () => {
    const { canOpenAdmin } = await import('#shared/utils/roles');
    expect(
      [null, 'user', 'warden-admin', 'events-manager', 'economy-admin', 'admin'].map(canOpenAdmin),
    ).toEqual([false, false, true, true, true, true]);
  });
});
