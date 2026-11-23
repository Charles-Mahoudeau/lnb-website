import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import getEvents from '~~/server/api/feed/events.get';
import getViews from '~~/server/api/feed/views.get';
import { db } from '~~/server/db';
import { minecraftServerEvent } from '~~/server/db/schema';
import { feedLiveHub } from '~~/server/services/feed/live';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedLastEventId, streamFeedLive } from '~~/server/utils/feed-live';

import { BASE, api, problem, refusal, requireTestUser } from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';
import {
  call,
  latestEvent,
  person,
  post,
  reply,
  setFlags,
  stubServerUtils,
  wipe,
} from './feed-helpers';

// The two routes of the browser's live updates at the HTTP level (docs/feed.md, "For the
// browser" and "Live updates in the browser"): GET /views, the caller's own views of a few posts,
// and GET /events, the stream, with its guards, its caps and what it never sends.

function views(as: As, ids: string) {
  return call(getViews, {
    method: 'GET',
    url: `${BASE}/views?ids=${ids}`,
    auth: null,
    headers: as ? { 'x-test-user': as.id } : {},
  });
}

/** The posts a views answer holds. */
function postsOf(answer: { body: unknown }) {
  return (answer.body as { posts: { id: string; [key: string]: unknown }[] }).posts;
}

// Nitro brings h3 to the server bundle; the site doesn't depend on it, so the test loads the h3
// that Nitro uses, from pnpm's store.
vi.mock('h3', () => {
  const store = fileURLToPath(new URL('../../node_modules/.pnpm/', import.meta.url));
  const version = readdirSync(store).find((name) => /^h3@1\./.test(name));
  if (!version) throw new Error('h3 1.x is not installed');
  return import(`${store}${version}/node_modules/h3/dist/index.mjs`);
});

// --- The stream, opened as h3 opens it ------------------------------------------------------------

interface Opened {
  status: number;
  headers: Map<string, unknown>;
  error?: { statusCode: number; data?: Record<string, unknown> };
  /** Reads the stream until `until` holds for the events read so far. */
  read: (
    until: (events: { id?: string; event: string; data: string }[]) => boolean,
  ) => Promise<{ id?: string; event: string; data: string }[]>;
  /** The browser goes away. */
  close: () => void;
}

const opened: Opened[] = [];

/**
 * Calls the stream handler with a request h3 can stream to. With no socket, h3 leaves the stream
 * on the response (`_data`) instead of piping it, so the test reads what the browser would.
 */
