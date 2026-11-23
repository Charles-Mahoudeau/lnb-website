import type { RequestEvent } from 'nuxt/server';

import { requireFlag } from '~~/server/utils/flags';
import { requireWardenServer } from '~~/server/utils/warden';

/**
 * The Minecraft server, on a Feed route: its secret, then the `feed` and `feed.serverApi` flags
 * (503 `disabled` naming the flag that is off). See docs/feed-mod.md, 2.1.
 */
export async function requireFeedServer(event: RequestEvent): Promise<void> {
  requireWardenServer(event);
  await requireFlag(event, 'feed');
  await requireFlag(event, 'feed.serverApi');
}

/**
 * Runs a Feed write, and on a 429 `rateLimited` from its per-account limits sets `Retry-After`
 * as the rate-limit middleware does. The limits sit in the services, after the other checks.
 */
export async function withRetryAfter<T>(event: RequestEvent, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    const data = (error as { data?: { problem?: unknown; retryAfter?: unknown } }).data;
    if (data?.problem === 'rateLimited' && typeof data.retryAfter === 'number') {
      event.res.headers.set('Retry-After', String(data.retryAfter));
    }
    throw error;
  }
}
