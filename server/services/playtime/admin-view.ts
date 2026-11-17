import { and, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeClosure,
  playtimeExemption,
  playtimeGrant,
  playtimeLedger,
  user,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import { SESSION_TIMEOUT_MS } from '~~/server/services/warden/rules';

import { playtimeContextService } from './context';
import { playtimeLedgerService } from './ledger';
import { evaluate, resolveConfig, weekStart } from './rules';
import { playtimeSettingsService } from './settings';
import { playtimeStateService } from './state';
import { playtimeViewService } from './view';

import type { PlaytimeAdminPlayer, PlaytimeLive } from '#shared/schemas/playtime';
import { addDays } from '#shared/utils/paris-time';
import { schoolForTenant } from '#shared/utils/schools';

// What the admin screens read about players: who is online and where they stand (the Live tab),
// and one player's week, overrides, exemptions, grants and the last eight weeks (the player panel).

const iso = (instant: number | null) => (instant === null ? null : new Date(instant).toISOString());

/** The Minecraft accounts online now, each with its state, and the week's totals. */
async function live(now = Date.now()): Promise<PlaytimeLive> {
  const mode = await playtimeSettingsService.activeMode();
  const settings = await playtimeSettingsService.get();
  const week = weekStart(now);

  const sessions = await db
    .select({
      userId: wardenSession.userId,
      uuid: wardenSession.minecraftUuid,
      username: minecraftAccount.username,
      startedAt: wardenSession.startedAt,
      name: user.name,
      tenantId: user.tenantId,
    })
    .from(wardenSession)
    .innerJoin(minecraftAccount, eq(minecraftAccount.uuid, wardenSession.minecraftUuid))
    .innerJoin(user, eq(user.id, wardenSession.userId))
    .where(
      and(
        isNull(wardenSession.endedAt),
        gt(wardenSession.lastHeartbeatAt, new Date(now - SESSION_TIMEOUT_MS)),
      ),
    )
    .orderBy(wardenSession.startedAt);

  const online: PlaytimeLive['online'] = [];
  for (const [userId, group] of Map.groupBy(sessions, (session) => session.userId)) {
    const states = await playtimeStateService.forAccounts(
      db,
      userId,
      group.map((session) => session.uuid),
      now,
      mode,
    );
    for (const session of group) {
      const state = states.get(session.uuid)?.evaluation;
      if (!state) continue;
      online.push({
        userId,
        name: session.name,
        school: schoolForTenant(session.tenantId) ?? null,
        uuid: session.uuid,
        username: session.username,
        state: state.state,
        reason: state.reason,
        usedSeconds: state.usedSeconds,
        allowanceSeconds: state.allowanceSeconds,
        remainingSeconds: state.remainingSeconds,
        graceEndsAt: iso(state.graceEndsAt),
        startedAt: session.startedAt.toISOString(),
      });
    }
  }

  // The default schedule's window, for the banner.
  const window = evaluate({
    now,
    mode: 'enforce',
    config: settings.config,
    closures: [],
    usedSeconds: 0,
    grantedSeconds: 0,
    exempt: false,
  });

  const totals = await db
    .select({
      userId: playtimeLedger.userId,
      counted: sql<number>`sum(${playtimeLedger.countedSeconds})::int`,
      grace: sql<number>`sum(${playtimeLedger.graceSeconds})::int`,
      over: sql<number>`sum(${playtimeLedger.overSeconds})::int`,
      free: sql<number>`sum(${playtimeLedger.freeSeconds})::int`,
    })
    .from(playtimeLedger)
    .where(eq(playtimeLedger.weekStart, week))
    .groupBy(playtimeLedger.userId);
  let reachedLimit = 0;
  for (const total of totals) {
    if (total.grace > 0 || total.over > 0) {
      reachedLimit++;
      continue;
    }
    if (total.counted <= 0) continue;
    const context = await playtimeContextService.load(db, total.userId, now);
    if (!context) continue;
    const allowance = context.config.allowanceSeconds + (context.grantedByWeek[week] ?? 0);
    if (total.counted >= allowance) reachedLimit++;
  }

  return {
    mode,
    windowEndsAt: iso(window.windowEndsAt),
    nextWindowStartsAt: iso(window.nextWindowStartsAt),
    online,
    week: {
      weekStart: week,
      countedSeconds: totals.reduce((sum, total) => sum + total.counted, 0),
      players: totals.filter((total) => total.counted + total.grace + total.over + total.free > 0)
        .length,
      reachedLimit,
      usedGrace: totals.filter((total) => total.grace > 0).length,
    },
  };
}

/** One player's playtime for the admin panel, or null for an unknown player. */
async function player(userId: string, now = Date.now()): Promise<PlaytimeAdminPlayer | null> {
  const me = await playtimeViewService.me(userId, now);
  if (!me) return null;
  const settings = await playtimeSettingsService.get();
  const [row] = await db
    .select({
      tenantId: user.tenantId,
      allowanceSeconds: wardenPlayer.playtimeAllowanceSeconds,
      graceSeconds: wardenPlayer.playtimeGraceSeconds,
      warningsMinutes: wardenPlayer.playtimeWarningsMinutes,
    })
    .from(user)
    .leftJoin(wardenPlayer, eq(wardenPlayer.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) return null;
  const inherited = resolveConfig(settings.config, settings.schools.get(row.tenantId));

  const setBy = alias(user, 'set_by');
  const exemptions = await db
    .select({
      id: playtimeExemption.id,
      userId: playtimeExemption.userId,
      username: minecraftAccount.username,
      reason: playtimeExemption.reason,
      until: playtimeExemption.until,
      setByName: setBy.name,
      createdAt: playtimeExemption.createdAt,
    })
    .from(playtimeExemption)
    .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, playtimeExemption.minecraftUuid))
    .leftJoin(setBy, eq(setBy.id, playtimeExemption.setByUserId))
    .where(
      and(
        isNull(playtimeExemption.revokedAt),
        // ISO string: node-postgres writes raw Date parameters in local time.
        or(
          isNull(playtimeExemption.until),
          sql`${playtimeExemption.until} > ${new Date(now).toISOString()}::timestamp`,
        ),
        or(
          eq(playtimeExemption.userId, userId),
          inArray(
            playtimeExemption.minecraftUuid,
            db
              .select({ uuid: minecraftAccount.uuid })
              .from(minecraftAccount)
              .where(eq(minecraftAccount.userId, userId)),
          ),
        ),
      ),
    )
    .orderBy(desc(playtimeExemption.createdAt));

  const grantedBy = alias(user, 'granted_by');
  const grants = await db
    .select({
      id: playtimeGrant.id,
      weekStart: playtimeGrant.weekStart,
      seconds: playtimeGrant.seconds,
      reason: playtimeGrant.reason,
      grantedByName: grantedBy.name,
      createdAt: playtimeGrant.createdAt,
    })
    .from(playtimeGrant)
    .leftJoin(grantedBy, eq(grantedBy.id, playtimeGrant.grantedByUserId))
    .where(and(eq(playtimeGrant.userId, userId), isNull(playtimeGrant.revokedAt)))
    .orderBy(desc(playtimeGrant.createdAt));

  const current = weekStart(now);
  const mondays = Array.from({ length: 8 }, (_, i) => addDays(current, -7 * (7 - i)));
  const counted = await playtimeLedgerService.usedByWeek(db, userId, mondays);
  const closures = await db
    .select({ startsOn: playtimeClosure.startsOn, endsOn: playtimeClosure.endsOn })
    .from(playtimeClosure)
    .where(
      and(
        lte(playtimeClosure.startsOn, addDays(current, 6)),
        gte(playtimeClosure.endsOn, mondays[0]!),
        or(
          isNull(playtimeClosure.tenantIds),
          sql`${row.tenantId} = ANY(${playtimeClosure.tenantIds})`,
        ),
        or(isNull(playtimeClosure.eventId), eq(playtimeClosure.eventScope, 'everyone')),
      ),
    );
  const baseAllowance = row.allowanceSeconds ?? inherited.allowanceSeconds;
  const grantedByWeek = new Map<string, number>();
  for (const grant of grants) {
    grantedByWeek.set(grant.weekStart, (grantedByWeek.get(grant.weekStart) ?? 0) + grant.seconds);
  }

  return {
    ...me,
    school: schoolForTenant(row.tenantId) ?? null,
    overrides: {
      allowanceSeconds: row.allowanceSeconds,
      graceSeconds: row.graceSeconds,
      warningsMinutes: row.warningsMinutes,
    },
    inherited: {
      allowanceSeconds: inherited.allowanceSeconds,
      graceSeconds: inherited.graceSeconds,
      warningsMinutes: inherited.warningsMinutes,
    },
    exemptions: exemptions.map((exemption) => ({
      id: exemption.id,
      scope: exemption.userId ? ('user' as const) : ('minecraft' as const),
      username: exemption.username,
      reason: exemption.reason,
      until: exemption.until?.toISOString() ?? null,
      setByName: exemption.setByName,
      createdAt: exemption.createdAt.toISOString(),
    })),
    grants: grants
      .filter((grant) => grant.weekStart === current)
      .map((grant) => ({
        id: grant.id,
        seconds: grant.seconds,
        reason: grant.reason,
        grantedByName: grant.grantedByName,
        createdAt: grant.createdAt.toISOString(),
      })),
    weeks: mondays.map((monday) => ({
      weekStart: monday,
      countedSeconds: counted[monday] ?? 0,
      allowanceSeconds: baseAllowance + (grantedByWeek.get(monday) ?? 0),
      closed: closures.some(
        (closure) => closure.startsOn <= monday && closure.endsOn >= addDays(monday, 6),
      ),
    })),
  };
}

export const playtimeAdminViewService = { live, player };
