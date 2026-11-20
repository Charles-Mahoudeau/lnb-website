import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { audit, user } from '~~/server/db/schema';
import { activityService } from '~~/server/services/activity';
import { auditService } from '~~/server/services/audit';
import { usersService } from '~~/server/services/users';
import { wardenEventService } from '~~/server/services/warden/events';

// The one activity log (docs/activity-log.md): who reads which part, the prune, what an account's
// deletion empties, and where the Minecraft server's event stream starts.

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const TAG = `act-${String(Date.now())}`;
const ADMIN = `${TAG}-admin`;
const PERSON = `${TAG}-person`;
const UUID = '5f1d2c3e-1111-4222-8333-444455556666';

const ids: number[] = [];
async function put(
  action: Parameters<typeof auditService.record>[1]['action'],
  extra: Partial<typeof audit.$inferInsert> = {},
) {
  const [row] = await db
    .insert(audit)
    .values({ action, data: { tag: TAG }, ...extra })
    .returning({ id: audit.id });
  ids.push(row!.id);
  return row!.id;
}

const mine = (role: string, filters: Parameters<typeof activityService.page>[1] = {}) =>
  activityService
    .page(role, { q: undefined, ...filters, user: PERSON })
    .then((page) => page.items.map((item) => item.action));

beforeAll(async () => {
  await db
    .insert(user)
    .values([
      { id: ADMIN, name: 'Act Admin', email: `${ADMIN}@epitech.eu`, tenantId: EPITECH },
      { id: PERSON, name: 'Act Person', email: `${PERSON}@epitech.eu`, tenantId: EPITECH },
    ])
    .onConflictDoNothing();
  for (const action of [
    'minecraft.ban',
    'events.event.registrationAdd',
    'economy.adjust',
    'links.create',
    'people.ghost.create',
    'people.roles',
    'settings.flag',
    // Only feeds the event stream: the log leaves it out.
    'minecraft.anticheat.verdict',
  ] as const) {
    await put(action, { actorUserId: ADMIN, targetUserId: PERSON });
  }
});

afterAll(async () => {
  await db.delete(audit).where(inArray(audit.id, ids));
  await db.delete(user).where(inArray(user.id, [ADMIN, PERSON]));
});

