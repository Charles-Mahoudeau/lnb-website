import { EventEmitter } from 'node:events';

import { BASE } from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';

// Opens the browser's live stream the way h3 serves it, for the tests of the routes
// (site-feed-live-*.test.ts). A test file that uses it must mock h3 with Nitro's own copy first,
// as test/server/site-feed-live-http.test.ts does.

export interface SseEvent {
  id?: string;
  event: string;
  data: string;
}

export interface Opened {
  status: number;
  headers: Map<string, unknown>;
  error?: { statusCode: number; data?: Record<string, unknown> };
  /** Whether h3 handed over a stream: a refusal before anything is sent has none. */
  streaming: boolean;
  /** Reads the stream until `until` holds for the events read so far. */
  read: (until: (events: SseEvent[]) => boolean, timeoutMs?: number) => Promise<SseEvent[]>;
  /** What has been read so far. */
  events: SseEvent[];
  /** The browser goes away. */
  close: () => void;
}

export const opened: Opened[] = [];

/** Closes every stream a test opened. */
export function closeOpened() {
  for (const stream of opened.splice(0)) stream.close();
}

/**
 * Calls `handler` with a request h3 can stream to. With no socket, h3 leaves the stream on the
 * response (`_data`) instead of piping it, so the test reads what the browser would.
 */
export async function openStream(
  handler: (event: never) => unknown,
  as: As,
  headers: Record<string, string> = {},
): Promise<Opened> {
  const req = Object.assign(new EventEmitter(), { headers: {} });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableLength: 0,
    closed: false,
    socket: undefined,
    headers: new Map<string, unknown>(),
    _data: undefined as ReadableStream<Uint8Array> | undefined,
    setHeader(name: string, value: unknown) {
      this.headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return this.headers.get(name.toLowerCase());
    },
    end() {
      this.closed = true;
    },
  });
  const request = new Request(`http://localhost${BASE}/events`, {
    headers: { accept: 'text/event-stream', ...(as ? { 'x-test-user': as.id } : {}), ...headers },
  });
  const event = {
    req: request,
    url: new URL(request.url),
    res: { status: 200, statusText: undefined, headers: new Headers() },
    context: { params: {} },
    node: { req, res },
  };
  const close = () => {
    req.emit('close');
    res.emit('close');
  };
  let failure: Opened['error'];
  try {
    await handler(event as never);
  } catch (thrown) {
    const error = thrown as { statusCode?: number; data?: Record<string, unknown> };
    if (typeof error.statusCode !== 'number') throw thrown;
    failure = { statusCode: error.statusCode, data: error.data };
  }
  const reader = res._data?.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let text = '';
  const result: Opened = {
    status: failure?.statusCode ?? res.statusCode,
    headers: res.headers,
    error: failure,
    streaming: reader !== undefined,
    events,
    close,
    async read(until, timeoutMs = 5000) {
      while (!until(events)) {
        const chunk = await Promise.race([
          reader!.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              reject(new Error(`stream timed out after ${JSON.stringify(events)}: ${text}`));
            }, timeoutMs),
          ),
        ]);
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = text.indexOf('\n\n')) >= 0) {
          const block = text.slice(0, end);
          text = text.slice(end + 2);
          const fields = Object.fromEntries(
            block
              .split('\n')
              .map((line) => [
                line.slice(0, line.indexOf(':')),
                line.slice(line.indexOf(': ') + 2),
              ]),
          );
          events.push({ id: fields.id, event: fields.event!, data: fields.data! });
        }
      }
      return events;
    },
  };
  if (!failure) opened.push(result);
  return result;
}
