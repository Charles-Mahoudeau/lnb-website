import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import ThreadPage from '~/pages/minecraft/feed/[id].vue';
import FeedPage from '~/pages/minecraft/feed/index.vue';

import {
  MAIN_ID,
  clearPortals,
  clearToasts,
  id,
  inApp,
  page,
  post,
  servePages,
  serveThread,
  settle,
  thread,
} from './feed-fixtures';
import { current, fakeClock, live, playStream, serveViews } from './feed-live-stream';

import type { FeedPostView } from '#shared/schemas/feed';

// How the Feed page keeps its live stream (docs/feed.md, "Live updates in the browser", "Sign-out
// and flags" and "As built"): what each answer means, the backoff, the hidden-tab rule, sign-out,
// leaving the page, the flag off at load, and a message that is not well formed. Every test ends
// with the page gone and nothing left behind: no open stream, no timer.

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

vi.setConfig({ testTimeout: 30_000 });

const T = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 23, 12, 0) - minutes * 60_000).toISOString();
const glob = (n: number, over: Partial<FeedPostView> = {}) =>
  post({ id: id(100 + n), feed: 'global', text: `Post ${String(n)}`, createdAt: T(n), ...over });

const mounted: { unmount: () => void }[] = [];

// The first page ever shown asks for its icons, which fail here and are retried on timers that a
// test driving the clock would then run for ever. Showing it once, in real time, lets them settle.
beforeAll(async () => {
  playStream();
  live.fallback = { status: 503 };
  servePages(() => page({ posts: [glob(1)] }));
  const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  view.unmount();
  vi.unstubAllGlobals();
});
let visibility: MockInstance<() => DocumentVisibilityState> | undefined;

beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
  clearToasts();
  clearPortals();
  playStream();
  vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
  vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
  servePages(() => page({ posts: [glob(1)] }));
  serveViews([]);
});
afterEach(async () => {
  try {
    for (const view of mounted.splice(0)) view.unmount();
    // The page is gone: nothing may still hold a stream, and no timer of the stream may be left to
    // open one (the page's own interface keeps a few timers for a moment, which run out).
    if (vi.isFakeTimers()) {
      const requests = live.requests;
      await vi.advanceTimersByTimeAsync(40 * 60_000);
      expect(live.requests).toBe(requests);
      expect(vi.getTimerCount()).toBe(0);
    }
    for (const stream of live.streams) expect(stream.closed).toBe(true);
  } finally {
    vi.useRealTimers();
    visibility?.mockRestore();
    visibility = undefined;
    vi.unstubAllGlobals();
  }
});

async function mountFeed() {
  const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
  mounted.push(view);
  return view;
}

function hide(state: 'hidden' | 'visible') {
  visibility ??= vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('what each answer to the stream request means', () => {
  for (const refused of [401, 403, 429, 503]) {
    it(`gives up for good on ${String(refused)}, for any later time`, async () => {
      live.fallback = { status: refused };
      fakeClock();
      const view = await mountFeed();
      await settle();
      expect(live.requests).toBe(1);
      await advance(10 * 60_000);
      expect(live.requests).toBe(1);
      // A tab that comes back to the page doesn't try again either.
      hide('hidden');
      await advance(120_000);
      hide('visible');
      await advance(10 * 60_000);
      expect(live.requests).toBe(1);
      expect(view.findAll('article')).toHaveLength(1);
    });
  }

  for (const failed of [500, 502, 504, 404, 400, 408, 307]) {
    it(`tries again after ${String(failed)}, which is not the site refusing the stream`, async () => {
      live.queue = [{ status: failed }];
      fakeClock();
      await mountFeed();
      await settle();
      expect(live.requests).toBe(1);
      await advance(1300);
      expect(live.requests).toBe(2);
      expect(live.streams).toHaveLength(1);
    });
  }

  it('tries again after a network error', async () => {
    live.queue = ['network'];
    fakeClock();
    await mountFeed();
    await settle();
    expect(live.requests).toBe(1);
    await advance(1300);
    expect(live.streams).toHaveLength(1);
  });

  it('tries again after a 200 with no body', async () => {
    live.queue = ['nobody'];
    fakeClock();
    await mountFeed();
    await settle();
    expect(live.requests).toBe(1);
    await advance(1300);
    expect(live.streams).toHaveLength(1);
  });

  it('tries again after the connection breaks while reading, with the last ID', async () => {
    await mountFeed();
    const first = await current();
    first.send('counts', { items: [] }, 8);
    await settle();
    fakeClock();
    first.fail();
    await advance(1300);
    const second = await current(2);
    expect(second.headers.get('last-event-id')).toBe('8');
  });

  it('gives up when the reconnection is refused with a 503, and stays quiet', async () => {
    await mountFeed();
    const first = await current();
    fakeClock();
    live.queue = [{ status: 503 }];
    first.end();
    await advance(1300);
    expect(live.requests).toBe(2);
    await advance(10 * 60_000);
    expect(live.requests).toBe(2);
    expect(useToast().toasts.value).toEqual([]);
  });
});

describe('the backoff', () => {
  // The waits between attempts that all fail, read off the times the page asked at.
  const cases = [
    ['an even shake', 0.5, [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]],
    [
      'the shortest shake, never under a second',
      0,
      [1000, 1600, 3200, 6400, 12_800, 24_000, 24_000, 24_000],
    ],
    [
      'the longest shake, never over thirty seconds',
      1,
      [1200, 2400, 4800, 9600, 19_200, 30_000, 30_000, 30_000],
    ],
  ] as const;
  for (const [name, random, waits] of cases) {
    it(`waits 1, 2, 4, 8, 16, then 30 seconds between failed attempts: ${name}`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(random);
      live.fallback = 'network';
      fakeClock();
      await mountFeed();
      await settle();
      expect(live.requests).toBe(1);
      await advance(waits.reduce((sum, wait) => sum + wait, 0) + 5);
      expect(live.requests).toBe(waits.length + 1);
      const gaps = live.at.slice(1).map((at, n) => at - live.at[n]!);
      expect(gaps).toEqual([...waits]);
    });
  }

  it('starts from one second again once a message came in', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    live.queue = ['network', 'network', 'network'];
    fakeClock();
    await mountFeed();
    await settle();
    expect(live.requests).toBe(1);
    await advance(1010 + 2010 + 4010);
    const first = await current();
    first.send('ping', {}, 3);
    await advance(0);
    await settle();
    first.end();
    await advance(0);
    const before = live.requests;
    await advance(990);
    expect(live.requests).toBe(before);
    await advance(20);
    expect(live.requests).toBe(before + 1);
  });

  it('keeps growing the wait when the stream opens and closes without a message', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await mountFeed();
    fakeClock();
    for (const wait of [1000, 2000, 4000]) {
      const stream = await current(live.streams.length || 1);
      stream.end();
      await advance(0);
      const before = live.requests;
      await advance(wait - 10);
      expect(live.requests).toBe(before);
      await advance(20);
      expect(live.requests).toBe(before + 1);
    }
  });
});

