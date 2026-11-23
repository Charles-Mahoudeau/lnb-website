import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ThreadPage from '~/pages/minecraft/feed/[id].vue';
import FeedPage from '~/pages/minecraft/feed/index.vue';

import {
  MAIN_ID,
  announcer,
  clearPortals,
  clearToasts,
  deferred,
  id,
  inApp,
  page,
  post,
  queryOf,
  servePages,
  serveThread,
  settle,
  thread,
} from './feed-fixtures';

import type { FeedPostView } from '#shared/schemas/feed';

// The Feed page's live updates (docs/feed.md, "Live updates in the browser"), with the stream
// played by the test: new posts at the top or behind the "N new posts" button, the other tab's
// dot, markers, deletions, counts, pins, reset, a thread's new replies and deleted state, never a
// post twice, and the connection itself (stop on 503, 429 and 401, retry after a drop with
// Last-Event-ID, close with the page, on sign-out and in a tab hidden for long).

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

vi.setConfig({ testTimeout: 30_000 });

const T = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 23, 12, 0) - minutes * 60_000).toISOString();
const glob = (n: number, over: Partial<FeedPostView> = {}) =>
  post({ id: id(100 + n), feed: 'global', text: `Post ${String(n)}`, createdAt: T(n), ...over });
const ann = (n: number, over: Partial<FeedPostView> = {}) =>
  post({
    id: id(n),
    feed: 'announcements',
    text: `Annonce ${String(n)}`,
    createdAt: T(n),
    ...over,
  });

// --- The stream, played by the test -----------------------------------------------------------

interface Played {
  headers: Headers;
  signal: AbortSignal;
  send: (event: string, data: unknown, eventId?: number) => void;
  /** The server ends the response (a restart, a proxy's timeout). */
  end: () => void;
}

const realFetch = globalThis.fetch;
let streams: Played[] = [];
let status = 200;
/** Every stream request, answered or refused. */
let requests = 0;

