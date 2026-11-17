import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeClosure,
  playtimeSettings,
  user,
  wardenAudit,
} from '~~/server/db/schema';
import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeContextService } from '~~/server/services/playtime/context';
import { playtimeSettingsService } from '~~/server/services/playtime/settings';

import { DEFAULT_PLAYTIME_SCHEDULE } from '#shared/schemas/playtime';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const EARTSUP = '791f2edf-38ab-4c6c-b323-ea94dd988fde';
const NOW = Date.parse('2026-11-18T10:00:00Z'); // A Wednesday.

let counter = 0;
async function account(tenantId = EPITECH) {
  const id = `pt-admin-${String(++counter)}-${String(Date.now())}`;
  await db.insert(user).values({ id, name: 'Admin Tester', email: `${id}@epitech.eu`, tenantId });
  return { id, actor: { source: 'web' as const, userId: id } };
}

async function audits(
  action:
    | 'playtime.settings'
    | 'playtime.school'
    | 'playtime.closure'
    | 'playtime.exemption'
    | 'playtime.grant',
  userId: string,
) {
  return db
    .select()
    .from(wardenAudit)
    .where(eq(wardenAudit.actorUserId, userId))
    .then((rows) => rows.filter((row) => row.action === action));
}

afterAll(async () => {
  // The settings row is shared by every test: put it back as the migration made it.
  await db
    .update(playtimeSettings)
    .set({ mode: 'observe', allowanceSeconds: 36_000, schedule: DEFAULT_PLAYTIME_SCHEDULE })
    .where(eq(playtimeSettings.id, 1));
  playtimeSettingsService.clearCache();
});

describe('the rules', () => {
  it('starts in observe, with the starting values', async () => {
    playtimeSettingsService.clearCache();
    const settings = await playtimeSettingsService.get();
    expect(settings.mode).toBe('observe');
    expect(settings.config).toEqual({
      allowanceSeconds: 36_000,
      schedule: DEFAULT_PLAYTIME_SCHEDULE,
      graceSeconds: 3600,
      warningsMinutes: [30, 10, 5, 1],
      startWarningsMinutes: [5, 1],
    });
  });

  it('changes the global rules, audits them, and applies them at once', async () => {
    const { actor, id } = await account();
    await playtimeAdminService.updateSettings(actor, { allowanceSeconds: 7200, mode: 'enforce' });
    const settings = await playtimeSettingsService.get();
    expect(settings.mode).toBe('enforce');
    expect(settings.config.allowanceSeconds).toBe(7200);
    const [audit] = await audits('playtime.settings', id);
    expect(audit?.data).toMatchObject({
      scope: 'global',
      before: { allowanceSeconds: 36_000, mode: 'observe' },
      after: { allowanceSeconds: 7200, mode: 'enforce' },
    });
    await playtimeAdminService.updateSettings(actor, { allowanceSeconds: 36_000, mode: 'observe' });
  });

  it('lets a school replace fields, and a player override some of them', async () => {
    const { id, actor } = await account(EARTSUP);
    await playtimeAdminService.setSchool(actor, EARTSUP, {
      allowanceSeconds: 5 * 3600,
      schedule: { ...DEFAULT_PLAYTIME_SCHEDULE, mon: [] },
      graceSeconds: null,
      warningsMinutes: null,
      startWarningsMinutes: null,
    });
    await playtimeAdminService.setPlayerOverrides(actor, id, {
      allowanceSeconds: null,
      graceSeconds: 600,
      warningsMinutes: [2],
    });
    const context = await playtimeContextService.load(db, id, NOW);
    expect(context!.config).toMatchObject({
      allowanceSeconds: 5 * 3600,
      graceSeconds: 600,
      warningsMinutes: [2],
      startWarningsMinutes: [5, 1],
    });
    expect(context!.config.schedule.mon).toEqual([]);

    // Another school is not affected.
    const other = await account(EPITECH);
    const otherContext = await playtimeContextService.load(db, other.id, NOW);
    expect(otherContext!.config.allowanceSeconds).toBe(36_000);

    await playtimeAdminService.clearSchool(actor, EARTSUP);
    const back = await playtimeContextService.load(db, id, NOW);
    expect(back!.config.allowanceSeconds).toBe(36_000);
    expect((await audits('playtime.school', id)).length).toBe(2);
  });
});