describe('the hidden tab', () => {
  it('keeps its stream when it is shown again before a minute is up, and counts again from the next hiding', async () => {
    await mountFeed();
    const stream = await current();
    fakeClock();
    hide('hidden');
    await advance(40_000);
    hide('visible');
    await advance(5000);
    hide('hidden');
    await advance(40_000);
    expect(stream.signal.aborted).toBe(false);
    await advance(20_001);
    expect(stream.signal.aborted).toBe(true);
    expect(live.requests).toBe(1);
  });

  it('does not open a second stream when it is shown while the first is healthy', async () => {
    await mountFeed();
    await current();
    fakeClock();
    hide('hidden');
    await advance(1000);
    hide('visible');
    hide('visible');
    await advance(5000);
    expect(live.requests).toBe(1);
  });

  it('stays closed while hidden, however long, and comes back once with Last-Event-ID when shown', async () => {
    await mountFeed();
    const stream = await current();
    stream.send('ping', {}, 12);
    await settle();
    fakeClock();
    hide('hidden');
    await advance(60_000);
    expect(stream.signal.aborted).toBe(true);
    await advance(30 * 60_000);
    expect(live.requests).toBe(1);
    hide('visible');
    const again = await current(2);
    expect(again.headers.get('last-event-id')).toBe('12');
    expect(live.requests).toBe(2);
  });

  it('drops a pending retry with the stream, and opens once when shown', async () => {
    live.queue = [{ status: 502 }];
    fakeClock();
    await mountFeed();
    await settle();
    expect(live.requests).toBe(1);
    hide('hidden');
    await advance(60_000);
    // The retry (due at about a second) went ahead while hidden: that is the stream hiding drops.
    const opened = live.requests;
    await advance(10 * 60_000);
    expect(live.requests).toBe(opened);
    hide('visible');
    await advance(0);
    await settle();
    expect(live.streams.filter((stream) => !stream.signal.aborted)).toHaveLength(1);
  });

  it('waits for the retry already pending when shown, instead of opening at once', async () => {
    live.queue = [{ status: 502 }];
    fakeClock();
    await mountFeed();
    await settle();
    expect(live.requests).toBe(1);
    hide('hidden');
    hide('visible');
    await advance(0);
    expect(live.requests).toBe(1);
    await advance(1300);
    expect(live.requests).toBe(2);
  });

  it('does not open for a tab opened in the background until it is first shown', async () => {
    visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await mountFeed();
    await settle(10);
    fakeClock();
    await advance(5 * 60_000);
    expect(live.requests).toBe(0);
    hide('visible');
    const stream = await current();
    expect(stream.headers.get('last-event-id')).toBeNull();
    expect(live.requests).toBe(1);
  });
});

