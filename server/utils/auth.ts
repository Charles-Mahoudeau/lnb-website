import { createError } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { auth } from '~~/server/lib/auth';
import type { AuthSession } from '~~/server/lib/auth';

import { isAdmin, isEventsManager, isWardenAdmin } from '#shared/utils/roles';

/** The signed-in user's session, or null. */
export function getAuthSession(event: RequestEvent): Promise<AuthSession | null> {
  return auth.api.getSession({ headers: event.req.headers });
}

/** The signed-in user. Throws a 401 when signed out. */
export async function requireUser(event: RequestEvent): Promise<AuthSession['user']> {
  const session = await getAuthSession(event);
  if (!session) {
    throw createError({ status: 401, statusText: 'Unauthorized' });
  }
  return session.user;
}

/** The signed-in admin. Throws a 401 when signed out and a 403 for anyone but an admin. */
export async function requireAdmin(event: RequestEvent): Promise<AuthSession['user']> {
  const user = await requireUser(event);
  if (!isAdmin(user.role)) {
    throw createError({ status: 403, statusText: 'Forbidden' });
  }
  return user;
}

/** The signed-in Warden admin (or site admin). Throws a 401 when signed out, else a 403. */
export async function requireWardenAdmin(event: RequestEvent): Promise<AuthSession['user']> {
  const user = await requireUser(event);
  if (!isWardenAdmin(user.role)) {
    throw createError({ status: 403, statusText: 'Forbidden' });
  }
  return user;
}

/** The signed-in events manager (or site admin). Throws a 401 when signed out, else a 403. */
export async function requireEventsManager(event: RequestEvent): Promise<AuthSession['user']> {
  const user = await requireUser(event);
  if (!isEventsManager(user.role)) {
    throw createError({ status: 403, statusText: 'Forbidden' });
  }
  return user;
}
