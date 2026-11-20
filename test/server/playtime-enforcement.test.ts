import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeLedger,
  playtimeSettings,
  user,
  audit as auditLog,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { playtimeService } from '~~/server/services/playtime/service';
import { playtimeSettingsService } from '~~/server/services/playtime/settings';
import { wardenClientService } from '~~/server/services/warden/client';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { wardenEventService } from '~~/server/services/warden/events';
import { wardenPlayerService } from '~~/server/services/warden/players';
import { wardenSessionService } from '~~/server/services/warden/sessions';
import type { WardenClient } from '~~/server/utils/warden';

import { parisInstant } from '#shared/utils/paris-time';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NONCE = 'N'.repeat(43);
const MON = '2026-11-16';
const TUE = '2026-11-17';
const H = 3600;

const at = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return parisInstant(date, h * 60 + m);
};

async function setMode(mode: 'off' | 'observe' | 'enforce') {
  await db.update(playtimeSettings).set({ mode }).where(eq(playtimeSettings.id, 1));
  playtimeSettingsService.clearCache();
}

afterAll(async () => {
  await setMode('observe');
});

let counter = 0;

/** A player with one account and one open session started at `startedAt`. */
async function online(startedAt: number, allowanceSeconds: number | null) {
  const id = `enforce-${String(++counter)}-${String(Date.now())}`;
  await db
    .insert(user)
    .values({ id, name: 'Enforce Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(wardenPlayer).values({ userId: id, playtimeAllowanceSeconds: allowanceSeconds });
  const uuid = crypto.randomUUID();
  await db
    .insert(minecraftAccount)
    .values({ uuid, userId: id, username: `E${String(counter)}x${String(Date.now() % 1000)}` });
  const [session] = await db
    .insert(wardenSession)
    .values({
      minecraftUuid: uuid,
      userId: id,
      startedAt: new Date(startedAt),
      lastHeartbeatAt: new Date(startedAt),
    })
    .returning({ id: wardenSession.id });
  return { id, uuid, sessionId: session!.id };
}

async function tickAt(sessionId: string, now: number) {
  await db
    .update(wardenSession)
    .set({ lastHeartbeatAt: new Date(now) })
    .where(eq(wardenSession.id, sessionId));
  await playtimeService.tick(now);
}

async function sent(userId: string) {
  const rows = await db.select().from(auditLog).where(eq(auditLog.targetUserId, userId));
  return rows
    .filter((row) => row.action.startsWith('minecraft.playtime.') && row.actorUserId === null)
    .map((row) => ({ action: row.action, data: row.data }));
}

describe('the tick in enforce', () => {
  beforeEach(() => setMode('enforce'));

  it('warns once at each mark, with what is really left', async () => {
    const p = await online(at(MON, '10:00'), 40 * 60);
    await tickAt(p.sessionId, at(MON, '10:05')); // 35 minutes left: nothing yet.
    expect(await sent(p.id)).toEqual([]);
    await tickAt(p.sessionId, at(MON, '10:11')); // 29 minutes left.
    await tickAt(p.sessionId, at(MON, '10:11') + 5000); // Not again.
    await tickAt(p.sessionId, at(MON, '10:31')); // 9 minutes left.
    expect(await sent(p.id)).toEqual([
      {
        action: 'minecraft.playtime.warning',
        data: { uuids: [p.uuid], remainingSeconds: 29 * 60, kind: 'allowance' },
      },
      {
        action: 'minecraft.playtime.warning',
        data: { uuids: [p.uuid], remainingSeconds: 9 * 60, kind: 'allowance' },
      },
    ]);
  });

  it('kicks once when the allowance runs out, with when to come back', async () => {
    const p = await online(at(MON, '10:00'), 30 * 60);
    await tickAt(p.sessionId, at(MON, '10:29'));
    await tickAt(p.sessionId, at(MON, '10:31'));
    await tickAt(p.sessionId, at(MON, '10:31') + 5000);
    const kicks = (await sent(p.id)).filter((row) => row.action === 'minecraft.playtime.kick');
    expect(kicks).toEqual([
      {
        action: 'minecraft.playtime.kick',
        data: {
          uuids: [p.uuid],
          reason: 'playtimeLimit',
          playtime: {
            windowEndsAt: new Date(at(MON, '17:00')).toISOString(),
            resetsAt: new Date(at('2026-11-23', '00:00')).toISOString(),
          },
        },
      },
    ]);
  });

  it('lets a player finish the window in the grace period, and says so once', async () => {
    const p = await online(at(MON, '09:00'), 7 * H);
    await tickAt(p.sessionId, at(MON, '16:10'));
    await tickAt(p.sessionId, at(MON, '16:10') + 5000);
    const actions = (await sent(p.id)).map((row) => row.action);
    expect(actions.filter((a) => a === 'minecraft.playtime.kick')).toEqual([]);
    expect(actions.filter((a) => a === 'minecraft.playtime.grace')).toHaveLength(1);
  });

  it('sends an update when the state changes, but not for a first look', async () => {
    const p = await online(at(MON, '16:50'), null);
    await tickAt(p.sessionId, at(MON, '16:55')); // The first look is silent.
    expect(await sent(p.id)).toEqual([]);
    await tickAt(p.sessionId, at(MON, '17:05')); // The window ended.
    const [update] = await sent(p.id);
    expect(update).toMatchObject({
      action: 'minecraft.playtime.update',
      data: { uuids: [p.uuid], playtime: { enforced: true, limited: true, counting: false } },
    });
  });

  it('warns a player with nothing left before a window opens, then kicks when it does', async () => {
    const p = await online(at(TUE, '08:00'), null);
    // The week's allowance is already used, by an earlier session.
    const [earlier] = await db
      .insert(wardenSession)
      .values({
        minecraftUuid: p.uuid,
        userId: p.id,
        startedAt: new Date(at(MON, '09:00')),
        endedAt: new Date(at(MON, '19:00')),
        endReason: 'quit',
      })
      .returning({ id: wardenSession.id });
    await db.insert(playtimeLedger).values({
      sessionId: earlier!.id,
      weekStart: MON,
      userId: p.id,
      minecraftUuid: p.uuid,
      countedSeconds: 10 * H,
      countedUntil: new Date(at(MON, '19:00')),
    });
    await tickAt(p.sessionId, at(TUE, '08:50'));
    await tickAt(p.sessionId, at(TUE, '08:56'));
    await tickAt(p.sessionId, at(TUE, '08:59') + 10_000);
    await tickAt(p.sessionId, at(TUE, '09:00') + 3000);
    expect((await sent(p.id)).map((row) => [row.action, row.data.kind ?? row.data.reason])).toEqual(
      [
        ['minecraft.playtime.warning', 'windowStart'],
        ['minecraft.playtime.warning', 'windowStart'],
        ['minecraft.playtime.kick', 'playtimeLimit'],
      ],
    );
  });

  it('reaches the Minecraft server through the events stream', async () => {
    const p = await online(at(MON, '10:00'), 30 * 60);
    const after = await wardenEventService.latestId();
    await tickAt(p.sessionId, at(MON, '10:31'));
    // Other tests' sessions are online too, so look at this player's events only.
    const events = (await wardenEventService.since(after))
      .map(({ event }) => event)
      .filter((event) => 'uuids' in event.data && event.data.uuids.includes(p.uuid));
    expect(events.map((event) => event.type)).toEqual(['kick']);
    expect(events[0]).toMatchObject({ data: { uuids: [p.uuid], reason: 'playtimeLimit' } });
  });
});

describe('the tick outside enforce', () => {
  it.each(['observe', 'off'] as const)('tells the server nothing in %s', async (mode) => {
    await setMode(mode);
    const p = await online(at(MON, '10:00'), 30 * 60);
    await tickAt(p.sessionId, at(MON, '10:11'));
    await tickAt(p.sessionId, at(MON, '10:31'));
    expect(await sent(p.id)).toEqual([]);
  });
});

describe('login and heartbeat', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  async function joiner(allowanceSeconds: number) {
    const id = `gate-${String(++counter)}-${String(Date.now())}`;
    await db
      .insert(user)
      .values({ id, name: 'Gate Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
    await db
      .insert(wardenPlayer)
      .values({ userId: id, playtimeAllowanceSeconds: allowanceSeconds });
    const { device } = await db.transaction((tx) =>
      wardenDeviceService.create(tx, { userId: id, name: 'Laptop' }),
    );
    const client: WardenClient = {
      device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
      user: { id, name: 'Gate Tester', tenantId: EPITECH, role: null },
    };
    const username = `G${String(counter)}x${String(Date.now() % 100000)}`.slice(0, 16);
    const { ticket } = await wardenClientService.joinTicket(client, {
      nonce: NONCE,
      username,
      link: true,
    });
    return {
      id,
      join: () =>
        wardenSessionService.login({
          ticket,
          nonce: NONCE,
          uuid: offlineUuid(username),
          username,
        }),
    };
  }

  it('denies a player with no allowance left inside a window, in enforce only', async () => {
    await setMode('enforce');
    vi.setSystemTime(at(MON, '10:00'));
    const p = await joiner(0);
    expect(await p.join()).toEqual({
      result: 'denied',
      reason: 'playtimeLimitReached',
      playtime: {
        windowEndsAt: new Date(at(MON, '17:00')).toISOString(),
        resetsAt: new Date(at('2026-11-23', '00:00')).toISOString(),
      },
    });

    await setMode('observe');
    const q = await joiner(0);
    const result = await q.join();
    expect(result).toMatchObject({
      result: 'allowed',
      playtime: { enforced: false, limited: true, counting: true, remainingSeconds: 0 },
    });
  });

  it('lets a player with no allowance in during the grace period', async () => {
    await setMode('enforce');
    vi.setSystemTime(at(MON, '16:30'));
    const p = await joiner(0);
    expect(await p.join()).toMatchObject({
      result: 'allowed',
      playtime: {
        enforced: true,
        grace: true,
        graceEndsAt: new Date(at(MON, '17:00')).toISOString(),
        remainingSeconds: 0,
      },
    });
  });

  it('answers a login outside the windows with the time left and when counting starts', async () => {
    await setMode('enforce');
    vi.setSystemTime(at(MON, '20:00'));
    const p = await joiner(0);
    expect(await p.join()).toMatchObject({
      result: 'allowed',
      playtime: {
        limited: true,
        counting: false,
        nextWindowStartsAt: new Date(at(TUE, '09:00')).toISOString(),
      },
    });
  });

  it('answers with no limit when the mode is off', async () => {
    await setMode('off');
    vi.setSystemTime(at(MON, '10:00'));
    const p = await joiner(0);
    expect(await p.join()).toMatchObject({
      result: 'allowed',
      playtime: { enforced: false, limited: false, counting: false },
    });
  });

  it('gives the state of each open session in the heartbeat answer', async () => {
    await setMode('enforce');
    vi.setSystemTime(at(MON, '10:00'));
    const p = await joiner(3600);
    const login = await p.join();
    if (login.result !== 'allowed') throw new Error('expected a login');
    const answer = await wardenSessionService.heartbeat([login.sessionId, crypto.randomUUID()]);
    expect(answer.unknown).toHaveLength(1);
    expect(answer.playtime[login.sessionId]).toMatchObject({
      enforced: true,
      limited: true,
      counting: true,
      limitSeconds: 3600,
      remainingSeconds: 3600,
    });
  });

  it('gives staff the state of an account', async () => {
    await setMode('enforce');
    vi.setSystemTime(at(MON, '10:00'));
    const p = await joiner(3600);
    const login = await p.join();
    if (login.result !== 'allowed') throw new Error('expected a login');
    const lookup = await wardenPlayerService.lookup(login.account.uuid);
    expect(lookup.playtime).toMatchObject({ state: 'counting', usedSeconds: 0, limited: true });
  });
});
