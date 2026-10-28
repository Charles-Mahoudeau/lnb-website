import { createError } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { bearerApiKey, routeLabel } from '~~/server/lib/api-keys';
import type { AuthSession } from '~~/server/lib/auth';
import { apiKeyService } from '~~/server/services/api-keys';
import type { ApiKeyPrincipal } from '~~/server/services/api-keys';
import { requireFlag } from '~~/server/utils/flags';

import type { ApiKeyPermission } from '#shared/api-keys';

// Routes that integrations may call. A route is closed to API keys until it calls `requireAccess`;
// `requireUser`, `requireAdmin` and the other guards only ever see a signed-in person. See
// docs/api-keys.md.

// One lookup per request: the rate limit middleware and the handler share it.
const lookups = new WeakMap<RequestEvent, Promise<ApiKeyPrincipal | null>>();

/** The key sent with the request, or null when none was sent or it is unknown, revoked or expired. */
export function apiKeyOfRequest(event: RequestEvent): Promise<ApiKeyPrincipal | null> {
  const secret = bearerApiKey(event.req.headers.get('authorization'));
  if (!secret) return Promise.resolve(null);
  let lookup = lookups.get(event);
  if (!lookup) {
    lookup = apiKeyService.authenticate(secret);
    lookups.set(event, lookup);
  }
  return lookup;
}

export type Actor =
  { kind: 'user'; user: AuthSession['user'] } | { kind: 'key'; key: ApiKeyPrincipal };

/**
 * Lets a route accept a key that holds `permission`, besides the person `user` lets through. A
 * request with a key never falls back to a session. Throws a 503 while the `apiKeys` flag is off,
 * a 401 for a key that isn't valid and a 403 for one without the permission.
 */
export async function requireAccess(
  event: RequestEvent,
  options: {
    permission: ApiKeyPermission;
    /** The guard for people, such as `requireEventsManager`. */
    user: (event: RequestEvent) => Promise<AuthSession['user']>;
  },
): Promise<Actor> {
  if (!bearerApiKey(event.req.headers.get('authorization'))) {
    return { kind: 'user', user: await options.user(event) };
  }
  await requireFlag(event, 'apiKeys');
  const key = await apiKeyOfRequest(event);
  if (!key) throw createError({ status: 401, statusText: 'Unauthorized' });
  if (!key.permissions.includes(options.permission)) {
    throw createError({ status: 403, statusText: 'Forbidden' });
  }
  const path = new URL(event.req.url, 'http://localhost').pathname;
  apiKeyService.recordUse(key.id, routeLabel(event.req.method, path));
  return { kind: 'key', key };
}

/** The account to record as having acted: the person, or nobody for a key. */
export function actorUserId(actor: Actor): string | null {
  return actor.kind === 'user' ? actor.user.id : null;
}

/** What the audit log keeps about a key that acted, to spread into an entry's `data`. */
export function actorAuditData(actor: Actor): { apiKey?: { id: string; name: string } } {
  return actor.kind === 'key' ? { apiKey: { id: actor.key.id, name: actor.key.name } } : {};
}
