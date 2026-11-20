import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import {
  event as eventTable,
  minecraftAccount,
  playtimeClosure,
  playtimeExemption,
  playtimeGrant,
  playtimeLedger,
  playtimeNotice,
  playtimeSchool,
  playtimeSettings,
  user,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';
import { wardenPlayerService } from '~~/server/services/warden/players';

import { playtimeSettingsService } from './settings';

import type {
  PlaytimeClosureBody,
  PlaytimeClosureRow,
  PlaytimeExemptionBody,
  PlaytimeGrantBody,
  PlaytimePlayerOverridesBody,
  PlaytimeSchoolBody,
  PlaytimeSettingsPatch,
  PlaytimeSettingsResponse,
} from '#shared/schemas/playtime';
import { PLAYTIME_RESET_ALL_CONFIRM, PLAYTIME_RESET_CONFIRM } from '#shared/schemas/playtime';
import { mondayOf, parisDate, addDays } from '#shared/utils/paris-time';
import { SCHOOLS } from '#shared/utils/schools';

// What admins change: the rules, a school's, a player's, closures, exemptions and grants. Each
// change is audited in the same transaction (docs/playtime.md). Who may do what is decided by the
// routes: rules, closures and exemptions need a site admin or `warden-admin`, and grants also an
// events manager.

type Actor = { source: 'web'; userId: string };

function problem(status: number, statusText: string): never {
  throw createError({ status, statusText, data: { problem: statusText } });
}

/** The rules and the mode as the admin screen shows them, with every school's overrides. */
async function settings(): Promise<PlaytimeSettingsResponse> {
  const current = await playtimeSettingsService.get();
  return {
    mode: current.mode,
    flagEnabled: await flagService.isEnabled('playtime'),
    ...current.config,
    schools: Object.entries(SCHOOLS).map(([tenantId, name]) => {
      const o = current.schools.get(tenantId);
      return {
        tenantId,
        name,
        overrides: {
          allowanceSeconds: o?.allowanceSeconds ?? null,
          schedule: o?.schedule ?? null,
          graceSeconds: o?.graceSeconds ?? null,
          warningsMinutes: o?.warningsMinutes ?? null,
          startWarningsMinutes: o?.startWarningsMinutes ?? null,
        },
      };
    }),
  };
}

/** Every closure, the latest start first, with the event it follows and who made it. */
async function closures(): Promise<PlaytimeClosureRow[]> {
  const rows = await db
    .select({
      closure: playtimeClosure,
      eventName: eventTable.name,
      createdByName: user.name,
    })
    .from(playtimeClosure)
    .leftJoin(eventTable, eq(eventTable.id, playtimeClosure.eventId))
    .leftJoin(user, eq(user.id, playtimeClosure.createdByUserId))
    .orderBy(desc(playtimeClosure.startsOn), asc(playtimeClosure.id));
  return rows.map(({ closure, eventName, createdByName }) => ({
    id: closure.id,
    label: closure.label,
    startsOn: closure.startsOn,
    endsOn: closure.endsOn,
    tenantIds: closure.tenantIds,
    event:
      closure.eventId && closure.eventScope
        ? { id: closure.eventId, name: eventName ?? '', scope: closure.eventScope }
        : null,
    createdByName,
    createdAt: closure.createdAt.toISOString(),
  }));
}

/** Changes the global rules and the mode. A field left out is unchanged. */
async function updateSettings(actor: Actor, patch: PlaytimeSettingsPatch) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(playtimeSettings).where(eq(playtimeSettings.id, 1));
    await tx
      .update(playtimeSettings)
      .set({ ...patch, updatedAt: new Date(), updatedByUserId: actor.userId })
      .where(eq(playtimeSettings.id, 1));
    await auditService.record(tx, {
      action: 'minecraft.playtime.settings',
      actor,
      data: { scope: 'global', before: pick(before, patch), after: patch },
    });
  });
  playtimeSettingsService.clearCache();
}

