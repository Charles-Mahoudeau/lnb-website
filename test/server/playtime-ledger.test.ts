import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeExemption,
  playtimeGrant,
  playtimeLedger,
  user,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import { playtimeContextService } from '~~/server/services/playtime/context';
import { playtimeLedgerService } from '~~/server/services/playtime/ledger';
import { playtimeService } from '~~/server/services/playtime/service';
import { playtimeViewService } from '~~/server/services/playtime/view';
import { wardenSessionService } from '~~/server/services/warden/sessions';

import { parisInstant } from '#shared/utils/paris-time';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const MON = '2026-11-16';
const H = 3600;

/** A Paris wall-clock time as an instant. */
const at = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return parisInstant(date, h * 60 + m);
};

let counter = 0;

/** A player with one Minecraft account and one session that started at `startedAt`. */
async function setup(startedAt: number, options: { accounts?: number } = {}) {
  const id = `playtime-${String(++counter)}-${String(Date.now())}`;
  await db
    .insert(user)
    .values({ id, name: 'Playtime Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(wardenPlayer).values({ userId: id });
  const sessions: { id: string; uuid: string }[] = [];
  for (let i = 0; i < (options.accounts ?? 1); i++) {
    const uuid = crypto.randomUUID();
    await db
      .insert(minecraftAccount)
      .values({ uuid, userId: id, username: `P${String(counter)}x${String(i)}` });
    const [session] = await db
      .insert(wardenSession)
      .values({
        minecraftUuid: uuid,
        userId: id,
        startedAt: new Date(startedAt),
        lastHeartbeatAt: new Date(startedAt),
      })
      .returning({ id: wardenSession.id });
    sessions.push({ id: session!.id, uuid });
  }
  return { id, sessions };
}

async function heartbeat(sessionId: string, at: number) {
  await db
    .update(wardenSession)
    .set({ lastHeartbeatAt: new Date(at) })
    .where(eq(wardenSession.id, sessionId));
}

async function rows(userId: string) {
  return db.select().from(playtimeLedger).where(eq(playtimeLedger.userId, userId));
}

const sum = async (userId: string) => {
  const all = await rows(userId);
  return {
    counted: all.reduce((n, r) => n + r.countedSeconds, 0),
    grace: all.reduce((n, r) => n + r.graceSeconds, 0),
    over: all.reduce((n, r) => n + r.overSeconds, 0),
    free: all.reduce((n, r) => n + r.freeSeconds, 0),
  };
};

describe('the tick', () => {
  it('counts the time of an online session, and carries on from where it stopped', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    const first = at(MON, '10:00') + 30 * 60_000;
    await heartbeat(sessions[0]!.id, first);
    await playtimeService.tick(first);
    expect(await sum(id)).toEqual({ counted: 30 * 60, grace: 0, over: 0, free: 0 });

    // Another tick 5.4 seconds later counts 5 whole seconds, and keeps the 0.4.
    const later = first + 5400;
    await heartbeat(sessions[0]!.id, later);
    await playtimeService.tick(later);
    expect((await sum(id)).counted).toBe(30 * 60 + 5);
    await playtimeService.tick(later + 600);
    expect((await sum(id)).counted).toBe(30 * 60 + 6);
  });

  it('counts only the time inside the windows, and the rest as free', async () => {
    const { id, sessions } = await setup(at(MON, '08:30'));
    const now = at(MON, '09:30');
    await heartbeat(sessions[0]!.id, now);
    await playtimeService.tick(now);
    expect(await sum(id)).toEqual({ counted: 30 * 60, grace: 0, over: 0, free: 30 * 60 });
  });

  it('pools the time of several accounts into one allowance', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'), { accounts: 2 });
    await db
      .update(wardenPlayer)
      .set({ playtimeAllowanceSeconds: H })
      .where(eq(wardenPlayer.userId, id));
    const now = at(MON, '10:45');
    for (const session of sessions) await heartbeat(session.id, now);
    await playtimeService.tick(now);
    // 45 minutes each, 60 minutes of allowance: 60 counted, 30 over.
    expect(await sum(id)).toMatchObject({ counted: H, over: 30 * 60 });
  });

  it('sends what runs out in the last hour to grace', async () => {
    const { id, sessions } = await setup(at(MON, '15:30'));
    await db
      .update(wardenPlayer)
      .set({ playtimeAllowanceSeconds: 30 * 60 })
      .where(eq(wardenPlayer.userId, id));
    const now = at(MON, '16:30');
    await heartbeat(sessions[0]!.id, now);
    await playtimeService.tick(now);
    expect(await sum(id)).toEqual({ counted: 30 * 60, grace: 30 * 60, over: 0, free: 0 });
  });

  it('counts an exempt account as free, and the other account as counted', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'), { accounts: 2 });
    await db.insert(playtimeExemption).values({
      minecraftUuid: sessions[0]!.uuid,
      reason: 'Admin account',
    });
    const now = at(MON, '11:00');
    for (const session of sessions) await heartbeat(session.id, now);
    await playtimeService.tick(now);
    const all = await rows(id);
    const of = (uuid: string) => all.find((row) => row.minecraftUuid === uuid)!;
    expect(of(sessions[0]!.uuid)).toMatchObject({ countedSeconds: 0, freeSeconds: H });
    expect(of(sessions[1]!.uuid)).toMatchObject({ countedSeconds: H, freeSeconds: 0 });
  });

  it('does not count a session that stopped sending heartbeats', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await heartbeat(sessions[0]!.id, at(MON, '10:05'));
    await playtimeService.tick(at(MON, '10:20'));
    expect(await rows(id)).toHaveLength(0);
  });
});

