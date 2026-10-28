import { and, desc, eq, gte, isNotNull, lt, or, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { apiKey, apiKeyUsage, user } from '~~/server/db/schema';
import { generateApiKey, hashApiKey } from '~~/server/lib/api-keys';
import { adminAuditService } from '~~/server/services/admin-audit';
import { flagService } from '~~/server/services/flags';

import {
  API_KEY_MAX_DAYS,
  API_KEY_RETENTION_DAYS,
  API_KEY_USAGE_DAYS,
  apiKeyStatus,
  isApiKeyUsable,
  isApiKeyPermission,
} from '#shared/api-keys';
import type { ApiKeyPermission } from '#shared/api-keys';
import type {
  ApiKeyBody,
  ApiKeyCreated,
  ApiKeyDetail,
  ApiKeyItem,
  ApiKeyList,
  ApiKeyProblem,
  ApiKeyRotateBody,
} from '#shared/schemas/api-keys';

// API keys for integrations. A key is a service identity: it has a name, permissions and an
// expiry, and nobody's account behind it. Only the hash of the secret is kept. See docs/api-keys.md.

const DAY_MS = 86_400_000;

type Row = typeof apiKey.$inferSelect;

/** Who an authenticated key is, for the routes that accept one. */
export interface ApiKeyPrincipal {
  id: string;
  name: string;
  permissions: ApiKeyPermission[];
}

function refuse(status: number, problem: ApiKeyProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

function item(row: Row, createdBy: string | null, calls7d: number): ApiKeyItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prefix: row.prefix,
    permissions: row.permissions.filter(isApiKeyPermission),
    status: apiKeyStatus(row),
    createdAt: row.createdAt.toISOString(),
    createdBy,
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    calls7d,
  };
}

/** `YYYY-MM-DD` (UTC) of `days` before now: the first day of a window of `days + 1` days. */
function dayAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

async function listAdmin(): Promise<ApiKeyList> {
  const rows = await db
    .select({ key: apiKey, createdBy: user.name })
    .from(apiKey)
    .leftJoin(user, eq(user.id, apiKey.createdBy))
    .orderBy(desc(apiKey.createdAt));
  const usage = await db
    .select({ keyId: apiKeyUsage.keyId, calls: sql<number>`sum(${apiKeyUsage.calls})::int` })
    .from(apiKeyUsage)
    .where(gte(apiKeyUsage.day, dayAgo(6)))
    .groupBy(apiKeyUsage.keyId);
  const calls = new Map(usage.map((u) => [u.keyId, u.calls]));
  return {
    keys: rows.map((r) => item(r.key, r.createdBy, calls.get(r.key.id) ?? 0)),
    enabled: await flagService.isEnabled('apiKeys'),
  };
}

async function detail(id: string): Promise<ApiKeyDetail> {
  const [row] = await db
    .select({ key: apiKey, createdBy: user.name })
    .from(apiKey)
    .leftJoin(user, eq(user.id, apiKey.createdBy))
    .where(eq(apiKey.id, id));
  if (!row) refuse(404, 'apiKeyNotFound');
  const routes = await db
    .select({ route: apiKeyUsage.route, calls: sql<number>`sum(${apiKeyUsage.calls})::int` })
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.keyId, id), gte(apiKeyUsage.day, dayAgo(6))))
    .groupBy(apiKeyUsage.route)
    .orderBy(desc(sql`sum(${apiKeyUsage.calls})`), apiKeyUsage.route);
  const calls7d = routes.reduce((total, r) => total + r.calls, 0);
  return { ...item(row.key, row.createdBy, calls7d), routes };
}

async function create(input: { actorId: string; body: ApiKeyBody }): Promise<ApiKeyCreated> {
  const body = input.body;
  const generated = generateApiKey();
  const days = Math.min(body.expiresInDays, API_KEY_MAX_DAYS);
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(apiKey)
      .values({
        name: body.name.trim(),
        description: body.description?.trim() ?? '',
        prefix: generated.prefix,
        keyHash: generated.hash,
        permissions: [...new Set(body.permissions)],
        expiresAt: new Date(Date.now() + days * DAY_MS),
        createdBy: input.actorId,
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'apiKey.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: created!.id, name: created!.name, permissions: created!.permissions },
    });
    return created!;
  });
  return { key: item(row, null, 0), secret: generated.secret };
}

/**
 * Issues a new key with the same name and permissions, for a year, and brings the old key's
 * expiry forward to the end of the overlap, so the integration can switch without a gap.
 */
