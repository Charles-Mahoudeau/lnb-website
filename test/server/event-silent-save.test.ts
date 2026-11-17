import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventRoom,
  eventType,
  pushNotification,
  pushSubscription,
  user,
} from '~~/server/db/schema';
import { eventAdminService } from '~~/server/services/events/admin';

vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));
vi.mock('nitropack/runtime', () => ({ useStorage: () => ({}) }));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const [MANAGER, FIRST, WAITING] = ['sil-manager', 'sil-first', 'sil-waiting'] as [
  string,
  string,
  string,
];
let roomId: string;
let typeId: string;

beforeAll(async () => {
  await db
    .insert(user)
    .values(
      [MANAGER, FIRST, WAITING].map((id) => ({
        id,
        name: id,
        email: `${id}@epitech.eu`,
        tenantId: EPITECH,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(pushSubscription)
    .values({
      userId: WAITING,
      endpoint: 'https://push.example/sil-waiting',
      p256dh: 'p',
      auth: 'a',
      device: 'Test',
    })
    .onConflictDoNothing();
  const [room] = await db.insert(eventRoom).values({ name: 'Silent room' }).returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Silent', nameFr: 'Silencieux', icon: 'i-lucide-bell-off' })
    .returning();
  roomId = room!.id;
  typeId = type!.id;
});

async function fullEvent() {
  const [row] = await db
    .insert(event)
    .values({
      name: 'Full night',
      description: 'Bring friends.',
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000),
      capacity: 1,
      hidden: false,
    })
    .returning();
  await db.insert(eventRegistration).values([
    { eventId: row!.id, userId: FIRST, status: 'registered' },
    { eventId: row!.id, userId: WAITING, status: 'waitlist' },
  ]);
  return row!;
}

async function raiseCapacity(id: string, silent: boolean) {
  const admin = await eventAdminService.get(id);
  await eventAdminService.update({
    actorId: MANAGER,
    id,
    silent,
    body: {
      name: admin.name,
      description: admin.description,
      roomId,
      typeId,
      schools: [EPITECH],
      startsAt: admin.startsAt,
      endsAt: admin.endsAt,
      capacity: 2,
      teamMode: false,
      teamMin: null,
      teamMax: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      price: null,
      hidden: false,
      reminderOffsets: [60],
      bdeSync: false,
      banner: null,
      embed: null,
    },
  });
}

const spots = (eventId: string) =>
  db
    .select()
    .from(pushNotification)
    .where(and(eq(pushNotification.eventId, eventId), eq(pushNotification.kind, 'spot')));

describe('saving an event without notifying', () => {
  it('promotes the waitlist but queues no notification', async () => {
    const e = await fullEvent();
    await raiseCapacity(e.id, true);
    const [promoted] = await db
      .select()
      .from(eventRegistration)
      .where(and(eq(eventRegistration.eventId, e.id), eq(eventRegistration.userId, WAITING)));
    expect(promoted?.status).toBe('registered');
    expect(await spots(e.id)).toHaveLength(0);
  });

  it('still notifies on a normal save', async () => {
    const e = await fullEvent();
    await raiseCapacity(e.id, false);
    expect(await spots(e.id)).toHaveLength(1);
  });
});
