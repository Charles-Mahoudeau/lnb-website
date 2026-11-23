import { registerEndpoint } from '@nuxt/test-utils/runtime';
import { expect, vi } from 'vitest';

import { queryOf } from './feed-fixtures';

import type { FeedPostView } from '#shared/schemas/feed';

// The browser's live stream played by a test (test/nuxt/feed-live-*.test.ts): `fetch` to
// /api/feed/events answers what the test says, a stream it writes into, or a refusal; the other
// requests go through. Also the endpoint behind GET /api/feed/views.

export interface Played {
  headers: Headers;
  signal: AbortSignal;
  /** One event of the wire format. */
  send: (event: string, data: unknown, eventId?: number | string) => void;
  /** Raw text, for a message that isn't well formed. */
  raw: (text: string) => void;
  /** The server ends the response (a restart, a proxy's timeout). */
  end: () => void;
  /** The connection breaks while the page reads. */
  fail: (error?: Error) => void;
  /** Ended by the server or aborted by the page. */
  readonly closed: boolean;
}

/** What the next stream request is answered with, in the order queued. */
export type Outcome = { status: number } | 'network' | 'nobody' | 'ok';

const realFetch = globalThis.fetch;

export const live = {
  streams: [] as Played[],
  /** Every stream request, answered or refused. */
  requests: 0,
  /** The answer once the queue is empty. */
  fallback: 'ok' as Outcome,
  queue: [] as Outcome[],
  /** The times (in the fake clock, or real) at which requests came in. */
  at: [] as number[],
};

/** Answers the stream requests as `live` says, and passes every other request on. */
export function playStream() {
  live.streams = [];
  live.requests = 0;
  live.fallback = 'ok';
  live.queue = [];
  live.at = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/feed/events')) return realFetch(input, init);
    live.requests++;
    live.at.push(Date.now());
    const outcome = live.queue.shift() ?? live.fallback;
    if (outcome === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (outcome === 'nobody') return Promise.resolve({ status: 200, ok: true, body: null });
    if (typeof outcome === 'object') {
      return Promise.resolve({ status: outcome.status, ok: outcome.status < 300, body: null });
    }
    const queue: (Uint8Array | Error | null)[] = [];
    let wake: (() => void) | null = null;
    const signal = init!.signal!;
    let ended = false;
    const push = (chunk: Uint8Array | Error | null) => {
      queue.push(chunk);
      wake?.();
    };
    signal.addEventListener('abort', () => {
      push(null);
    });
    const encoder = new TextEncoder();
    live.streams.push({
      headers: new Headers(init?.headers),
      signal,
      send: (event, data, eventId) => {
        push(
          encoder.encode(
            `${eventId === undefined ? '' : `id: ${String(eventId)}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      },
      raw: (text) => {
        push(encoder.encode(text));
      },
      end: () => {
        ended = true;
        push(null);
      },
      fail: (error = new TypeError('network error')) => {
        ended = true;
        push(error);
      },
      get closed() {
        return signal.aborted || ended;
      },
    });
    const body = {
      getReader: () => ({
        async read() {
          while (!queue.length) await new Promise<void>((resolve) => (wake = resolve));
          const chunk = queue.shift();
          if (chunk instanceof Error) throw chunk;
          if (!chunk) {
            if (signal.aborted) throw new DOMException('aborted', 'AbortError');
            return { done: true, value: undefined };
          }
          return { done: false, value: chunk };
        },
      }),
    };
    return Promise.resolve({ status: 200, ok: true, body });
  });
}

/** The stream the page holds now, once it opened (a reconnection waits for its delay first). */
export async function current(count = 1, timeout = 3000): Promise<Played> {
  await vi.waitFor(
    () => {
      expect(live.streams).toHaveLength(count);
    },
    { timeout },
  );
  return live.streams[count - 1]!;
}

export const viewsAsked: string[][] = [];

/** `GET /api/feed/views`, answering the views of the posts given, in the order asked. */
export function serveViews(known: FeedPostView[]) {
  viewsAsked.length = 0;
  registerEndpoint('/api/feed/views', (event) => {
    const ids = queryOf(event).ids!.split(',');
    viewsAsked.push(ids);
    return { posts: ids.flatMap((wanted) => known.filter((one) => one.id === wanted)) };
  });
}

export const postEvent = (one: FeedPostView) => ({
  id: one.id,
  feed: one.feed,
  threadId: one.threadId,
  createdAt: one.createdAt,
});

/** Lets the clock be driven by the test from here on (after the page mounted and opened). */
export function fakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}
