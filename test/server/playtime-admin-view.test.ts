import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeClosure,
  playtimeLedger,
  playtimeSettings,
  user,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';
import { playtimeSettingsService } from '~~/server/services/playtime/settings';

import { parisInstant } from '#shared/utils/paris-time';
import { isEventsManager, isWardenAdmin } from '#shared/utils/roles';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const H = 3600;
// A Wednesday, 10:00 in Paris: inside the default window.
const NOW = parisInstant('2031-06-04', 10 * 60);
const MON = '2031-06-02';

let counter = 0;
async function player() {
  const id = `view-${String(++counter)}-${String(Date.now())}`;
  await db.insert(user).values({
    id,
    name: `View Tester ${String(counter)}`,
    email: `${id}@epitech.eu`,
    tenantId: EPITECH,
  });
  const uuid = crypto.randomUUID();
  await db
    .insert(minecraftAccount)
    .values({ uuid, userId: id, username: `V${String(counter)}x${String(Date.now() % 10000)}` });
  return {
    id,
    uuid,
    name: `View Tester ${String(counter)}`,
    actor: { source: 'web' as const, userId: id },
  };
}

async function openSession(userId: string, uuid: string, startedAt: number, beat: number) {
  const [session] = await db
    .insert(wardenSession)
    .values({
      minecraftUuid: uuid,
      userId,
      startedAt: new Date(startedAt),
      lastHeartbeatAt: new Date(beat),
    })
    .returning({ id: wardenSession.id });
  return session!.id;
}

async function ledger(
  userId: string,
  uuid: string,
  sessionId: string,
  week: string,
  counted: number,
) {
  await db.insert(playtimeLedger).values({
    sessionId,
    weekStart: week,
    userId,
    minecraftUuid: uuid,
    countedSeconds: counted,
    countedUntil: new Date(NOW),
  });
}

beforeEach(async () => {
  await db.update(playtimeSettings).set({ mode: 'observe' }).where(eq(playtimeSettings.id, 1));
  playtimeSettingsService.clearCache();
});
afterAll(async () => {
  await db.update(playtimeSettings).set({ mode: 'observe' }).where(eq(playtimeSettings.id, 1));
  playtimeSettingsService.clearCache();
});

describe('the Live tab', () => {
  it('lists who is online with their state, and leaves out stale sessions', async () => {
    const a = await player();
    const stale = await player();
    const sid = await openSession(a.id, a.uuid, NOW - 30 * 60_000, NOW - 5000);
    await ledger(a.id, a.uuid, sid, MON, 4 * H);
    await openSession(stale.id, stale.uuid, NOW - 3 * H * 1000, NOW - 10 * 60_000);

    const live = await playtimeAdminViewService.live(NOW);
    const row = live.online.find((r) => r.uuid === a.uuid);
    expect(row).toMatchObject({
      userId: a.id,
      school: 'Epitech',
      state: 'counting',
      usedSeconds: 4 * H,
      allowanceSeconds: 10 * H,
      remainingSeconds: 6 * H,
    });
    expect(live.online.some((r) => r.uuid === stale.uuid)).toBe(false);
    expect(live.windowEndsAt).toBe(new Date(parisInstant('2031-06-04', 17 * 60)).toISOString());
  });

  it('marks a player over the limit as out of time, and counts them as having reached it', async () => {
    const p = await player();
    const sid = await openSession(p.id, p.uuid, NOW - 60_000, NOW - 1000);
    await ledger(p.id, p.uuid, sid, MON, 10 * H);
    const live = await playtimeAdminViewService.live(NOW);
    expect(live.online.find((r) => r.uuid === p.uuid)?.state).toBe('blocked');
    expect(live.week.weekStart).toBe(MON);
    expect(live.week.reachedLimit).toBeGreaterThanOrEqual(1);
    expect(live.week.countedSeconds).toBeGreaterThanOrEqual(10 * H);
  });

  it('shows an exempt account as unlimited', async () => {
    const p = await player();
    await openSession(p.id, p.uuid, NOW - 60_000, NOW - 1000);
    await playtimeAdminService.addExemption(p.actor, { userId: p.id, reason: 'Staff' });
    const row = (await playtimeAdminViewService.live(NOW)).online.find((r) => r.uuid === p.uuid);
    expect(row).toMatchObject({ state: 'unlimited', reason: 'exempt' });
  });
});

