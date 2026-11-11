import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  partnerEvent,
  partnerEventGame,
  pushNotification,
  pushPreference,
  pushSubscription,
  user,
} from '~~/server/db/schema';
import { partnerEventService } from '~~/server/services/partner-events';
import { partnerEventAdminService } from '~~/server/services/partner-events-admin';
import { partnerTeamService } from '~~/server/services/partner-teams';

const storage = { hasItem: () => Promise.resolve(true) };
vi.mock('nitropack/runtime', () => ({ useStorage: () => storage }));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const [ADMIN, CAP, OPTED, PLAIN] = ['ppu-admin', 'ppu-cap', 'ppu-opted', 'ppu-plain'] as [
  string,
  string,
  string,
  string,
];

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
  const slug = `push-test-${String(++counter)}-${String(Date.now())}`;
  const [row] = await db.insert(partnerEvent).values({ slug }).returning();
  await db.insert(partnerEventGame).values({
    partnerEventId: row!.id,
    key: 'lol',
    status: 'confirmed',
    starters: 2,
    substitutes: 1,
    position: 0,
  });
  for (const id of [CAP, OPTED]) {
    await partnerEventService.saveInterest({
      userId: id,
      slug,
      body: { consent: true, games: [{ game: 'lol', inGameName: `${id}#1`, rank: 'Gold' }] },
    });
  }
  return { slug, eventId: row!.id };
}

const queued = (partnerEventId: string, kind: 'partnerEvent' | 'partnerTeam') =>
  db
    .select()
    .from(pushNotification)
    .where(
      and(eq(pushNotification.partnerEventId, partnerEventId), eq(pushNotification.kind, kind)),
    );

beforeAll(async () => {
  await db
    .insert(user)
    .values(
      [ADMIN, CAP, OPTED, PLAIN].map((id) => ({
        id,
        name: id,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
    )
    .onConflictDoNothing();
  // Everyone has a device. Only OPTED turned partner events on.
  await db
    .insert(pushSubscription)
    .values(
      [CAP, OPTED, PLAIN].map((id) => ({
        userId: id,
        endpoint: `https://push.example/${id}`,
        p256dh: 'p',
        auth: 'a',
        device: 'Test',
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(pushPreference)
    .values({ userId: OPTED, partnerEvents: true })
    .onConflictDoUpdate({ target: pushPreference.userId, set: { partnerEvents: true } });
});

describe('announcing a partner event', () => {
  it('reaches only the accounts that opted in, once', async () => {
    const { slug, eventId } = await setup();
    const impact = await partnerEventAdminService.announceImpact({ slug, locale: 'en' });
    expect(impact.preview.title).toBe(slug);

    const sent = await partnerEventAdminService.announce({ actorId: ADMIN, slug });
    expect(sent.recipients).toBeGreaterThanOrEqual(1);
    const rows = await queued(eventId, 'partnerEvent');
    expect(rows.map((r) => r.userId)).toContain(OPTED);
    expect(rows.map((r) => r.userId)).not.toContain(PLAIN);
    expect(rows.map((r) => r.userId)).not.toContain(CAP);

    expect(await problemOf(partnerEventAdminService.announce({ actorId: ADMIN, slug }))).toBe(
      'alreadyAnnounced',
    );
    const view = await partnerEventAdminService.view(slug);
    expect(view.announcedAt).not.toBeNull();
  });

  it('is refused once the event is closed', async () => {
    const { slug } = await setup();
    await partnerEventAdminService.close({ actorId: ADMIN, slug });
    expect(await problemOf(partnerEventAdminService.announce({ actorId: ADMIN, slug }))).toBe(
      'partnerEventClosed',
    );
  });
});

describe('team notifications', () => {
  it('tells the invited student, the captain of a request, and the requester of the answer', async () => {
    const { slug, eventId } = await setup();
    const { id: teamId } = await partnerTeamService.create({
      userId: CAP,
      slug,
      game: 'lol',
      body: { name: 'Les Éclairs', abbreviation: 'ecl', birthDate: '2004-05-06' },
    });

    await partnerTeamService.invite({
      userId: CAP,
      slug,
      game: 'lol',
      teamId,
      targetUserId: OPTED,
    });
    let rows = await queued(eventId, 'partnerTeam');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: OPTED,
      params: { reason: 'invited', team: 'Les Éclairs' },
    });

    // Withdraw the interest of OPTED's invitation by answering "no": silent for an invitation.
    const view = await partnerTeamService.view({ userId: OPTED, slug, game: 'lol' });
    const inviteId = view.me!.invitations[0]!.id;
    await partnerTeamService.answer({
      userId: OPTED,
      slug,
      game: 'lol',
      inviteId,
      body: { accept: false },
    });
    expect(await queued(eventId, 'partnerTeam')).toHaveLength(1);

    const { id: requestId } = await partnerTeamService.request({
      userId: OPTED,
      slug,
      game: 'lol',
      teamId,
      birthDate: '2004-01-02',
    });
    rows = await queued(eventId, 'partnerTeam');
    expect(rows.map((r) => [r.userId, r.params.reason])).toEqual(
      expect.arrayContaining([[CAP, 'request']]),
    );

    await partnerTeamService.answer({
      userId: CAP,
      slug,
      game: 'lol',
      inviteId: requestId,
      body: { accept: true },
    });
    rows = await queued(eventId, 'partnerTeam');
    expect(rows.map((r) => [r.userId, r.params.reason])).toEqual(
      expect.arrayContaining([[OPTED, 'accepted']]),
    );
  });
});