async function rotate(input: {
  actorId: string;
  id: string;
  body: ApiKeyRotateBody;
}): Promise<ApiKeyCreated> {
  const generated = generateApiKey();
  const row = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(apiKey).where(eq(apiKey.id, input.id)).for('update');
    if (!old) refuse(404, 'apiKeyNotFound');
    // A key that is revoked, expired or already replaced can't be rotated again.
    if (!isApiKeyUsable(apiKeyStatus(old)) || old.rotatedAt) refuse(409, 'apiKeyNotUsable');
    const now = new Date();
    const overlapEnd = new Date(now.getTime() + input.body.overlapDays * DAY_MS);
    await tx
      .update(apiKey)
      .set({
        rotatedAt: now,
        expiresAt: overlapEnd < old.expiresAt ? overlapEnd : old.expiresAt,
      })
      .where(eq(apiKey.id, old.id));
    const [created] = await tx
      .insert(apiKey)
      .values({
        name: old.name,
        description: old.description,
        prefix: generated.prefix,
        keyHash: generated.hash,
        permissions: old.permissions,
        expiresAt: new Date(now.getTime() + API_KEY_MAX_DAYS * DAY_MS),
        createdBy: input.actorId,
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'apiKey.rotate',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: old.id, name: old.name, newId: created!.id, overlapDays: input.body.overlapDays },
    });
    return created!;
  });
  return { key: item(row, null, 0), secret: generated.secret };
}

/** Stops a key at once. It can't be turned back on. */
async function revoke(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(apiKey).where(eq(apiKey.id, input.id)).for('update');
    if (!row) refuse(404, 'apiKeyNotFound');
    if (row.revokedAt) return;
    await tx.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, row.id));
    await adminAuditService.record(tx, {
      action: 'apiKey.revoke',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.id, name: row.name },
    });
  });
}

/** The key behind a secret, or null when it is unknown, revoked or expired. */
async function authenticate(secret: string): Promise<ApiKeyPrincipal | null> {
  const [row] = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashApiKey(secret)));
  if (!row || !isApiKeyUsable(apiKeyStatus(row))) return null;
  return {
    id: row.id,
    name: row.name,
    permissions: row.permissions.filter(isApiKeyPermission),
  };
}

// A busy key would otherwise write on every call: the last-used time moves at most once a minute.
const LAST_USED_EVERY_MS = 60_000;
const lastTouched = new Map<string, number>();

/** Counts a call for the key, without making the caller wait. Failures are logged and dropped. */
function recordUse(keyId: string, route: string, now = new Date()): void {
  const day = now.toISOString().slice(0, 10);
  const touch = (lastTouched.get(keyId) ?? 0) + LAST_USED_EVERY_MS <= now.getTime();
  if (touch) lastTouched.set(keyId, now.getTime());
  void (async () => {
    await db
      .insert(apiKeyUsage)
      .values({ keyId, day, route, calls: 1 })
      .onConflictDoUpdate({
        target: [apiKeyUsage.keyId, apiKeyUsage.day, apiKeyUsage.route],
        set: { calls: sql`${apiKeyUsage.calls} + 1` },
      });
    if (touch) await db.update(apiKey).set({ lastUsedAt: now }).where(eq(apiKey.id, keyId));
  })().catch((error: unknown) => {
    console.error('Recording an API key call failed', error);
  });
}

/** Counts of keys the Overview reports. */
async function overview(): Promise<{ usable: number; soon: number }> {
  const rows = await db.select().from(apiKey);
  const statuses = rows.map((row) => apiKeyStatus(row));
  return {
    usable: statuses.filter(isApiKeyUsable).length,
    soon: statuses.filter((status) => status === 'soon').length,
  };
}

/**
 * Deletes keys that stopped working long ago, with their counts, and the counts older than the
 * history we keep. Returns how many of each.
 */
async function prune(now = new Date()): Promise<{ keys: number; usage: number }> {
  const cutoff = new Date(now.getTime() - API_KEY_RETENTION_DAYS * DAY_MS);
  const keys = await db
    .delete(apiKey)
    .where(
      or(
        and(isNotNull(apiKey.revokedAt), lt(apiKey.revokedAt, cutoff)),
        lt(apiKey.expiresAt, cutoff),
      ),
    )
    .returning({ id: apiKey.id });
  const usage = await db
    .delete(apiKeyUsage)
    .where(lt(apiKeyUsage.day, dayAgo(API_KEY_USAGE_DAYS - 1, now)))
    .returning({ keyId: apiKeyUsage.keyId });
  return { keys: keys.length, usage: usage.length };
}

export const apiKeyService = {
  listAdmin,
  detail,
  create,
  rotate,
  revoke,
  authenticate,
  recordUse,
  overview,
  prune,
};
