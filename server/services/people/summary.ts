import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatPlayer,
  anticheatUsage,
  economyAccount,
  event,
  eventRegistration,
  eventTeam,
  eventTeamMember,
  playtimeLedger,
  user,
  wardenAccountTransfer,
  wardenAppeal,
  wardenBan,
  wardenNote,
} from '~~/server/db/schema';
import { playerBandOf } from '~~/server/services/anticheat/rules';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { weekStart } from '~~/server/services/playtime/rules';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { wardenPlayerService } from '~~/server/services/warden/players';
import { isBanActive } from '~~/server/services/warden/rules';

import { fileNeedsLook, peopleAccess } from './access';
import { rolesOf } from './list';

import type { AdminPersonSummary } from '#shared/schemas/admin';
import { fileStatus } from '#shared/utils/anticheat';
import { schoolForTenant } from '#shared/utils/schools';

// What the Person page's Summary tab and header read: "At a glance" and the account facts, cut to
// the caller's role (docs/plans/admin-redesign.md). The other tabs load their own data.

const REGISTRATIONS_LIMIT = 100;

async function minecraftPart(userId: string, now: Date) {
  const [accounts, limit, devices, transfers, bans, noteRows] = await Promise.all([
    wardenPlayerService.accounts(db, userId),
    wardenPlayerService.limit(db, userId),
    wardenDeviceService.list(db, userId),
    db
      .select({ n: count() })
      .from(wardenAccountTransfer)
      .where(
        and(
          isNull(wardenAccountTransfer.dismissedAt),
          or(
            eq(wardenAccountTransfer.fromUserId, userId),
            eq(wardenAccountTransfer.toUserId, userId),
          ),
        ),
      ),
    db
      .select({ ban: wardenBan, appeal: wardenAppeal })
      .from(wardenBan)
      .leftJoin(wardenAppeal, eq(wardenAppeal.banId, wardenBan.id))
      .where(eq(wardenBan.userId, userId))
      .orderBy(desc(wardenBan.createdAt)),
    db
      .select({ kind: wardenNote.kind, n: count() })
      .from(wardenNote)
      .where(eq(wardenNote.userId, userId))
      .groupBy(wardenNote.kind),
  ]);
  const active = bans.find((row) => isBanActive(row.ban, now));
  const notes = (kind: string) => noteRows.find((row) => row.kind === kind)?.n ?? 0;
  const minecraft: NonNullable<AdminPersonSummary['minecraft']> = {
    accounts: accounts.map((account) => ({
      uuid: account.uuid,
      username: account.username,
      online: account.online,
      lastSeenAt: account.lastSeenAt,
    })),
    limit,
    playtimeSeconds: await wardenPlayerService.totalPlaytime(db, userId),
    devices: devices.length,
    pendingTransfers: transfers[0]?.n ?? 0,
  };
  const moderation: NonNullable<AdminPersonSummary['moderation']> = {
    activeBan: active
      ? {
          id: active.ban.id,
          reason: active.ban.reason,
          createdAt: active.ban.createdAt.toISOString(),
          expiresAt: active.ban.expiresAt?.toISOString() ?? null,
        }
      : null,
    appeal: active?.appeal ? { id: active.appeal.id, status: active.appeal.status } : null,
    bans: bans.length,
    notes: notes('note'),
    warnings: notes('warning'),
  };
  return { minecraft, moderation };
}

async function playtimePart(userId: string, now: Date) {
  const [row] = await db
    .select({ over: sql<number>`coalesce(sum(${playtimeLedger.overSeconds}), 0)`.mapWith(Number) })
    .from(playtimeLedger)
    .where(
      and(
        eq(playtimeLedger.userId, userId),
        eq(playtimeLedger.weekStart, weekStart(now.getTime())),
      ),
    );
  return { overSeconds: row?.over ?? 0 };
}

const SEVERITY = { banned: 0, refused: 1, review: 2 } as const;