async function requireUser(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
) {
  const [found] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!found) problem(404, 'notFound');
}

function pick(row: object | undefined, patch: object): Record<string, unknown> {
  const source = (row ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.keys(patch).map((key) => [key, source[key]]));
}

/** Sets a school's overrides. A null field inherits the global value. */
async function setSchool(actor: Actor, tenantId: string, body: PlaytimeSchoolBody) {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(playtimeSchool)
      .where(eq(playtimeSchool.tenantId, tenantId));
    await tx
      .insert(playtimeSchool)
      .values({ tenantId, ...body, updatedByUserId: actor.userId })
      .onConflictDoUpdate({
        target: playtimeSchool.tenantId,
        set: { ...body, updatedAt: new Date(), updatedByUserId: actor.userId },
      });
    await auditService.record(tx, {
      action: 'minecraft.playtime.school',
      actor,
      data: { tenantId, before: before ?? null, after: body },
    });
  });
  playtimeSettingsService.clearCache();
}

/** Removes a school's overrides, so it follows the global rules again. */
async function clearSchool(actor: Actor, tenantId: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .delete(playtimeSchool)
      .where(eq(playtimeSchool.tenantId, tenantId))
      .returning();
    if (!before) return;
    await auditService.record(tx, {
      action: 'minecraft.playtime.school',
      actor,
      data: { tenantId, before, after: null },
    });
  });
  playtimeSettingsService.clearCache();
}

/** Sets one player's allowance, grace length and warning times. A null field inherits. */
async function setPlayerOverrides(actor: Actor, userId: string, body: PlaytimePlayerOverridesBody) {
  await db.transaction(async (tx) => {
    await requireUser(tx, userId);
    await wardenPlayerService.ensure(tx, userId);
    const [before] = await tx
      .select({
        allowanceSeconds: wardenPlayer.playtimeAllowanceSeconds,
        graceSeconds: wardenPlayer.playtimeGraceSeconds,
        warningsMinutes: wardenPlayer.playtimeWarningsMinutes,
      })
      .from(wardenPlayer)
      .where(eq(wardenPlayer.userId, userId));
    await tx
      .update(wardenPlayer)
      .set({
        playtimeAllowanceSeconds: body.allowanceSeconds,
        playtimeGraceSeconds: body.graceSeconds,
        playtimeWarningsMinutes: body.warningsMinutes,
      })
      .where(eq(wardenPlayer.userId, userId));
    await auditService.record(tx, {
      action: 'minecraft.playtime.settings',
      actor,
      targetUserId: userId,
      data: { scope: 'player', before: before ?? null, after: body },
    });
  });
}

/** Adds a closure. Nothing counts on its days, for everyone or for the schools it names. */
async function createClosure(actor: Actor, body: PlaytimeClosureBody) {
  return db.transaction(async (tx) => {
    const [closure] = await tx
      .insert(playtimeClosure)
      .values({ ...body, createdByUserId: actor.userId })
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.playtime.closure',
      actor,
      data: { change: 'create', closure },
    });
    return closure!;
  });
}

/** "Skip this week": a closure for this Monday to Sunday, for everyone. */
async function skipWeek(actor: Actor, now = Date.now()) {
  const monday = mondayOf(parisDate(now));
  return createClosure(actor, {
    label: 'Skipped week',
    startsOn: monday,
    endsOn: addDays(monday, 6),
    tenantIds: null,
  });
}

/** Changes a closure. A closure made for an event follows the event and can't be edited here. */
async function updateClosure(actor: Actor, id: number, body: PlaytimeClosureBody) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(playtimeClosure).where(eq(playtimeClosure.id, id));
    if (!before) problem(404, 'notFound');
    if (before.eventId) problem(409, 'eventClosure');
    await tx.update(playtimeClosure).set(body).where(eq(playtimeClosure.id, id));
    await auditService.record(tx, {
      action: 'minecraft.playtime.closure',
      actor,
      data: { change: 'update', before, after: body },
    });
  });
}