describe('closing a session', () => {
  const close = async (
    id: string,
    session: { id: string; uuid: string },
    endedAt: number,
    startedAt: number,
  ) => {
    await db.transaction((tx) =>
      playtimeLedgerService.settle(
        tx,
        { id: session.id, userId: id, minecraftUuid: session.uuid, startedAt: new Date(startedAt) },
        new Date(endedAt),
      ),
    );
  };

  it('counts up to the end of a session that ended normally', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await close(id, sessions[0]!, at(MON, '10:30'), at(MON, '10:00'));
    expect(await sum(id)).toEqual({ counted: 30 * 60, grace: 0, over: 0, free: 0 });
  });

  it('gives back the time after the last heartbeat', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await heartbeat(sessions[0]!.id, at(MON, '10:30'));
    await playtimeService.tick(at(MON, '10:31'));
    expect((await sum(id)).counted).toBe(31 * 60);
    // The server crashed after the heartbeat at 10:30.
    await close(id, sessions[0]!, at(MON, '10:30'), at(MON, '10:00'));
    expect(await sum(id)).toEqual({ counted: 30 * 60, grace: 0, over: 0, free: 0 });
    // Closing it again changes nothing.
    await close(id, sessions[0]!, at(MON, '10:30'), at(MON, '10:00'));
    expect((await sum(id)).counted).toBe(30 * 60);
  });

  it('takes back grace and over time first', async () => {
    const { id, sessions } = await setup(at(MON, '15:30'));
    await db
      .update(wardenPlayer)
      .set({ playtimeAllowanceSeconds: 30 * 60 })
      .where(eq(wardenPlayer.userId, id));
    await heartbeat(sessions[0]!.id, at(MON, '16:40'));
    await playtimeService.tick(at(MON, '16:40'));
    expect(await sum(id)).toMatchObject({ counted: 30 * 60, grace: 40 * 60 });
    await close(id, sessions[0]!, at(MON, '16:20'), at(MON, '15:30'));
    expect(await sum(id)).toMatchObject({ counted: 30 * 60, grace: 20 * 60 });
  });

  it('gives back free time and splits across a week', async () => {
    const start = at('2026-11-22', '23:00');
    const { id, sessions } = await setup(start);
    await heartbeat(sessions[0]!.id, at('2026-11-23', '01:00'));
    await playtimeService.tick(at('2026-11-23', '01:00'));
    expect((await rows(id)).map((r) => [r.weekStart, r.freeSeconds])).toEqual(
      expect.arrayContaining([
        [MON, H],
        ['2026-11-23', H],
      ]),
    );
    await close(id, sessions[0]!, at('2026-11-22', '23:30'), start);
    expect(await sum(id)).toMatchObject({ free: 30 * 60 });
  });
});

describe('closing through Warden', () => {
  it('gives the time back when a stale session is closed', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await heartbeat(sessions[0]!.id, at(MON, '10:30'));
    await playtimeService.tick(at(MON, '10:31'));
    expect((await sum(id)).counted).toBe(31 * 60);
    // The real clock is long past the heartbeat, so the session is stale.
    await wardenSessionService.closeStale();
    expect(await sum(id)).toEqual({ counted: 30 * 60, grace: 0, over: 0, free: 0 });
  });
});

