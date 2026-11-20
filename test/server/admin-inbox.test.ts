import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventRoom,
  eventType,
  mod,
  modpackMod,
  user,
  wardenAccountTransfer,
  wardenAppeal,
  wardenBan,
} from '~~/server/db/schema';
import { adminInboxService } from '~~/server/services/admin-inbox';

import type { AdminInbox, AdminInboxItem } from '#shared/schemas/admin';

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
const tag = `Inb${String(Date.now())}`;
const ids = { alice: `${tag}-alice`, bob: `${tag}-bob`, carol: `${tag}-carol` };
const ROLES = {
  admin: 'admin',
  warden: 'warden-admin',
  events: 'events-manager',
  economy: 'economy-admin',
} as const;

const item = (inbox: AdminInbox, id: AdminInboxItem['id']) =>
  inbox.items.find((entry) => entry.id === id);
const idsOf = (inbox: AdminInbox) => inbox.items.map((entry) => entry.id);

const before: Record<keyof typeof ROLES, AdminInbox> = {} as never;

beforeAll(async () => {
  // Other test files share the database: measure what this one adds.
  for (const [name, role] of Object.entries(ROLES)) {
    before[name as keyof typeof ROLES] = await adminInboxService.inbox(role);
  }

  await db.insert(user).values([
    { id: ids.alice, name: `${tag} Alice`, email: `${ids.alice}@epitech.eu`, tenantId: EPITECH },
    { id: ids.bob, name: `${tag} Bob`, email: `${ids.bob}@epitech.eu`, tenantId: EPITECH },
    {
      id: ids.carol,
      name: `${tag} Carol`,
      email: `${ids.carol}@epitech.eu`,
      tenantId: EPITECH,
      banned: true,
      banReason: 'spam',
    },
  ]);
  // One pending appeal, one answered one.
  const bans = await db
    .insert(wardenBan)
    .values([
      { userId: ids.alice, reason: 'Griefing', source: 'web', expiresAt: null },
      { userId: ids.bob, reason: 'Spam', source: 'web', expiresAt: null },
    ])
    .returning();
  await db.insert(wardenAppeal).values([
    { banId: bans[0]!.id, body: 'Sorry' },
    { banId: bans[1]!.id, body: 'Please', status: 'rejected' as const },
  ]);
  // One takeover waiting, one dismissed.
  await db.insert(wardenAccountTransfer).values([
    {
      minecraftUuid: crypto.randomUUID(),
      username: 'A',
      fromUserId: ids.alice,
      toUserId: ids.bob,
    },
    {
      minecraftUuid: crypto.randomUUID(),
      username: 'B',
      fromUserId: ids.bob,
      toUserId: ids.alice,
      dismissedAt: new Date(),
    },
  ]);
  // A visible suggestion, and one already hidden.
  await db.insert(mod).values([
    {
      list: 'suggestion' as const,
      source: 'manual' as const,
      name: `${tag} one`,
      pageUrl: 'https://example.com/1',
    },
    {
      list: 'suggestion' as const,
      status: 'removed' as const,
      source: 'manual' as const,
      name: `${tag} two`,
      pageUrl: 'https://example.com/2',
    },
  ]);
  // A Modlist mod with a newer file, and one up to date.
  await db.insert(modpackMod).values([
    {
      source: 'url' as const,
      name: `${tag} old`,
      pinnedSha512: 'aaa',
      latestSha512: 'bbb',
      latestVersion: '2',
    },
    { source: 'url' as const, name: `${tag} same`, pinnedSha512: 'aaa', latestSha512: 'aaa' },
  ]);
  // An upcoming event with two people on the waitlist, and a past one with one.
  const [room] = await db
    .insert(eventRoom)
    .values({ name: `${tag} room` })
    .returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: tag, nameFr: tag, icon: 'i-lucide-trophy' })
    .returning();
  const make = (name: string, offsetDays: number) => ({
    name,
    description: 'x',
    roomId: room!.id,
    typeId: type!.id,
    schools: [EPITECH],
    startsAt: new Date(Date.now() + offsetDays * 86_400_000),
    endsAt: new Date(Date.now() + (offsetDays + 0.5) * 86_400_000),
    capacity: 1,
  });
  const [upcoming, past] = await db
    .insert(event)
    .values([make(`${tag} LAN`, 3), make(`${tag} past`, -5)])
    .returning();
  await db.insert(eventRegistration).values([
    { eventId: upcoming!.id, userId: ids.alice, status: 'waitlist' },
    { eventId: upcoming!.id, userId: ids.bob, status: 'waitlist' },
    { eventId: past!.id, userId: ids.alice, status: 'waitlist' },
  ]);
});