async function deleteClosure(actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(playtimeClosure).where(eq(playtimeClosure.id, id));
    if (!before) problem(404, 'notFound');
    if (before.eventId) problem(409, 'eventClosure');
    await tx.delete(playtimeClosure).where(eq(playtimeClosure.id, id));
    await auditService.record(tx, {
      action: 'minecraft.playtime.closure',
      actor,
      data: { change: 'delete', closure: before },
    });
  });
}

/** Takes an LNB account, or one Minecraft account, out of the limit. */
async function addExemption(actor: Actor, body: PlaytimeExemptionBody, forUserId?: string) {
  return db.transaction(async (tx) => {
    let targetUserId = body.userId ?? null;
    if (body.userId) await requireUser(tx, body.userId);
    if (body.minecraftUuid) {
      const [account] = await tx
        .select({ userId: minecraftAccount.userId })
        .from(minecraftAccount)
        .where(eq(minecraftAccount.uuid, body.minecraftUuid));
      // With `forUserId`, the account has to be that player's.
      if (!account || (forUserId !== undefined && account.userId !== forUserId)) {
        problem(404, 'notFound');
      }
      targetUserId = account.userId;
    }
    const [exemption] = await tx
      .insert(playtimeExemption)
      .values({
        userId: body.userId ?? null,
        minecraftUuid: body.minecraftUuid ?? null,
        reason: body.reason,
        until: body.until ? new Date(body.until) : null,
        setByUserId: actor.userId,
      })
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.playtime.exemption',
      actor,
      targetUserId,
      targetMinecraftUuid: body.minecraftUuid ?? null,
      data: { change: 'add', exemption },
    });
    return exemption!;
  });
}

async function revokeExemption(actor: Actor, id: number, forUserId?: string) {
  await db.transaction(async (tx) => {
    if (forUserId !== undefined) {
      const [owned] = await tx
        .select({ userId: playtimeExemption.userId, uuid: playtimeExemption.minecraftUuid })
        .from(playtimeExemption)
        .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, playtimeExemption.minecraftUuid))
        .where(eq(playtimeExemption.id, id));
      const owner = owned?.userId ?? null;
      if (!owned) problem(404, 'notFound');
      if (owner !== null && owner !== forUserId) problem(404, 'notFound');
      if (owner === null) {
        const [account] = await tx
          .select({ userId: minecraftAccount.userId })
          .from(minecraftAccount)
          .where(eq(minecraftAccount.uuid, owned.uuid!));
        if (account?.userId !== forUserId) problem(404, 'notFound');
      }
    }
    const [exemption] = await tx
      .update(playtimeExemption)
      .set({ revokedAt: new Date() })
      .where(and(eq(playtimeExemption.id, id), isNull(playtimeExemption.revokedAt)))
      .returning();
    if (!exemption) problem(404, 'notFound');
    await auditService.record(tx, {
      action: 'minecraft.playtime.exemption',
      actor,
      targetUserId: exemption.userId,
      targetMinecraftUuid: exemption.minecraftUuid,
      data: { change: 'revoke', exemption },
    });
  });
}

/** Adds minutes to one player's allowance for a week. It ends with the week. */
async function addGrant(actor: Actor, userId: string, body: PlaytimeGrantBody, now = Date.now()) {
  const weekStart = mondayOf(body.weekStart ?? parisDate(now));
  return db.transaction(async (tx) => {
    await requireUser(tx, userId);
    const [grant] = await tx
      .insert(playtimeGrant)
      .values({
        userId,
        weekStart,
        seconds: body.seconds,
        reason: body.reason,
        grantedByUserId: actor.userId,
      })
      .returning();
    await auditService.record(tx, {
      action: 'minecraft.playtime.grant',
      actor,
      targetUserId: userId,
      data: { change: 'add', grant },
    });
    return grant!;
  });
}

