import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { rateLimitSetting, user } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { RATE_LIMIT_MODES } from '#shared/rate-limit';
import type { RateLimitMode } from '#shared/rate-limit';
import type { AdminRateLimit } from '#shared/schemas/rate-limit';

// The rate limiting mode. Read on every limited request, so it is cached for a few seconds: a
// change clears the cache of this instance at once and reaches the others within the TTL.

const CACHE_TTL_MS = 10_000;
const ROW_ID = 'default';

let cache: { at: number; mode: RateLimitMode } | undefined;

function parse(value: string | undefined): RateLimitMode {
  return RATE_LIMIT_MODES.find((mode) => mode === value) ?? 'normal';
}

async function current(): Promise<RateLimitMode> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.mode;
  try {
    const [row] = await db.select().from(rateLimitSetting).where(eq(rateLimitSetting.id, ROW_ID));
    cache = { at: Date.now(), mode: parse(row?.mode) };
  } catch {
    // The database is down: keep the last known mode rather than failing every request.
    cache = { at: Date.now(), mode: cache?.mode ?? 'normal' };
  }
  return cache.mode;
}

/** The mode with who set it and when, for the admin page. */
async function get(): Promise<AdminRateLimit> {
  const [row] = await db
    .select({ setting: rateLimitSetting, updatedByName: user.name })
    .from(rateLimitSetting)
    .leftJoin(user, eq(user.id, rateLimitSetting.updatedByUserId))
    .where(eq(rateLimitSetting.id, ROW_ID));
  return {
    mode: parse(row?.setting.mode),
    updatedAt: row ? row.setting.updatedAt.toISOString() : null,
    updatedByName: row?.updatedByName ?? null,
  };
}

/** Sets the mode, and writes admin_audit. A no-op change writes nothing. */
async function set(input: { mode: RateLimitMode; actorId: string }): Promise<void> {
  const { mode, actorId } = input;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(rateLimitSetting)
      .where(eq(rateLimitSetting.id, ROW_ID));
    if (parse(existing?.mode) === mode) return;
    await tx
      .insert(rateLimitSetting)
      .values({ id: ROW_ID, mode, updatedByUserId: actorId })
      .onConflictDoUpdate({
        target: rateLimitSetting.id,
        set: { mode, updatedAt: new Date(), updatedByUserId: actorId },
      });
    await adminAuditService.record(tx, {
      action: 'rateLimit.mode',
      actorUserId: actorId,
      targetUserId: null,
      data: { mode },
    });
  });
  cache = undefined;
}

export const rateLimitModeService = { current, get, set };