async function open(as: As, headers: Record<string, string> = {}): Promise<Opened> {
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
    await getEvents(event);
  } catch (thrown) {
    const error = thrown as { statusCode?: number; data?: Record<string, unknown> };
    if (typeof error.statusCode !== 'number') throw thrown;
    failure = { statusCode: error.statusCode, data: error.data };
  }
  const reader = res._data?.getReader();
  const decoder = new TextDecoder();
  const events: { id?: string; event: string; data: string }[] = [];
  let text = '';
  const result: Opened = {
    status: failure?.statusCode ?? res.statusCode,
    headers: res.headers,
    error: failure,
    close,
    async read(until) {
      while (!until(events)) {
        const chunk = await Promise.race([
          reader!.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              reject(new Error(`stream timed out: ${text}`));
            }, 5000),
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
              .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]),
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

describe('the live routes over HTTP', () => {
  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('streamFeedLive', streamFeedLive);
    vi.stubGlobal('getAuthSession', () => Promise.resolve({ user: {}, session: {} }));
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterEach(() => {
    for (const stream of opened.splice(0)) stream.close();
  });
  afterAll(async () => {
    feedLiveHub.closeAll();
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('where a page’s stream starts (X-Feed-Event-Id)', () => {
    it('comes with a page of a feed and a thread: the newest event, read before the page', async () => {
      const camille = await person('Camille Roux');
      const { post: made } = await post(camille);
      const newest = await latestEvent();
      const page = await api.page(camille, 'feed=global');
      expect(page.headers.get('X-Feed-Event-Id')).toBe(String(newest));
      // The page holds the post whose event is at or before that ID.
      expect((page.body as { posts: { id: string }[] }).posts.map((one) => one.id)).toContain(
        made.id,
      );
      const thread = await api.thread(camille, made.id);
      expect(thread.headers.get('X-Feed-Event-Id')).toBe(String(newest));
      await reply(camille, made.id);
      expect((await api.thread(camille, made.id)).headers.get('X-Feed-Event-Id')).toBe(
        String(await latestEvent()),
      );
    });

    it('is not sent on a refusal', async () => {
      const camille = await person('Camille Roux');
      setFlags({ feed: false });
      expect((await api.page(camille, 'feed=global')).headers.get('X-Feed-Event-Id')).toBeNull();
    });
  });

  describe('GET /views', () => {
    it('refuses a signed-out caller with 401, then answers 503 while feed is off', async () => {
      const camille = await person('Camille Roux');
      setFlags({ feed: false });
      expect(refusal(await views(null, randomUUID()))).toEqual({ status: 401, data: undefined });
      expect(refusal(await views(camille, randomUUID()))).toEqual(
        problem(503, 'disabled', { flag: 'feed' }),
      );
    });

    it('works with feed.live and feed.writing off', async () => {
      const camille = await person('Camille Roux');
      const { post: made } = await post(camille);
      setFlags({ 'feed.live': false, 'feed.writing': false });
      expect(postsOf(await views(camille, made.id)).map((view) => view.id)).toEqual([made.id]);
    });

    it('answers the caller’s own views, in the order asked, without deleted or unknown ones', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Laurent');
      const { post: first } = await post(camille, 'Un');
      const { post: second } = await post(mika, 'Deux', { anonymous: true });
      const { post: gone } = await post(camille, 'Trois');
      const { post: answer } = await reply(mika, first.id);
      await feedPostService.remove({
        actor: { source: 'site', userId: camille.id },
        postId: gone.id,
      });
      const answerOf = await views(
        camille,
        [second.id, randomUUID(), gone.id, answer.id, first.id].join(','),
      );
      expect(answerOf.status).toBe(200);
      const posts = postsOf(answerOf);
      expect(posts.map((view) => view.id)).toEqual([second.id, answer.id, first.id]);
      // Mika's anonymous post hides its author from Camille; the reply answers her.
      expect(posts[0]).toMatchObject({ anonymous: true, author: null, mine: false });
      expect(posts[1]).toMatchObject({ threadId: first.id, answersMe: true, mine: false });
      expect(posts[2]).toMatchObject({ mine: true, canDelete: true, replies: 1 });
      // Mika sees her own anonymous post with its author.
      const own = postsOf(await views(mika, second.id))[0];
      expect(own).toMatchObject({ mine: true, author: { uuid: mika.uuid } });
    });

    it('gives a moderator no delete on other people’s posts, as the browser does', async () => {
      const camille = await person('Camille Roux');
      const moderator = await person('Morgane Admin', { role: 'admin' });
      const { post: made } = await post(camille);
      expect(postsOf(await views(moderator, made.id))[0]).toMatchObject({ canDelete: false });
    });

    it('takes 1 to 20 distinct UUIDs, else a plain 400', async () => {
      const camille = await person('Camille Roux');
      const twenty = Array.from({ length: 20 }, () => randomUUID());
      expect((await views(camille, twenty.join(','))).status).toBe(200);
      const id = randomUUID();
      for (const ids of [
        '',
        [...twenty, randomUUID()].join(','),
        'not-a-uuid',
        `${id},${id}`,
        `${id},`,
      ]) {
        expect(refusal(await views(camille, ids)), ids).toEqual({ status: 400, data: undefined });
      }
      const missing = await call(getViews, {
        method: 'GET',
        url: `${BASE}/views`,
        auth: null,
        headers: { 'x-test-user': camille.id },
      });
      expect(missing.status).toBe(400);
    });
  });

  describe('GET /events', () => {
    it('refuses a signed-out caller with 401, before the flags', async () => {
      setFlags({ feed: false });
      const answer = await open(null);
      expect(answer.status).toBe(401);
      expect(answer.error?.data).toBeUndefined();
    });

    it('answers 503 disabled, naming the flag, while feed or feed.live is off', async () => {
      const camille = await person('Camille Roux');
      setFlags({ feed: false });
      expect((await open(camille)).error).toEqual({
        statusCode: 503,
        data: { problem: 'disabled', flag: 'feed' },
      });
      setFlags({ 'feed.live': false });
      expect((await open(camille)).error).toEqual({
        statusCode: 503,
        data: { problem: 'disabled', flag: 'feed.live' },
      });
      expect(feedLiveHub.stats().connections).toBe(0);
    });

    it('opens an event stream that proxies neither buffer nor transform, with a ping', async () => {
      const camille = await person('Camille Roux');
      const stream = await open(camille);
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toBe('text/event-stream');
      expect(String(stream.headers.get('cache-control'))).toContain('no-transform');
      expect(String(stream.headers.get('cache-control'))).toContain('no-cache');
      expect(stream.headers.get('x-accel-buffering')).toBe('no');
      const [opening] = await stream.read((events) => events.length > 0);
      expect(opening).toMatchObject({ event: 'ping', data: '{}' });
      expect(opening!.id).toMatch(/^\d+$/);
      expect(feedLiveHub.stats().connections).toBe(1);
      stream.close();
      expect(feedLiveHub.stats()).toMatchObject({ connections: 0, running: false });
    });

    it('sends a new post with the server stream’s data, and never rights or notification', async () => {
      const camille = await person('Camille Roux');
      const stream = await open(camille);
      await stream.read((events) => events.length > 0);
      await db.insert(minecraftServerEvent).values([
        { topic: 'feed', type: 'rights', data: { uuids: [camille.uuid] } },
        { topic: 'feed', type: 'notification', data: {} },
        { topic: 'economy', type: 'post', data: { id: 'not feed' } },
      ]);
      const { post: made } = await post(camille);
      const events = await stream.read((read) =>
        read.some((event) => event.event === 'counts' || event.event === 'post'),
      );
      const types = events.map((event) => event.event);
      expect(types).not.toContain('rights');
      expect(types).not.toContain('notification');
      const sent = events.find((event) => event.event === 'post')!;
      expect(JSON.parse(sent.data)).toEqual({
        id: made.id,
        feed: 'global',
        threadId: null,
        createdAt: made.createdAt,
      });
      expect(Number(sent.id)).toBeGreaterThan(0);
    });

    it('replays after Last-Event-ID, and resets for one it doesn’t know', async () => {
      const camille = await person('Camille Roux');
      const first = await open(camille);
      await first.read((events) => events.length > 0);
      const { post: one } = await post(camille, 'Un');
      const seen = (await first.read((events) => events.some((e) => e.event === 'post'))).find(
        (event) => event.event === 'post',
      )!;
      const { post: two } = await post(camille, 'Deux');
      await first.read((events) => events.filter((e) => e.event === 'post').length === 2);

      const again = await open(camille, { 'last-event-id': seen.id! });
      const replayed = await again.read((events) => events.some((e) => e.event === 'post'));
      expect(
        replayed
          .filter((e) => e.event === 'post')
          .map((e) => (JSON.parse(e.data) as { id: string }).id),
      ).toEqual([two.id]);
      expect(one.id).not.toBe(two.id);

      const lost = await open(camille, { 'last-event-id': 'nonsense' });
      expect((await lost.read((events) => events.length > 0))[0]!.event).toBe('reset');
    });

    it('closes the oldest stream of an account for its sixth, saying why', async () => {
      const camille = await person('Camille Roux');
      const first = await open(camille);
      await first.read((events) => events.length > 0);
      for (let n = 0; n < 4; n++) expect((await open(camille)).status).toBe(200);
      expect((await open(camille)).status).toBe(200);
      const events = await first.read(() => false);
      expect(events.at(-1)).toEqual({
        id: undefined,
        event: 'closed',
        data: '{"problem":"tooManyStreams"}',
      });
      expect(feedLiveHub.stats().connections).toBe(5);
    });

    it('closes the open streams when feed.live goes off', async () => {
      const camille = await person('Camille Roux');
      const stream = await open(camille);
      await stream.read((events) => events.length > 0);
      setFlags({ 'feed.live': false });
      // The hub reads the flags at its next poll, within a second.
      await vi.waitFor(
        () => {
          expect(feedLiveHub.stats().connections).toBe(0);
        },
        { timeout: 3000 },
      );
      expect((await stream.read(() => false)).map((event) => event.event)).toEqual(['ping']);
    });
  });

  it('reads Last-Event-ID as an event ID, none, or one to reset', () => {
    expect(feedLastEventId(undefined)).toBeNull();
    expect(feedLastEventId('')).toBeNull();
    expect(feedLastEventId(' 42 ')).toBe(42);
    expect(feedLastEventId('0')).toBe(0);
    expect(feedLastEventId('4.2')).toBe(-1);
    expect(feedLastEventId('-3')).toBe(-1);
    expect(feedLastEventId('99999999999999999999')).toBe(-1);
  });
});