/** Answers the stream requests with `status`, and a stream the test writes into on 200. */
function playStream() {
  streams = [];
  status = 200;
  requests = 0;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/feed/events')) return realFetch(input, init);
    requests++;
    if (status !== 200) {
      // The site's own refusals, as Nitro answers them.
      const problem = status === 503 ? 'disabled' : status === 429 ? 'tooManyStreams' : undefined;
      return Promise.resolve({
        status,
        ok: false,
        body: null,
        json: () => Promise.resolve({ statusCode: status, data: { problem } }),
      });
    }
    const queue: (Uint8Array | null)[] = [];
    let wake: (() => void) | null = null;
    const signal = init!.signal!;
    const push = (chunk: Uint8Array | null) => {
      queue.push(chunk);
      wake?.();
    };
    signal.addEventListener('abort', () => {
      push(null);
    });
    const encoder = new TextEncoder();
    streams.push({
      headers: new Headers(init?.headers),
      signal,
      send: (event, data, eventId) => {
        push(
          encoder.encode(
            `${eventId === undefined ? '' : `id: ${String(eventId)}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      },
      end: () => {
        push(null);
      },
    });
    const body = {
      getReader: () => ({
        async read() {
          while (!queue.length) await new Promise<void>((resolve) => (wake = resolve));
          const chunk = queue.shift() as Uint8Array | null;
          if (chunk === null) {
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

/** The stream the page holds now, once it opened. */
async function current(count = 1): Promise<Played> {
  // A reconnection waits 1 to 1.2 seconds first.
  await vi.waitFor(
    () => {
      expect(streams).toHaveLength(count);
    },
    { timeout: 3000 },
  );
  return streams[count - 1]!;
}

let viewsAsked: string[][] = [];
/** `GET /api/feed/views`, answering the views of the posts given, in the order asked. */
function serveViews(known: FeedPostView[]) {
  viewsAsked = [];
  registerEndpoint('/api/feed/views', (event) => {
    const ids = queryOf(event).ids!.split(',');
    viewsAsked.push(ids);
    return { posts: ids.flatMap((wanted) => known.filter((one) => one.id === wanted)) };
  });
}

/** Waits for what the page does a second later: new posts' views are asked once a second. */
function soon(check: () => void) {
  return vi.waitFor(check, { timeout: 3000 });
}

const postEvent = (one: FeedPostView) => ({
  id: one.id,
  feed: one.feed,
  threadId: one.threadId,
  createdAt: one.createdAt,
});

// --- Mounting -----------------------------------------------------------------------------------

const mounted: { unmount: () => void }[] = [];
beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
  clearToasts();
  clearPortals();
  playStream();
  vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
  vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
});
afterEach(() => {
  for (const view of mounted.splice(0)) view.unmount();
  vi.unstubAllGlobals();
});

async function mountFeed(route = '/minecraft/feed?feed=global') {
  const view = await mountSuspended(inApp(FeedPage), { route });
  mounted.push(view);
  return view;
}

async function mountThread() {
  const view = await mountSuspended(inApp(ThreadPage), { route: `/minecraft/feed/${MAIN_ID}` });
  mounted.push(view);
  return view;
}

type View = Awaited<ReturnType<typeof mountFeed>>;
const bodies = (view: View) =>
  view.findAll('article').map((article) => article.find('p.whitespace-pre-wrap').text());
const newPostsButton = (view: View) =>
  view.findAll('button').find((button) => /new (post|announcement)/.test(button.text()));

/** Puts every row above the visible area, as when the reader scrolled down the list. */
function scrolledDown() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: -400,
    bottom: -300,
    left: 0,
    right: 0,
    width: 0,
    height: 100,
    x: 0,
    y: -400,
    toJSON: () => ({}),
  });
}

describe('the stream of the Feed page', () => {
  it('opens one stream in the browser once shown, and closes it when the page goes', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    const view = await mountFeed();
    const stream = await current();
    expect(stream.headers.get('accept')).toBe('text/event-stream');
    expect(stream.headers.get('last-event-id')).toBeNull();
    view.unmount();
    mounted.splice(0);
    expect(stream.signal.aborted).toBe(true);
  });

  for (const refused of [503, 429, 401]) {
    it(`stops, silently, on the site’s ${String(refused)}: the page works as loaded`, async () => {
      servePages(() => page({ posts: [glob(1)] }));
      status = refused;
      const view = await mountFeed();
      await soon(() => {
        expect(requests).toBe(1);
      });
      // Longer than the first retry would wait.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(requests).toBe(1);
      expect(bodies(view)).toEqual(['Post 1']);
      expect(useToast().toasts.value).toEqual([]);
    });
  }

  it('tries again after a refusal that is not the site’s (a proxy’s 502)', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    status = 502;
    await mountFeed();
    await soon(() => {
      expect(requests).toBe(1);
    });
    status = 200;
    await current(1);
    expect(requests).toBe(2);
  });

  it('comes back after a dropped connection, with the last event’s ID', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    await mountFeed();
    const first = await current();
    first.send('counts', { items: [] }, 41);
    await settle();
    first.end();
    const second = await current(2);
    expect(second.headers.get('last-event-id')).toBe('41');
  });

  it('closes when the person signs out', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    await mountFeed();
    const stream = await current();
    const session = useAuth().session.value;
    try {
      useAuth().session.value = null;
      await settle();
      expect(stream.signal.aborted).toBe(true);
    } finally {
      useAuth().session.value = session;
    }
  });

  it('drops the stream of a tab hidden for a minute, and takes it again when shown', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    await mountFeed();
    const stream = await current();
    stream.send('ping', {}, 7);
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(59_000);
    expect(stream.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(stream.signal.aborted).toBe(true);
    vi.useRealTimers();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    const again = await current(2);
    expect(again.headers.get('last-event-id')).toBe('7');
  });

  it('opens no stream while feed.live is off for the page', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    useFlags().states.value = { 'feed.live': false };
    try {
      await mountFeed();
      await settle(10);
      expect(streams).toHaveLength(0);
    } finally {
      useFlags().states.value = {};
    }
  });
});