describe("a player's panel", () => {
  it('is null for an unknown player', async () => {
    expect(await playtimeAdminViewService.player('nobody-here', NOW)).toBeNull();
  });

  it('shows overrides against what each setting would otherwise be', async () => {
    const p = await player();
    await playtimeAdminService.setPlayerOverrides(p.actor, p.id, {
      allowanceSeconds: 5 * H,
      graceSeconds: null,
      warningsMinutes: null,
    });
    const view = await playtimeAdminViewService.player(p.id, NOW);
    expect(view?.overrides).toEqual({
      allowanceSeconds: 5 * H,
      graceSeconds: null,
      warningsMinutes: null,
    });
    expect(view?.inherited.allowanceSeconds).toBe(10 * H);
    expect(view?.allowanceSeconds).toBe(5 * H);
    expect(view?.school).toBe('Epitech');
  });

  it('lists this week’s grants and exemptions with who made them, and drops revoked ones', async () => {
    const p = await player();
    const grant = await playtimeAdminService.addGrant(
      p.actor,
      p.id,
      { seconds: 1800, reason: 'Tournament' },
      NOW,
    );
    const second = await playtimeAdminService.addGrant(
      p.actor,
      p.id,
      { seconds: 600, reason: 'Oops' },
      NOW,
    );
    await playtimeAdminService.revokeGrant(p.actor, p.id, second.id);
    const exemption = await playtimeAdminService.addExemption(
      p.actor,
      { minecraftUuid: p.uuid, reason: 'Crew account' },
      p.id,
    );
    const view = await playtimeAdminViewService.player(p.id, NOW);
    expect(view?.grants).toMatchObject([
      {
        id: grant.id,
        seconds: 1800,
        reason: 'Tournament',
        grantedByName: p.name,
      },
    ]);
    expect(view?.allowanceSeconds).toBe(10 * H + 1800);
    expect(view?.exemptions).toMatchObject([
      { id: exemption.id, scope: 'minecraft', reason: 'Crew account' },
    ]);
    await playtimeAdminService.revokeExemption(p.actor, exemption.id, p.id);
    expect((await playtimeAdminViewService.player(p.id, NOW))?.exemptions).toEqual([]);
  });

  it('gives eight weeks, oldest first, with counted time, allowance and closed weeks', async () => {
    const p = await player();
    const sid = await openSession(p.id, p.uuid, NOW - 60_000, NOW - 1000);
    await ledger(p.id, p.uuid, sid, MON, 3 * H);
    await ledger(p.id, p.uuid, sid, '2031-05-19', 7 * H);
    const closure = await playtimeAdminService.createClosure(p.actor, {
      label: 'View break',
      startsOn: '2031-05-26',
      endsOn: '2031-06-01',
      tenantIds: null,
    });
    const view = await playtimeAdminViewService.player(p.id, NOW);
    expect(view?.weeks).toHaveLength(8);
    expect(view?.weeks.at(-1)).toMatchObject({
      weekStart: MON,
      countedSeconds: 3 * H,
      closed: false,
    });
    expect(view?.weeks[0]?.weekStart).toBe('2031-04-14');
    expect(view?.weeks.find((w) => w.weekStart === '2031-05-19')?.countedSeconds).toBe(7 * H);
    expect(view?.weeks.find((w) => w.weekStart === '2031-05-26')?.closed).toBe(true);
    await db.delete(playtimeClosure).where(eq(playtimeClosure.id, closure.id));
  });
});

describe('who may change what', () => {
  it('refuses to exempt or revoke across players, and for unknown players', async () => {
    const a = await player();
    const b = await player();
    await expect(
      playtimeAdminService.addExemption(a.actor, { minecraftUuid: b.uuid, reason: 'x' }, a.id),
    ).rejects.toMatchObject({ status: 404 });
    const own = await playtimeAdminService.addExemption(
      b.actor,
      { userId: b.id, reason: 'x' },
      b.id,
    );
    await expect(playtimeAdminService.revokeExemption(a.actor, own.id, a.id)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      playtimeAdminService.addGrant(a.actor, 'nobody-here', { seconds: 60, reason: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      playtimeAdminService.setPlayerOverrides(a.actor, 'nobody-here', {
        allowanceSeconds: null,
        graceSeconds: null,
        warningsMinutes: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await db
      .update(wardenPlayer)
      .set({ playtimeAllowanceSeconds: null })
      .where(eq(wardenPlayer.userId, a.id));
  });

  it('lets events managers give extra time but not change rules', () => {
    for (const role of ['events-manager', 'warden-admin', 'admin']) {
      expect(isWardenAdmin(role) || isEventsManager(role), role).toBe(true);
    }
    expect(isWardenAdmin('events-manager')).toBe(false);
    expect(isWardenAdmin(null) || isEventsManager('economy-admin')).toBe(false);
  });

  it('guards every admin route with the Warden admin check, grants with the granter check, the reset with the admin check', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    const found = files(join(process.cwd(), 'server/api/playtime/admin'));
    expect(found.length).toBeGreaterThan(10);
    for (const path of found) {
      // The resets are for site admins only: the routes above the Warden admins.
      const guard = path.includes('/grants/')
        ? 'requirePlaytimeGranter'
        : path.endsWith('/reset.post.ts') || path.endsWith('/reset-all.post.ts')
          ? 'requireAdmin'
          : 'requireWardenAdmin';
      expect(readFileSync(path, 'utf8'), path).toMatch(
        new RegExp(
          `defineEventHandler\\(async \\(event\\) => \\{\\n\\s+(const \\w+ = )?await ${guard}\\(event\\);`,
        ),
      );
    }
  });
});