describe('closures', () => {
  it('apply to everyone or to the schools named', async () => {
    const { id, actor } = await account(EPITECH);
    const closure = await playtimeAdminService.createClosure(actor, {
      label: 'Winter break',
      startsOn: '2026-12-21',
      endsOn: '2027-01-03',
      tenantIds: [EARTSUP],
    });
    const forOther = await playtimeContextService.load(db, id, Date.parse('2026-12-22T10:00:00Z'));
    expect(forOther!.closures).not.toContainEqual({ startsOn: '2026-12-21', endsOn: '2027-01-03' });

    await playtimeAdminService.updateClosure(actor, closure.id, {
      label: 'Winter break',
      startsOn: '2026-12-21',
      endsOn: '2027-01-03',
      tenantIds: null,
    });
    const everyone = await playtimeContextService.load(db, id, Date.parse('2026-12-22T10:00:00Z'));
    expect(everyone!.closures).toContainEqual({ startsOn: '2026-12-21', endsOn: '2027-01-03' });

    await playtimeAdminService.deleteClosure(actor, closure.id);
    expect(
      await db.select().from(playtimeClosure).where(eq(playtimeClosure.id, closure.id)),
    ).toHaveLength(0);
    expect(
      (await audits('playtime.closure', id)).map((row) => (row.data as { change: string }).change),
    ).toEqual(['create', 'update', 'delete']);
  });

  it('skips the current week, Monday to Sunday', async () => {
    const { actor } = await account();
    const closure = await playtimeAdminService.skipWeek(actor, NOW);
    expect(closure).toMatchObject({ startsOn: '2026-11-16', endsOn: '2026-11-22' });
    await playtimeAdminService.deleteClosure(actor, closure.id);
  });

  it('answers 404 for a closure that does not exist', async () => {
    const { actor } = await account();
    await expect(
      playtimeAdminService.updateClosure(actor, 999_999, {
        label: 'x',
        startsOn: '2026-11-16',
        endsOn: '2026-11-16',
        tenantIds: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('exemptions and grants', () => {
  it('exempts an LNB account or one Minecraft account, and revokes', async () => {
    const { id, actor } = await account();
    const uuid = crypto.randomUUID();
    await db
      .insert(minecraftAccount)
      .values({ uuid, userId: id, username: `Ex${String(counter)}` });
    const byAccount = await playtimeAdminService.addExemption(actor, {
      minecraftUuid: uuid,
      reason: 'Staff account',
    });
    let context = await playtimeContextService.load(db, id, NOW);
    expect(context!.exemptUuids.has(uuid)).toBe(true);
    expect(context!.exemptUser).toBe(false);

    const byUser = await playtimeAdminService.addExemption(actor, { userId: id, reason: 'Admin' });
    context = await playtimeContextService.load(db, id, NOW);
    expect(context!.exemptUser).toBe(true);

    await playtimeAdminService.revokeExemption(actor, byUser.id);
    await playtimeAdminService.revokeExemption(actor, byAccount.id);
    context = await playtimeContextService.load(db, id, NOW);
    expect(context!.exemptUser).toBe(false);
    expect(context!.exemptUuids.size).toBe(0);
    await expect(playtimeAdminService.revokeExemption(actor, byUser.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    const [added] = await audits('playtime.exemption', id);
    expect(added?.targetMinecraftUuid).toBe(uuid);
  });

  it('grants time for a week, and revokes it', async () => {
    const { id, actor } = await account();
    const grant = await playtimeAdminService.addGrant(
      actor,
      id,
      { seconds: 1800, reason: 'Server was down' },
      NOW,
    );
    expect(grant.weekStart).toBe('2026-11-16');
    let context = await playtimeContextService.load(db, id, NOW);
    expect(context!.grantedByWeek).toEqual({ '2026-11-16': 1800 });

    await playtimeAdminService.revokeGrant(actor, id, grant.id);
    context = await playtimeContextService.load(db, id, NOW);
    expect(context!.grantedByWeek).toEqual({});
  });

  it('refuses a grant over 5 hours, in the database too', async () => {
    const { id, actor } = await account();
    await expect(
      playtimeAdminService.addGrant(actor, id, { seconds: 18_001, reason: 'Too much' }, NOW),
    ).rejects.toThrow();
  });
});