describe('new posts on the Feed page', () => {
  it('puts new posts of the tab shown at the top, asking their views in one call', async () => {
    const one = glob(-1, { text: 'Nouveau 1' });
    const two = glob(-2, { text: 'Nouveau 2' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([one, two]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    stream.send('post', postEvent(two), 2);
    await soon(() => {
      expect(bodies(view)).toEqual(['Nouveau 2', 'Nouveau 1', 'Post 1']);
    });
    expect(viewsAsked).toEqual([[one.id, two.id]]);
    expect(feedActions.markFeedSeen).toHaveBeenCalledWith('global', two.createdAt);
  });

  it('keeps the list still when the reader is further down, behind "N new posts"', async () => {
    const one = glob(-1, { text: 'Nouveau 1' });
    const two = glob(-2, { text: 'Nouveau 2' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([one, two]);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const view = await mountFeed();
    scrolledDown();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    await soon(() => {
      expect(newPostsButton(view)?.text()).toBe('1 new post');
    });
    stream.send('post', postEvent(two), 2);
    await soon(() => {
      expect(newPostsButton(view)?.text()).toBe('2 new posts');
    });
    expect(bodies(view)).toEqual(['Post 1']);
    // The place they go is above what the reader sees: the button points up.
    expect(newPostsButton(view)!.find('[class*="arrow-up"]').exists()).toBe(true);
    await newPostsButton(view)!.trigger('click');
    await settle();
    expect(bodies(view)).toEqual(['Nouveau 2', 'Nouveau 1', 'Post 1']);
    expect(newPostsButton(view)).toBeUndefined();
    await soon(() => {
      expect(scroll).toHaveBeenCalled();
    });
  });

  it('says "new announcements" on Announcements', async () => {
    const fresh = ann(-1, { text: 'Nouvelle annonce' });
    servePages(() => page({ feed: 'announcements', posts: [ann(1)] }));
    serveViews([fresh]);
    const view = await mountFeed('/minecraft/feed');
    scrolledDown();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(newPostsButton(view)?.text()).toBe('1 new announcement');
    });
  });

  it('lights the other tab’s dot for someone else’s post there, not for one’s own', async () => {
    const mine = ann(-1, { mine: true });
    const theirs = ann(-2);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([mine, theirs]);
    const view = await mountFeed();
    const stream = await current();
    const dot = () => view.find('[role="tab"] [role="img"]').exists();
    stream.send('post', postEvent(mine), 1);
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    await settle();
    expect(dot()).toBe(false);
    stream.send('post', postEvent(theirs), 2);
    await soon(() => {
      expect(dot()).toBe(true);
    });
    expect(bodies(view)).toEqual(['Post 1']);
  });

  it('asks nothing for a post the page holds, and never shows a post twice', async () => {
    const held = glob(1);
    servePages(() => page({ posts: [held] }));
    serveViews([held]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(held), 1);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(viewsAsked).toEqual([]);
    expect(bodies(view)).toEqual(['Post 1']);
  });

  for (const order of ['answer first', 'event first'] as const) {
    it(`shows the reader’s own new post once, ${order}`, async () => {
      const own = glob(0, { mine: true, text: 'Tout neuf' });
      servePages(() => page({ posts: [glob(1)] }));
      serveViews([own]);
      const sent = deferred<{ replayed: boolean; post: FeedPostView }>();
      vi.spyOn(feedActions, 'post').mockReturnValue(sent.promise);
      const view = await mountFeed();
      const stream = await current();
      await view.find('input[placeholder="What’s new on the server?"]').trigger('focus');
      await settle(3);
      await view.find('textarea').setValue('Tout neuf');
      await view.find('form').trigger('submit');
      if (order === 'answer first') {
        sent.resolve({ replayed: false, post: own });
        await settle(10);
        stream.send('post', postEvent(own), 1);
        await new Promise((resolve) => setTimeout(resolve, 1300));
      } else {
        stream.send('post', postEvent(own), 1);
        await soon(() => {
          expect(viewsAsked).toHaveLength(1);
        });
        await settle(5);
        sent.resolve({ replayed: false, post: own });
        await settle(10);
      }
      expect(bodies(view)).toEqual(['Tout neuf', 'Post 1']);
    });
  }

  it('raises the marker of the reader’s own post for a reply to them, and no other', async () => {
    const mine = glob(1, { mine: true, text: 'À moi' });
    const other = glob(2, { text: 'Pas à moi' });
    const toMe = post({ id: id(301), threadId: mine.id, answersMe: true, createdAt: T(0) });
    const ownReply = post({ id: id(302), threadId: mine.id, mine: true, createdAt: T(0) });
    servePages(() => page({ posts: [mine, other] }));
    serveViews([toMe, ownReply]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(post({ id: id(303), threadId: other.id })), 1);
    stream.send('post', postEvent(ownReply), 2);
    stream.send('post', postEvent(toMe), 3);
    await soon(() => {
      expect(view.text()).toContain('1 new');
    });
    // Nothing asked for the reply in someone else's thread.
    expect(viewsAsked.flat()).toEqual([ownReply.id, toMe.id]);
    expect(view.findAll('article')[1]!.text()).not.toContain('new');
  });
});

describe('changes to what the Feed page shows', () => {
  it('removes deleted posts, waiting ones included', async () => {
    servePages(() => page({ posts: [glob(1), glob(2), glob(3)] }));
    const view = await mountFeed();
    const stream = await current();
    stream.send('deleted', {
      items: [
        { id: glob(2).id, feed: 'global', threadId: null },
        { id: id(999), feed: 'global', threadId: glob(2).id },
      ],
    });
    await soon(() => {
      expect(bodies(view)).toEqual(['Post 1', 'Post 3']);
    });
  });

  it('updates counts in place, keeping the reader’s own like', async () => {
    servePages(() => page({ posts: [glob(1, { likes: 1, liked: true, replies: 0 })] }));
    const view = await mountFeed();
    const stream = await current();
    stream.send('counts', { items: [{ id: glob(1).id, likes: 5, replies: 2 }] });
    await soon(() => {
      expect(view.find('button[aria-label^="Like"]').attributes('aria-label')).toContain('5');
    });
    expect(view.find('button[aria-label^="Like"]').attributes('aria-pressed')).toBe('true');
    expect(view.text()).toContain('2');
  });

  it('moves posts into and out of the pinned group on Announcements', async () => {
    servePages(
      () => page({ feed: 'announcements', posts: [ann(1), ann(2)] }),
      () => announcer(),
    );
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('pins', { pinned: [{ id: ann(2).id, pinnedAt: T(0) }] });
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 2', 'Annonce 1']);
    });
    expect(view.findAll('article')[0]!.text()).toContain('Pinned');
    stream.send('pins', { pinned: [] });
    await soon(() => {
      expect(view.findAll('article')[0]!.text()).not.toContain('Pinned');
    });
    expect(bodies(view)).toEqual(['Annonce 1', 'Annonce 2']);
  });

  it('ignores pins on Global', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    const view = await mountFeed();
    const stream = await current();
    stream.send('pins', { pinned: [{ id: ann(2).id, pinnedAt: T(0) }] });
    await settle(10);
    expect(bodies(view)).toEqual(['Post 1']);
  });

  it('reads the first page again on reset and merges it', async () => {
    let fresh = false;
    servePages(() =>
      fresh
        ? page({ posts: [glob(0, { text: 'Arrivé pendant la coupure' }), glob(1, { likes: 7 })] })
        : page({ posts: [glob(1), glob(2)] }),
    );
    const view = await mountFeed();
    const stream = await current();
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(bodies(view)).toEqual(['Arrivé pendant la coupure', 'Post 1']);
    });
    expect(view.find('button[aria-label^="Like"]').exists()).toBe(true);
  });
});