describe('sign-out, leaving, and the flag', () => {
  it('stops a pending retry when the person signs out, and never reopens', async () => {
    live.queue = [{ status: 502 }];
    fakeClock();
    await mountFeed();
    await settle();
    expect(live.requests).toBe(1);
    const session = useAuth().session.value;
    try {
      useAuth().session.value = null;
      await advance(0);
      await advance(60_000);
      expect(live.requests).toBe(1);
      useAuth().session.value = session;
      await advance(60_000);
      expect(live.requests).toBe(1);
    } finally {
      useAuth().session.value = session;
    }
  });

  it('closes the stream and the hidden-tab timer when the person signs out', async () => {
    await mountFeed();
    const stream = await current();
    fakeClock();
    hide('hidden');
    const session = useAuth().session.value;
    try {
      useAuth().session.value = null;
      await advance(0);
      expect(stream.signal.aborted).toBe(true);
    } finally {
      useAuth().session.value = session;
    }
  });

  it('leaving the page closes the stream, cancels a retry and forgets the visibility listener', async () => {
    live.queue = ['ok'];
    const view = await mountFeed();
    const stream = await current();
    fakeClock();
    stream.end();
    await advance(0);
    // A retry is pending (about a second) and the tab is hidden: both go with the page.
    hide('hidden');
    view.unmount();
    mounted.splice(0);
    await advance(10 * 60_000);
    hide('visible');
    await advance(10 * 60_000);
    expect(live.requests).toBe(1);
  });

  it('closes an open stream when the page goes, and leaves no timer', async () => {
    const view = await mountFeed();
    const stream = await current();
    fakeClock();
    view.unmount();
    mounted.splice(0);
    expect(stream.signal.aborted).toBe(true);
  });

  it('opens nothing, asks nothing and still shows the page when feed.live was off at load', async () => {
    useFlags().states.value = { 'feed.live': false };
    try {
      const view = await mountFeed();
      await settle(10);
      fakeClock();
      await advance(5 * 60_000);
      expect(live.requests).toBe(0);
      expect(view.findAll('article')).toHaveLength(1);
      hide('hidden');
      hide('visible');
      await advance(60_000);
      expect(live.requests).toBe(0);
    } finally {
      useFlags().states.value = {};
    }
  });

  it('opens a thread page’s stream too, and leaves with it', async () => {
    serveThread(MAIN_ID, () => thread(post({ id: MAIN_ID }), []));
    const view = await mountSuspended(inApp(ThreadPage), { route: `/minecraft/feed/${MAIN_ID}` });
    mounted.push(view);
    const stream = await current();
    expect(stream.headers.get('accept')).toBe('text/event-stream');
    view.unmount();
    mounted.splice(0);
    expect(stream.signal.aborted).toBe(true);
  });
});

describe('messages that are not what the contract sends', () => {
  it('skips text that is not JSON, an unknown event, and a comment, and keeps the stream', async () => {
    await mountFeed();
    const stream = await current();
    stream.raw('event: post\ndata: not json\n\n');
    stream.raw('event: weird\ndata: {}\n\n');
    stream.raw(': a comment\n\n');
    stream.raw('retry: 10\n\n');
    stream.send('post', {}, 'x');
    stream.send('deleted', {});
    stream.send('counts', { items: [] });
    stream.send('pins', { pinned: [] });
    await settle(10);
    fakeClock();
    await advance(5000);
    expect(live.requests).toBe(1);
    expect(stream.signal.aborted).toBe(false);
    // The ID 'x' was kept as the last one: a reconnection sends it back as it came.
    stream.end();
    await advance(1300);
    const again = await current(2);
    expect(again.headers.get('last-event-id')).toBe('x');
  });

  // DEFECT (low, app/composables/useFeedLive.ts, `dispatch` and `connect`): the comment on
  // `dispatch` says anything malformed is skipped, but only text that isn't JSON is. A message
  // whose JSON is `null`, or a `deleted` whose `items` is not a list, throws inside the reader's
  // callback; `connect` takes that for a dropped connection and schedules a reconnection, but never
  // aborts the connection it was reading, so the old stream stays open while a new one opens a
  // second later (and again for every such message, each one using a place of the account's five).
  // The site never sends such a message; a broken proxy or a future event type could.
  it.fails('keeps the stream open for a message whose data is null', async () => {
    fakeClock();
    await mountFeed();
    await settle();
    const stream = await current();
    stream.send('deleted', null);
    stream.send('pins', null);
    await advance(5000);
    expect(live.requests).toBe(1);
    expect(stream.signal.aborted).toBe(false);
  });

  it.fails(
    'does not leave the connection it gave up reading open when it opens another',
    async () => {
      fakeClock();
      await mountFeed();
      await settle();
      const first = await current();
      first.send('deleted', { items: 'abc' });
      await advance(1300);
      expect(live.requests).toBe(2);
      expect(first.signal.aborted).toBe(true);
    },
  );
});