describe('forward only', () => {
  it('never recounts time after a rule change', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await heartbeat(sessions[0]!.id, at(MON, '11:00'));
    await playtimeService.tick(at(MON, '11:00'));
    expect((await sum(id)).counted).toBe(H);
    // The allowance drops below what was already used: the past stays as it was.
    await db
      .update(wardenPlayer)
      .set({ playtimeAllowanceSeconds: 600 })
      .where(eq(wardenPlayer.userId, id));
    await heartbeat(sessions[0]!.id, at(MON, '11:10'));
    await playtimeService.tick(at(MON, '11:10'));
    expect(await sum(id)).toMatchObject({ counted: H, over: 10 * 60 });
  });

  it('uses a grant from the moment it is given', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await db
      .update(wardenPlayer)
      .set({ playtimeAllowanceSeconds: 600 })
      .where(eq(wardenPlayer.userId, id));
    await heartbeat(sessions[0]!.id, at(MON, '10:30'));
    await playtimeService.tick(at(MON, '10:30'));
    expect(await sum(id)).toMatchObject({ counted: 600, over: 20 * 60 });
    await db
      .insert(playtimeGrant)
      .values({ userId: id, weekStart: MON, seconds: 1200, reason: 'Fix' });
    await heartbeat(sessions[0]!.id, at(MON, '10:40'));
    await playtimeService.tick(at(MON, '10:40'));
    expect(await sum(id)).toMatchObject({ counted: 600 + 600, over: 20 * 60 + 0 });
  });
});

describe('the player view', () => {
  it('shows the week: played, used, remaining and the state', async () => {
    const { id, sessions } = await setup(at(MON, '08:00'));
    const now = at(MON, '10:00');
    await heartbeat(sessions[0]!.id, now);
    await playtimeService.tick(now);
    const view = await playtimeViewService.me(id, now);
    expect(view).toMatchObject({
      mode: 'observe',
      state: 'counting',
      weekStart: MON,
      playedSeconds: 2 * H,
      usedSeconds: H,
      allowanceSeconds: 10 * H,
      remainingSeconds: 9 * H,
      percentUsed: 10,
      windowEndsAt: new Date(at(MON, '17:00')).toISOString(),
      resetsAt: new Date(at('2026-11-23', '00:00')).toISOString(),
      hours: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], ranges: [['09:00', '17:00']] }],
    });
    expect(
      view!.accounts.map(({ uuid, exempt, playedSeconds }) => ({ uuid, exempt, playedSeconds })),
    ).toEqual([{ uuid: sessions[0]!.uuid, exempt: false, playedSeconds: 2 * H }]);
  });

  it('is free outside the windows and unlimited for an exempt account', async () => {
    const { id, sessions } = await setup(at(MON, '18:00'));
    const free = await playtimeViewService.me(id, at(MON, '19:00'));
    expect(free).toMatchObject({
      state: 'free',
      nextWindowStartsAt: new Date(at('2026-11-17', '09:00')).toISOString(),
    });
    await db.insert(playtimeExemption).values({ userId: id, reason: 'Staff' });
    const exempt = await playtimeViewService.me(id, at(MON, '10:00'));
    expect(exempt).toMatchObject({ state: 'unlimited', reason: 'exempt' });
    expect(exempt!.accounts[0]).toMatchObject({ uuid: sessions[0]!.uuid, exempt: true });
  });

  it('ignores a revoked or past exemption', async () => {
    const { id } = await setup(at(MON, '18:00'));
    await db.insert(playtimeExemption).values({ userId: id, reason: 'A', revokedAt: new Date() });
    await db
      .insert(playtimeExemption)
      .values({ userId: id, reason: 'B', until: new Date(at(MON, '09:00')) });
    const context = await playtimeContextService.load(db, id, at(MON, '10:00'));
    expect(context!.exemptUser).toBe(false);
  });
});

describe('deleting an account', () => {
  it('removes its ledger, grants and exemptions', async () => {
    const { id, sessions } = await setup(at(MON, '10:00'));
    await heartbeat(sessions[0]!.id, at(MON, '10:30'));
    await playtimeService.tick(at(MON, '10:30'));
    await db.insert(playtimeGrant).values({ userId: id, weekStart: MON, seconds: 60, reason: 'x' });
    await db.insert(playtimeExemption).values({ userId: id, reason: 'x' });
    await db.delete(user).where(eq(user.id, id));
    expect(await rows(id)).toHaveLength(0);
    expect(await db.select().from(playtimeGrant).where(eq(playtimeGrant.userId, id))).toHaveLength(
      0,
    );
    expect(
      await db
        .select()
        .from(playtimeExemption)
        .where(and(eq(playtimeExemption.userId, id))),
    ).toHaveLength(0);
  });
});