describe('the stream of a thread’s page', () => {
  const main = () => post({ id: MAIN_ID, replies: 1 });
  const answer = (n: number, over: Partial<FeedPostView> = {}) =>
    post({
      id: id(500 + n),
      threadId: MAIN_ID,
      text: `Réponse ${String(n)}`,
      createdAt: T(-n),
      ...over,
    });

  it('adds a new reply at the end, with the count from the counts event', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([answer(2)]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(answer(2)), 1);
    stream.send('counts', { items: [{ id: MAIN_ID, likes: 12, replies: 2 }] }, 2);
    await soon(() => {
      expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2']);
    });
    expect(view.text()).toContain('2 replies');
    // A reply in another thread is not asked for.
    stream.send('post', postEvent(post({ id: id(700), threadId: id(1) })), 3);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(viewsAsked).toEqual([[answer(2).id]]);
  });

  it('marks the thread seen again for a reply to the reader, raising no marker', async () => {
    const toMe = answer(2, { answersMe: true });
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([toMe]);
    await mountThread();
    const stream = await current();
    await settle();
    vi.mocked(feedActions.markThreadSeen).mockClear();
    stream.send('post', postEvent(toMe), 1);
    await soon(() => {
      expect(feedActions.markThreadSeen).toHaveBeenCalledWith(MAIN_ID);
    });
  });

  it('removes a deleted reply, and shows the thread as deleted when its post goes', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1), answer(2)]));
    const view = await mountThread();
    const stream = await current();
    stream.send('deleted', { items: [{ id: answer(1).id, feed: 'global', threadId: MAIN_ID }] });
    await soon(() => {
      expect(bodies(view)).toEqual([main().text, 'Réponse 2']);
    });
    stream.send('deleted', {
      items: [
        { id: MAIN_ID, feed: 'global', threadId: null },
        { id: answer(2).id, feed: 'global', threadId: MAIN_ID },
      ],
    });
    await soon(() => {
      expect(view.text()).toContain('This post was deleted');
    });
    expect(view.find('article').exists()).toBe(false);
  });

  it('follows the pin of its main post', async () => {
    serveThread(
      MAIN_ID,
      () => thread(post({ id: MAIN_ID, feed: 'announcements', canPin: true }), []),
      () => announcer(),
    );
    const view = await mountThread();
    const stream = await current();
    stream.send('pins', { pinned: [{ id: MAIN_ID, pinnedAt: T(0) }] });
    await soon(() => {
      expect(view.find('article').text()).toContain('Pinned');
    });
  });

  it('reads the thread again on reset, and shows it deleted when it is gone', async () => {
    let gone = false;
    serveThread(MAIN_ID, () => {
      if (gone) throw createError({ status: 404, data: { problem: 'notFound' } });
      return thread(main(), [answer(1)]);
    });
    const view = await mountThread();
    const stream = await current();
    gone = true;
    stream.send('reset', {});
    await soon(() => {
      expect(view.text()).toContain('This post was deleted');
    });
  });
});
