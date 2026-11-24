import type { RequestEvent } from 'nuxt/server';

import { flagService } from '~~/server/services/flags';
import { minecraftEventService } from '~~/server/services/minecraft-events';
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
 * Whether the Minecraft server's Feed routes are still on (`feed` and `feed.serverApi`), for its
 * open stream: it closes when either goes off, and the mod's reconnection gets 503 `disabled`.
 */
export async function feedServerApiOn(): Promise<boolean> {
  return (await flagService.isEnabled('feed')) && (await flagService.isEnabled('feed.serverApi'));
}

/** The header that tells a page where its live stream starts, read before the page's data. */
export const FEED_EVENT_ID_HEADER = 'X-Feed-Event-Id';

/**
 * Sets `X-Feed-Event-Id` to the newest event of the `feed` topic, read before what the page reads:
 * every change after it has its event after it, so the page's live stream opens with it as
 * Last-Event-ID and misses nothing that happened since the page was read, however old the page
 * is by then (past the replay buffer, the stream says `reset` and the page reads itself again).
 */
export async function setFeedEventId(event: RequestEvent): Promise<void> {
  event.res.headers.set(FEED_EVENT_ID_HEADER, String(await minecraftEventService.latestId('feed')));
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