async function revokeGrant(actor: Actor, userId: string, id: number) {
  await db.transaction(async (tx) => {
    const [grant] = await tx
      .update(playtimeGrant)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(playtimeGrant.id, id),
          eq(playtimeGrant.userId, userId),
          isNull(playtimeGrant.revokedAt),
        ),
      )
      .returning();
    if (!grant) problem(404, 'notFound');
    await auditService.record(tx, {
      action: 'minecraft.playtime.grant',
      actor,
      targetUserId: userId,
      data: { change: 'revoke', grant },
    });
  });
}

/**
 * Wipes the time counted so far and the warnings, so every player starts the week with the whole
 * allowance. The rules, schools, closures, exemptions and grants stay: they are what admins set up.
 * A session still open keeps its row with the counters at zero: the row says where the counting
 * stopped, and without it the next tick would count the whole session again. Site admins only,
 * after typing the confirmation.
 */
async function reset(actor: Actor, confirm: string) {
  if (confirm.trim().toLowerCase() !== PLAYTIME_RESET_CONFIRM) problem(400, 'confirmMismatch');
  await db.transaction(async (tx) => {
    const open = tx
      .select({ id: wardenSession.id })
      .from(wardenSession)
      .where(isNull(wardenSession.endedAt));
    const ledger = await tx
      .delete(playtimeLedger)
      .where(notInArray(playtimeLedger.sessionId, open))
      .returning({ id: sql`1` });
    const zeroed = await tx
      .update(playtimeLedger)
      .set({ countedSeconds: 0, graceSeconds: 0, overSeconds: 0, freeSeconds: 0 })
      .where(inArray(playtimeLedger.sessionId, open))
      .returning({ id: sql`1` });
    const notices = await tx.delete(playtimeNotice).returning({ id: sql`1` });
    await auditService.record(tx, {
      action: 'minecraft.playtime.reset',
      actor,
      data: { ledger: ledger.length + zeroed.length, notices: notices.length },
    });
  });
}

/**
 * The full reset: every session (open ones too) with its counted time and warnings, the total of
 * every Minecraft account and the total kept from taken-over accounts. Rules, schools, closures,
 * exemptions and grants stay, and so do bans. Players online are told by their next heartbeat that
 * the site doesn't know their session, so the server treats it as ended. Site admins only, after
 * typing the confirmation.
 */
async function resetAll(actor: Actor, confirm: string) {
  if (confirm.trim().toLowerCase() !== PLAYTIME_RESET_ALL_CONFIRM) problem(400, 'confirmMismatch');
  await db.transaction(async (tx) => {
    // The ledger and the notices go with their session (on delete cascade).
    const sessions = await tx.delete(wardenSession).returning({ id: wardenSession.id });
    const accounts = await tx
      .update(minecraftAccount)
      .set({ playtimeSeconds: 0 })
      .where(ne(minecraftAccount.playtimeSeconds, 0))
      .returning({ uuid: minecraftAccount.uuid });
    const players = await tx
      .update(wardenPlayer)
      .set({ transferredPlaytimeSeconds: 0 })
      .where(ne(wardenPlayer.transferredPlaytimeSeconds, 0))
      .returning({ userId: wardenPlayer.userId });
    await auditService.record(tx, {
      action: 'minecraft.playtime.resetAll',
      actor,
      data: { sessions: sessions.length, accounts: accounts.length, players: players.length },
    });
  });
}

export const playtimeAdminService = {
  reset,
  resetAll,
  settings,
  closures,
  updateSettings,
  setSchool,
  clearSchool,
  setPlayerOverrides,
  createClosure,
  skipWeek,
  updateClosure,
  deleteClosure,
  addExemption,
  revokeExemption,
  addGrant,
  revokeGrant,
};
