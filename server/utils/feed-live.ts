import { createEventStream } from 'h3';
import type { H3Event } from 'h3';
import { getRequestHeader } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { feedLiveHub } from '~~/server/services/feed/live';
import type { FeedLiveHub } from '~~/server/services/feed/live';

/**
 * The `Last-Event-ID` a reconnecting client sends: null without one (start from now), -1 for one
 * that can't be an event ID (the hub answers it with `reset`).
 */
export function feedLastEventId(header: string | undefined): number | null {
  if (header === undefined || header.trim() === '') return null;
  const value = header.trim();
  const id = /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) ? id : -1;
}

/**
 * Serves the browser's live Feed stream (docs/feed.md, "Live updates in the browser") as
 * Server-Sent Events, through the one hub every tab shares. h3 sends `Content-Type:
 * text/event-stream`, `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, so
 * proxies neither buffer nor compress it. The caller checks the session and the flags first; the
 * caps answer 429 `tooManyStreams` before anything is sent.
 */
export async function streamFeedLive(
  event: RequestEvent,
  userId: string,
  hub: FeedLiveHub = feedLiveHub,
) {
  // nuxt/server's event is h3's at runtime. The portable surface has no event streams yet.
  const h3 = event as unknown as H3Event;
  const lastEventId = feedLastEventId(getRequestHeader(event, 'last-event-id'));
  const stream = createEventStream(h3);
  const res = h3.node.res;
  let leave: () => void;
  try {
    leave = hub.join({
      userId,
      lastEventId,
      // getAuthSession is auto-imported from server/utils/auth.ts.
      sessionAlive: async () => (await getAuthSession(event)) !== null,
      sink: {
        send: (message) => {
          stream.push(message).catch(() => {});
        },
        // What Node holds for a client that doesn't read: h3 writes without waiting for it.
        buffered: () => res.writableLength,
        close: () => {
          void stream.close();
        },
      },
    });
  } catch (error) {
    await stream.close();
    throw error;
  }
  stream.onClosed(leave);
  res.once('close', leave);
  return stream.send();
}