describe('the admin inbox', () => {
  it('gives a Warden admin the Minecraft queues and nothing else', async () => {
    const inbox = await adminInboxService.inbox(ROLES.warden);
    const base = before.warden;
    expect(item(inbox, 'appeals')!.count - (item(base, 'appeals')?.count ?? 0)).toBe(1);
    expect(item(inbox, 'appeals')).toMatchObject({ to: '/admin/moderation/appeals' });
    expect(item(inbox, 'appeals')!.at).toEqual(expect.any(String));
    expect(item(inbox, 'transfers')!.count - (item(base, 'transfers')?.count ?? 0)).toBe(1);
    expect(item(inbox, 'transfers')!.to).toBe('/admin/people?filters=transfer');
    expect(item(inbox, 'suggestions')!.count - (item(base, 'suggestions')?.count ?? 0)).toBe(1);
    expect(item(inbox, 'modpackUpdates')!.count - (item(base, 'modpackUpdates')?.count ?? 0)).toBe(
      1,
    );
    for (const id of idsOf(inbox)) {
      expect(['appeals', 'transfers', 'anticheat', 'suggestions', 'modpackUpdates']).toContain(id);
    }
    expect(inbox.badges.moderation).toBe(item(inbox, 'appeals')!.count);
    expect(inbox.badges.people).toBe(item(inbox, 'transfers')!.count);
    expect(inbox.badges.modpack).toBe(
      item(inbox, 'suggestions')!.count + item(inbox, 'modpackUpdates')!.count,
    );
  });

  it('gives an events manager the waitlists of upcoming events only', async () => {
    const inbox = await adminInboxService.inbox(ROLES.events);
    expect(idsOf(inbox)).toEqual(['eventWaitlists']);
    const waitlists = item(inbox, 'eventWaitlists')!;
    expect(waitlists.count - (item(before.events, 'eventWaitlists')?.count ?? 0)).toBe(1);
    expect(waitlists.waiting! - (item(before.events, 'eventWaitlists')?.waiting ?? 0)).toBe(2);
    expect(inbox.badges).toEqual({ events: waitlists.count });
  });

  it('gives an economy admin nothing yet', async () => {
    const inbox = await adminInboxService.inbox(ROLES.economy);
    expect(inbox.items).toEqual([]);
    expect(inbox.badges).toEqual({});
  });

  it('gives a site admin every queue, in order of importance, and the site notices', async () => {
    const inbox = await adminInboxService.inbox(ROLES.admin);
    const order = idsOf(inbox);
    expect(order.indexOf('appeals')).toBeLessThan(order.indexOf('eventWaitlists'));
    expect(order.indexOf('eventWaitlists')).toBeLessThan(order.indexOf('siteBans'));
    expect(item(inbox, 'siteBans')!.count - (item(before.admin, 'siteBans')?.count ?? 0)).toBe(1);
    expect(item(inbox, 'siteBans')!.to).toBe('/admin/people?filters=banned');
    expect(idsOf(inbox)).toEqual(expect.arrayContaining(['appeals', 'eventWaitlists']));
  });

  it('counts the sidebar entries of a site admin from the same items', async () => {
    const inbox = await adminInboxService.inbox(ROLES.admin);
    expect(inbox.badges.moderation).toBe(item(inbox, 'appeals')!.count);
    expect(inbox.badges.events).toBe(item(inbox, 'eventWaitlists')!.count);
  });
});