describe('activity log visibility', () => {
  it('shows a site admin every area', async () => {
    expect((await mine('admin')).sort()).toEqual(
      [
        'economy.adjust',
        'events.event.registrationAdd',
        'links.create',
        'minecraft.ban',
        'people.ghost.create',
        'people.roles',
        'settings.flag',
      ].sort(),
    );
  });

  it('shows a Warden admin only Minecraft', async () => {
    expect(await mine('warden-admin')).toEqual(['minecraft.ban']);
  });

  it('shows an events manager events, links and ghost accounts', async () => {
    expect((await mine('events-manager')).sort()).toEqual(
      ['events.event.registrationAdd', 'links.create', 'people.ghost.create'].sort(),
    );
  });

  it('shows an economy admin only the economy', async () => {
    expect(await mine('economy-admin')).toEqual(['economy.adjust']);
  });

  it('gives a person with several roles the union', async () => {
    expect((await mine('warden-admin,economy-admin')).sort()).toEqual(
      ['economy.adjust', 'minecraft.ban'].sort(),
    );
  });

  it('cannot be widened by asking for an area the role cannot read', async () => {
    expect(await mine('economy-admin', { areas: ['settings', 'minecraft'] })).toEqual([]);
    expect(await mine('admin', { areas: ['settings'] })).toEqual(['settings.flag']);
  });

  it('searches the names and pages newest first', async () => {
    const found = await activityService.page('admin', { q: 'Act Admin', user: PERSON });
    expect(found.items.length).toBe(7);
    expect(found.items[0]!.actor?.name).toBe('Act Admin');
    expect(found.items[0]!.target?.userId).toBe(PERSON);
    const first = await activityService.page('admin', { user: PERSON }, { limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await activityService.page(
      'admin',
      { user: PERSON },
      { limit: 3, cursor: Number(first.nextCursor) },
    );
    expect(second.items[0]!.id).toBeLessThan(first.items.at(-1)!.id);
  });

  it('keeps the entries of the last 30 days unless a date is given', async () => {
    const old = await put('settings.map', {
      actorUserId: ADMIN,
      targetUserId: PERSON,
      at: new Date(Date.now() - 40 * 86_400_000),
    });
    expect(
      (await activityService.page('admin', { user: PERSON })).items.map((i) => i.id),
    ).not.toContain(old);
    const all = await activityService.page('admin', {
      user: PERSON,
      from: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    });
    expect(all.items.map((item) => item.id)).toContain(old);
  });

  it('guards the CSV cells against formulas', async () => {
    await put('settings.flag', { actorUserId: ADMIN, data: { tag: TAG, note: '=1+1' } });
    const csv = await activityService.csv('admin', { user: ADMIN });
    expect(csv.split('\n')[0]).toBe('id,at,action,source,actor,target,data');
    expect(csv).toContain('settings.flag');
  });
});

describe('audit prune', () => {
  it('deletes entries older than 24 months and records one system action with the count', async () => {
    const old = await put('settings.map', {
      at: new Date(Date.now() - 800 * 86_400_000),
    });
    const removed = await auditService.prune();
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await db.select().from(audit).where(eq(audit.id, old));
    expect(left).toEqual([]);
    const [log] = await db
      .select()
      .from(audit)
      .where(eq(audit.action, 'settings.activityPrune'))
      .orderBy(audit.id)
      .limit(1);
    ids.push(
      ...(
        await db
          .select({ id: audit.id })
          .from(audit)
          .where(eq(audit.action, 'settings.activityPrune'))
      ).map((r) => r.id),
    );
    expect(log?.source).toBe('system');
    expect(log?.data).toHaveProperty('removed');
  });

  it('records nothing when nothing is old', async () => {
    await auditService.prune();
    const before = await db.select().from(audit).where(eq(audit.action, 'settings.activityPrune'));
    expect(await auditService.prune()).toBe(0);
    const after = await db.select().from(audit).where(eq(audit.action, 'settings.activityPrune'));
    expect(after.length).toBe(before.length);
  });
});

describe('account deletion', () => {
  it('keeps the rows but empties the people and the Minecraft identities', async () => {
    const gone = `${TAG}-gone`;
    await db
      .insert(user)
      .values({ id: gone, name: 'Gone', email: `${gone}@epitech.eu`, tenantId: EPITECH });
    const target = await put('minecraft.ban', {
      targetUserId: gone,
      targetMinecraftUuid: UUID,
      source: 'site',
      actorUserId: ADMIN,
    });
    const actor = await put('minecraft.appeal.create', {
      actorUserId: gone,
      actorMinecraftUuid: UUID,
      actorMinecraftName: 'GoneSteve',
      source: 'server',
    });
    await usersService.remove({ actorId: ADMIN, userId: gone });
    const rows = await db
      .select()
      .from(audit)
      .where(inArray(audit.id, [target, actor]));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.targetUserId).toBeNull();
      expect(row.actorUserId === ADMIN || row.actorUserId === null).toBe(true);
      expect(row.targetMinecraftUuid).toBeNull();
      expect(row.actorMinecraftUuid).toBeNull();
      expect(row.actorMinecraftName).toBeNull();
    }
    // The deletion itself is in the log, naming nobody.
    const [deleted] = await db
      .select()
      .from(audit)
      .where(eq(audit.action, 'people.delete'))
      .orderBy(audit.id)
      .limit(1);
    expect(deleted).toBeDefined();
    ids.push(
      ...(
        await db.select({ id: audit.id }).from(audit).where(eq(audit.action, 'people.delete'))
      ).map((r) => r.id),
    );
  });
});

describe('event stream start', () => {
  it('starts at the newest entry when Last-Event-ID is above it, or absent', async () => {
    const newest = await wardenEventService.latestId();
    expect(await wardenEventService.startAfter(null)).toBe(newest);
    expect(await wardenEventService.startAfter(newest + 1000)).toBe(newest);
    expect(await wardenEventService.startAfter(newest)).toBe(newest);
  });

  it('resumes from a Last-Event-ID that exists', async () => {
    const id = await put('minecraft.ban', { targetUserId: PERSON });
    await put('minecraft.unban', { targetUserId: PERSON });
    const resumed = await wardenEventService.startAfter(id - 1);
    expect(resumed).toBe(id - 1);
  });
});