async function anticheatPart(userId: string): Promise<AdminPersonSummary['anticheat']> {
  const [{ rules }, [player], files] = await Promise.all([
    anticheatSettingsService.get(),
    db.select().from(anticheatPlayer).where(eq(anticheatPlayer.userId, userId)),
    db
      .select({ file: anticheatFile })
      .from(anticheatUsage)
      .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatUsage.sha512))
      .where(and(eq(anticheatUsage.userId, userId), fileNeedsLook)),
  ]);
  if (!player && !files.length) return null;
  const flagged = files
    .flatMap(({ file }) => {
      const status = fileStatus(file);
      return status === 'banned' || status === 'refused' || status === 'review'
        ? [{ sha512: file.sha512, filename: file.filename, status }]
        : [];
    })
    .sort(
      (a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.filename.localeCompare(b.filename),
    );
  const score = player?.score ?? rules.player.start;
  const band = playerBandOf(score, rules);
  const manualHold = player?.manualHold ?? false;
  return {
    score,
    band,
    manualHold,
    flagged: manualHold || band === 'held' || band === 'zero' || flagged.length > 0,
    flaggedFiles: flagged.length,
    flaggedFile: flagged[0] ?? null,
  };
}

async function economyPart(userId: string): Promise<AdminPersonSummary['economy']> {
  const [account] = await db
    .select({
      id: economyAccount.id,
      balance: economyAccount.balance,
      frozenAt: economyAccount.frozenAt,
    })
    .from(economyAccount)
    .where(and(eq(economyAccount.kind, 'personal'), eq(economyAccount.ownerUserId, userId)));
  return account
    ? { accountId: account.id, balance: account.balance, frozen: account.frozenAt !== null }
    : null;
}

async function eventsPart(userId: string): Promise<AdminPersonSummary['events']> {
  const rows = await db
    .select({
      eventId: event.id,
      name: event.name,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: eventRegistration.status,
      team: eventTeam.name,
    })
    .from(eventRegistration)
    .innerJoin(event, eq(event.id, eventRegistration.eventId))
    .leftJoin(eventTeamMember, eq(eventTeamMember.registrationId, eventRegistration.id))
    .leftJoin(eventTeam, eq(eventTeam.id, eventTeamMember.teamId))
    .where(eq(eventRegistration.userId, userId))
    .orderBy(desc(event.startsAt), asc(event.id))
    .limit(REGISTRATIONS_LIMIT);
  return {
    registrations: rows.map((row) => ({
      eventId: row.eventId,
      name: row.name,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      team: row.team,
    })),
  };
}

/** The summary of one account, cut to the caller's role. Null when the account doesn't exist. */
async function summary(role: string | null, userId: string): Promise<AdminPersonSummary | null> {
  const access = peopleAccess(role);
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) return null;
  const now = new Date();

  const person: AdminPersonSummary = {
    userId: row.id,
    name: row.name,
    image: row.image,
    school: schoolForTenant(row.tenantId) ?? null,
    ghost: row.ghost,
    createdAt: row.createdAt.toISOString(),
  };
  if (access.warden) {
    person.email = row.email;
    person.roles = rolesOf(row.role);
  }
  if (access.admin) {
    person.lastSignInAt = row.lastSignInAt?.toISOString() ?? null;
    person.siteBan =
      row.banned && (!row.banExpires || row.banExpires > now)
        ? { reason: row.banReason, expiresAt: row.banExpires?.toISOString() ?? null }
        : null;
  }
  // A ghost has never signed in, so it has no Minecraft side. Its Moderation tab isn't offered.
  const [minecraft, playtime, anticheat, economy, events] = await Promise.all([
    access.warden && !row.ghost ? minecraftPart(userId, now) : undefined,
    access.warden && !row.ghost ? playtimePart(userId, now) : undefined,
    access.warden && !row.ghost ? anticheatPart(userId) : undefined,
    access.economy ? economyPart(userId) : undefined,
    access.events ? eventsPart(userId) : undefined,
  ]);
  if (minecraft) Object.assign(person, minecraft);
  if (playtime) person.playtime = playtime;
  if (anticheat !== undefined) person.anticheat = anticheat;
  if (economy !== undefined) person.economy = economy;
  if (events) person.events = events;
  return person;
}

export const peopleSummaryService = { summary };
