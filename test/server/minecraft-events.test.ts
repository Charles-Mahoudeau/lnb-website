import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { minecraftAccount, minecraftServerEvent, user } from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyAdminService } from '~~/server/services/economy/admin';
import { economyServerService } from '~~/server/services/economy/server';
import { minecraftEventService } from '~~/server/services/minecraft-events';
import { questAdminService } from '~~/server/services/quests/admin';

// The live changes the site sends the Minecraft server's mods. See docs/economy.md.

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
let counter = 0;

async function player(name = 'Event Tester') {
  const n = ++counter;
  const id = `mc-events-${String(n)}-${String(Date.now())}`;
  const username = `Evt${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  await db.insert(user).values({ id, name, email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  return { id, uuid, username };
}

describe('minecraft server events', () => {
  it('tells the server about accounts and invitations made on the site', async () => {
    const owner = await player('Event Owner');
    const guest = await player('Event Guest');
    const from = await minecraftEventService.latestId('economy');

    const account = await economyAccountService.create(owner.id, {
      name: 'Event Club',
      handle: `events-${String(++counter)}`,
    });
    await economyAccountService.invite(owner.id, account.id, { userId: guest.id, role: 'viewer' });

    const events = await minecraftEventService.since('economy', from);
    const mine = events.filter(
      (row) =>
        JSON.stringify(row.data).includes(owner.uuid) ||
        JSON.stringify(row.data).includes(guest.uuid),
    );
    expect(mine.map((row) => row.type)).toEqual(['accounts', 'invitation', 'accounts']);
    expect(mine[0]?.data).toEqual({ uuids: [owner.uuid] });
    expect(mine[1]?.data).toMatchObject({
      uuids: [guest.uuid],
      account: { id: account.id, name: 'Event Club', type: 'team' },
      role: 'viewer',
      invitedBy: owner.username,
    });
    expect(mine[2]?.data).toEqual({ uuids: [guest.uuid] });
  });

  it('tells the owner when an admin gives a license', async () => {
    const admin = await player('Event Admin');
    const owner = await player();
    const personal = (await economyServerService.lookup(owner.uuid)).defaultAccountId;
    const from = await minecraftEventService.latestId('economy');
    await economyAdminService.grantLicense(admin.id, personal);
    const events = await minecraftEventService.since('economy', from);
    expect(
      events.some(
        (row) => row.type === 'accounts' && JSON.stringify(row.data).includes(owner.uuid),
      ),
    ).toBe(true);
  });

  it('sends quests a config event when an admin edits the settings', async () => {
    const admin = await player('Quest Admin');
    const from = await minecraftEventService.latestId('quests');
    await questAdminService.updateSettings(admin.id, {});
    const events = await minecraftEventService.since('quests', from);
    expect(events.map((row) => row.type)).toContain('config');
    // Each topic reads only its own events.
    expect(
      (await minecraftEventService.since('economy', from)).every((row) => row.type !== 'config'),
    ).toBe(true);
  });

  it('keeps events a day', async () => {
    await minecraftEventService.emit('economy', 'accounts', { uuids: ['old'] });
    const [row] = await db
      .select({ id: minecraftServerEvent.id })
      .from(minecraftServerEvent)
      .where(sql`${minecraftServerEvent.data} = '{"uuids":["old"]}'::jsonb`)
      .orderBy(sql`${minecraftServerEvent.id} desc`)
      .limit(1);
    const id = row?.id ?? 0;
    await db
      .update(minecraftServerEvent)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(minecraftServerEvent.id, id));
    expect(await minecraftEventService.prune()).toBeGreaterThanOrEqual(1);
    const left = await db
      .select()
      .from(minecraftServerEvent)
      .where(eq(minecraftServerEvent.id, id));
    expect(left).toEqual([]);
  });
});
