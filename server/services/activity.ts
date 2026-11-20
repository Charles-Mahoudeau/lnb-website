import { and, desc, eq, gte, ilike, like, lt, notInArray, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '~~/server/db';
import { audit, user } from '~~/server/db/schema';
import type { AuditAction } from '~~/server/db/schema';

import type {
  AdminActivityEntry,
  AdminActivityFilters,
  AdminActivityPage,
} from '#shared/schemas/admin';
import { activityAreas, activityPrefixes } from '#shared/utils/audit';

// The activity log as the admin reads it (docs/activity-log.md): newest first, cut to what the
// caller's roles may see, with the names of who did it and who it happened to.

export const ACTIVITY_PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

/**
 * Entries that only feed the Minecraft server's event stream, one per change of a verdict or a
 * warning. They would bury everything else, so the log leaves them out.
 */
export const STREAM_ONLY_ACTIONS: AuditAction[] = [
  'minecraft.anticheat.verdict',
  'minecraft.anticheat.alert',
  'minecraft.playtime.warning',
  'minecraft.playtime.grace',
  'minecraft.playtime.update',
  'minecraft.playtime.kick',
];

const actorUser = alias(user, 'actor_user');
const targetUser = alias(user, 'target_user');

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** The conditions of a filter for a role: its areas, the search, the dates and the person. */
function conditions(role: string | null | undefined, filters: AdminActivityFilters): SQL[] {
  const where: SQL[] = [notInArray(audit.action, STREAM_ONLY_ACTIONS)];
  const prefixes = activityPrefixes(role);
  if (prefixes) where.push(or(...prefixes.map((prefix) => like(audit.action, `${prefix}%`)))!);
  if (filters.areas?.length) {
    // An area the role can't read is left out, so asking for it can't widen the answer.
    const allowed = new Set<string>(activityAreas(role));
    const areas = filters.areas.filter((area) => allowed.has(area));
    where.push(
      areas.length
        ? or(...areas.map((area) => like(audit.action, `${area}.%`)))!
        : eq(audit.id, -1),
    );
  }
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    where.push(
      or(
        ilike(actorUser.name, pattern),
        ilike(targetUser.name, pattern),
        ilike(audit.actorMinecraftName, pattern),
      )!,
    );
  }
  if (filters.user) {
    where.push(or(eq(audit.targetUserId, filters.user), eq(audit.actorUserId, filters.user))!);
  }
  where.push(
    gte(
      audit.at,
      filters.from ? new Date(filters.from) : new Date(Date.now() - DEFAULT_DAYS * DAY_MS),
    ),
  );
  if (filters.to) where.push(lt(audit.at, new Date(filters.to)));
  return where;
}

function view(row: {
  entry: typeof audit.$inferSelect;
  actorName: string | null;
  targetName: string | null;
}): AdminActivityEntry {
  const { entry } = row;
  return {
    id: entry.id,
    at: entry.at.toISOString(),
    action: entry.action,
    source: entry.source,
    actor: entry.actorUserId ? { userId: entry.actorUserId, name: row.actorName } : null,
    actorMinecraftName: entry.actorMinecraftName,
    target: entry.targetUserId ? { userId: entry.targetUserId, name: row.targetName } : null,
    data: entry.data,
  };
}

async function page(
  role: string | null | undefined,
  filters: AdminActivityFilters,
  options: { cursor?: number; limit?: number } = {},
): Promise<AdminActivityPage> {
  const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
  const where = conditions(role, filters);
  if (options.cursor) where.push(lt(audit.id, options.cursor));
  const rows = await db
    .select({ entry: audit, actorName: actorUser.name, targetName: targetUser.name })
    .from(audit)
    .leftJoin(actorUser, eq(actorUser.id, audit.actorUserId))
    .leftJoin(targetUser, eq(targetUser.id, audit.targetUserId))
    .where(and(...where))
    .orderBy(desc(audit.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map(view);
  return {
    items,
    nextCursor: rows.length > limit && items.length ? String(items.at(-1)!.id) : null,
  };
}

/** The most entries a CSV holds, newest first. */
export const CSV_MAX_ROWS = 50_000;

/** A cell that a spreadsheet would run as a formula is made text. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

async function csv(
  role: string | null | undefined,
  filters: AdminActivityFilters,
): Promise<string> {
  const lines = ['id,at,action,source,actor,target,data'];
  let cursor: number | undefined;
  while (lines.length - 1 < CSV_MAX_ROWS) {
    const result = await page(role, filters, {
      cursor,
      limit: Math.min(1000, CSV_MAX_ROWS - (lines.length - 1)),
    });
    for (const item of result.items) {
      lines.push(
        [
          String(item.id),
          item.at,
          item.action,
          item.source,
          item.actor?.name ?? item.actorMinecraftName ?? '',
          item.target?.name ?? '',
          JSON.stringify(item.data),
        ]
          .map(cell)
          .join(','),
      );
    }
    if (!result.nextCursor) break;
    cursor = Number(result.nextCursor);
  }
  return `${lines.join('\n')}\n`;
}

export const activityService = { page, csv };
