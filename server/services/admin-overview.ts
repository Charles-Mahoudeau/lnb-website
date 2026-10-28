import { and, count, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '~~/server/db';
import { adminAudit, user, wardenAppeal } from '~~/server/db/schema';
import { apiKeyService } from '~~/server/services/api-keys';
import { rateLimitModeService } from '~~/server/services/rate-limit-mode';
import { inactiveBefore } from '~~/server/services/users';

import type { AdminOverview } from '#shared/schemas/admin';

// The admin Overview: counts of what needs handling, and the latest changes. No usage figures:
// the site has no internal analytics (see the plan).

async function overview(): Promise<AdminOverview> {
  const now = new Date();
  const actor = alias(user, 'actor');
  const target = alias(user, 'target');

  const [appeals, inactive, bans, recent, rateLimitMode, apiKeys] = await Promise.all([
    db
      .select({ pending: count(), oldestAt: sql<Date | null>`min(${wardenAppeal.createdAt})` })
      .from(wardenAppeal)
      .where(eq(wardenAppeal.status, 'pending')),
    db
      .select({ value: count() })
      .from(user)
      .where(lt(sql`coalesce(${user.lastSignInAt}, ${user.createdAt})`, inactiveBefore(now))),
    db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now)))),
    db
      .select({
        entry: adminAudit,
        actorName: actor.name,
        targetName: target.name,
      })
      .from(adminAudit)
      .leftJoin(actor, eq(actor.id, adminAudit.actorUserId))
      .leftJoin(target, eq(target.id, adminAudit.targetUserId))
      .orderBy(desc(adminAudit.id))
      .limit(10),
    rateLimitModeService.current(),
    apiKeyService.overview(),
  ]);

  const oldest = appeals[0]?.oldestAt;
  return {
    appeals: {
      pending: appeals[0]?.pending ?? 0,
      oldestAt: oldest ? new Date(oldest).toISOString() : null,
    },
    inactiveAccounts: inactive[0]?.value ?? 0,
    siteBans: bans[0]?.value ?? 0,
    apiKeysSoon: apiKeys.soon,
    rateLimitMode,
    recent: recent.map(({ entry, actorName, targetName }) => ({
      id: entry.id,
      at: entry.at.toISOString(),
      action: entry.action,
      actor: entry.actorUserId && actorName ? { userId: entry.actorUserId, name: actorName } : null,
      target:
        entry.targetUserId && targetName ? { userId: entry.targetUserId, name: targetName } : null,
      data: entry.data,
    })),
  };
}

export const adminOverviewService = { overview };
