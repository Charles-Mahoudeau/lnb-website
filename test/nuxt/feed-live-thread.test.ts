import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  servePages,
  serveThread,
  settle,
  thread,
} from './feed-fixtures';
import { current, live, playStream, postEvent, serveViews, viewsAsked } from './feed-live-stream';

import type { FeedPostView } from '#shared/schemas/feed';

// A thread page's live updates in every state (docs/feed.md, "What the page does with each
// event"): replies at the end, in order and once, with the counts from `counts` only; deletions of
// a reply and of the main post; the pin of the main post; reset and its merge; and what is left
// when the page goes.

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

vi.setConfig({ testTimeout: 30_000 });

const T = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 23, 12, 0) - minutes * 60_000).toISOString();
const main = (over: Partial<FeedPostView> = {}) => post({ id: MAIN_ID, replies: 1, ...over });
/** The nth reply, later with n. */
const answer = (n: number, over: Partial<FeedPostView> = {}) =>
  post({
    id: id(500 + n),
    threadId: MAIN_ID,
    text: `Réponse ${String(n)}`,
    createdAt: T(-n),
    ...over,
  });

beforeAll(async () => {
  playStream();
  live.fallback = { status: 503, problem: 'disabled' };
  servePages(() => page({ posts: [] }));
  const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  view.unmount();
  vi.unstubAllGlobals();
});

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
  for (const stream of live.streams) expect(stream.closed).toBe(true);
  vi.unstubAllGlobals();
});

async function mountThread() {
  const view = await mountSuspended(inApp(ThreadPage), { route: `/minecraft/feed/${MAIN_ID}` });
  mounted.push(view);
  return view;
}
type View = Awaited<ReturnType<typeof mountThread>>;
const bodies = (view: View) =>
  view.findAll('article').map((article) => article.find('p.whitespace-pre-wrap').text());
const soon = (check: () => void, timeout = 3000) => vi.waitFor(check, { timeout });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('replies on a thread’s page', () => {
  it('adds replies at the end, in the order they were made, asking for them in one call', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([answer(2), answer(3)]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(answer(2)), 1);
    stream.send('post', postEvent(answer(3)), 2);
    await soon(() => {
      expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2', 'Réponse 3']);
    });
    expect(viewsAsked).toEqual([[answer(2).id, answer(3).id]]);
  });

  // Events come in commit order: a live reply still takes its place by date, oldest first.
  it('keeps replies oldest first when they were announced in another order', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([answer(2), answer(3)]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(answer(3)), 1);
    stream.send('post', postEvent(answer(2)), 2);
    await soon(() => {
      expect(bodies(view)).toHaveLength(4);
    });
    expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2', 'Réponse 3']);
  });

  it('asks for nothing it already has: the own reply the composer just added, and the main post', async () => {
    const own = answer(2, { mine: true });
    serveThread(MAIN_ID, () => thread(main(), [answer(1), own]));
    serveViews([own]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(own), 1);
    stream.send('post', postEvent(answer(1)), 2);
    await wait(1300);
    expect(viewsAsked).toEqual([]);
    expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2']);
  });

  it('shows a reply once when the page already holds it by the time the view comes back', async () => {
    const own = answer(2, { mine: true });
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([own]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(own), 1);
    await soon(() => {
      expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2']);
    });
    // The same event again (a replay after a reconnection) is not asked for, nor added twice.
    stream.send('post', postEvent(own), 1);
    await wait(1300);
    expect(viewsAsked).toEqual([[own.id]]);
    expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2']);
  });

  it('leaves a reply of another thread and a main post alone', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(post({ id: id(800), threadId: id(1) })), 1);
    stream.send('post', postEvent(post({ id: id(801), threadId: null })), 2);
    await wait(1300);
    expect(viewsAsked).toEqual([]);
    expect(bodies(view)).toEqual([main().text, 'Réponse 1']);
  });

  it('adds nothing at the end while more replies are still to load, which come with them', async () => {
    serveThread(MAIN_ID, () => thread(main({ replies: 30 }), [answer(1)], 'more'));
    serveViews([answer(40)]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(answer(40)), 1);
    stream.send('counts', { items: [{ id: MAIN_ID, likes: 12, replies: 31 }] }, 2);
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    await settle(10);
    expect(bodies(view)).toEqual([main().text, 'Réponse 1']);
    expect(view.text()).toContain('31 replies');
  });

  it('takes the counts from counts events only: a reply and its counts never count twice', async () => {
    serveThread(MAIN_ID, () => thread(main({ replies: 1 }), [answer(1)]));
    serveViews([answer(2)]);
    const view = await mountThread();
    const stream = await current();
    stream.send('post', postEvent(answer(2)), 1);
    await soon(() => {
      expect(bodies(view)).toHaveLength(3);
    });
    // The reply is in, the count of the main post is still the old one.
    expect(view.text()).toContain('1 reply');
    stream.send('counts', { items: [{ id: MAIN_ID, likes: 12, replies: 2 }] }, 2);
    await soon(() => {
      expect(view.text()).toContain('2 replies');
    });
    expect(view.text()).not.toContain('3 replies');
  });

  it('removes a deleted reply without touching any count, then follows the counts event', async () => {
    serveThread(MAIN_ID, () => thread(main({ replies: 2 }), [answer(1), answer(2)]));
    const view = await mountThread();
    const stream = await current();
    stream.send('deleted', { items: [{ id: answer(1).id, feed: 'global', threadId: MAIN_ID }] }, 1);
    await soon(() => {
      expect(bodies(view)).toEqual([main().text, 'Réponse 2']);
    });
    expect(view.text()).toContain('2 replies');
    stream.send('counts', { items: [{ id: MAIN_ID, likes: 12, replies: 1 }] }, 2);
    await soon(() => {
      expect(view.text()).toContain('1 reply');
    });
  });

  it('updates the likes and replies of a reply in place', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1, { likes: 0 })]));
    const view = await mountThread();
    const stream = await current();
    stream.send('counts', { items: [{ id: answer(1).id, likes: 7, replies: 0 }] }, 1);
    await soon(() => {
      expect(
        view.findAll('article')[1]!.find('button[aria-label^="Like"]').attributes('aria-label'),
      ).toContain('7');
    });
  });

  it('marks the thread seen again for replies to the reader, at most every two seconds', async () => {
    const one = answer(2, { answersMe: true });
    const two = answer(3, { answersMe: true });
    const own = answer(4, { mine: true });
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([one, two, own]);
    await mountThread();
    const stream = await current();
    await settle();
    vi.mocked(feedActions.markThreadSeen).mockClear();
    stream.send('post', postEvent(own), 1);
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    await settle(5);
    // An own reply answers nobody: nothing to mark.
    expect(feedActions.markThreadSeen).not.toHaveBeenCalled();
    stream.send('post', postEvent(one), 2);
    await soon(() => {
      expect(feedActions.markThreadSeen).toHaveBeenCalledTimes(1);
    });
    stream.send('post', postEvent(two), 3);
    await soon(() => {
      expect(viewsAsked).toHaveLength(3);
    });
    expect(feedActions.markThreadSeen).toHaveBeenCalledTimes(1);
    await soon(() => {
      expect(feedActions.markThreadSeen).toHaveBeenCalledTimes(2);
    }, 3000);
  });
});

describe('the main post going, being pinned, or the page being read again', () => {
  it('shows the thread as deleted when its post goes, and ignores what comes after', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    serveViews([answer(2)]);
    const view = await mountThread();
    const stream = await current();
    stream.send('deleted', { items: [{ id: MAIN_ID, feed: 'global', threadId: null }] }, 1);
    await soon(() => {
      expect(view.text()).toContain('This post was deleted');
    });
    stream.send('post', postEvent(answer(2)), 2);
    stream.send('counts', { items: [{ id: MAIN_ID, likes: 1, replies: 5 }] }, 3);
    await wait(1300);
    expect(view.find('article').exists()).toBe(false);
    expect(view.text()).toContain('This post was deleted');
  });

  it('shows a thread whose main post went with a deletion of a reply in the same event', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1), answer(2)]));
    const view = await mountThread();
    const stream = await current();
    stream.send(
      'deleted',
      {
        items: [
          { id: answer(1).id, feed: 'global', threadId: MAIN_ID },
          { id: MAIN_ID, feed: 'global', threadId: null },
          { id: answer(2).id, feed: 'global', threadId: MAIN_ID },
        ],
      },
      1,
    );
    await soon(() => {
      expect(view.text()).toContain('This post was deleted');
    });
    expect(view.find('article').exists()).toBe(false);
  });

  it('follows the pin of an announcement, both ways, and ignores the pins of a Global post', async () => {
    serveThread(
      MAIN_ID,
      () => thread(main({ feed: 'announcements', canPin: true, pinnedAt: T(5) }), [answer(1)]),
      () => announcer(),
    );
    const view = await mountThread();
    const stream = await current();
    expect(view.find('article').text()).toContain('Pinned');
    stream.send('pins', { pinned: [{ id: id(1), pinnedAt: T(0) }] }, 1);
    await soon(() => {
      expect(view.find('article').text()).not.toContain('Pinned');
    });
    stream.send(
      'pins',
      {
        pinned: [
          { id: MAIN_ID, pinnedAt: T(0) },
          { id: id(1), pinnedAt: T(1) },
        ],
      },
      2,
    );
    await soon(() => {
      expect(view.find('article').text()).toContain('Pinned');
    });
  });

  it('shows nothing pinned on a Global thread whatever the group says', async () => {
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    const view = await mountThread();
    const stream = await current();
    stream.send('pins', { pinned: [{ id: MAIN_ID, pinnedAt: T(0) }] }, 1);
    await settle(10);
    expect(view.find('article').text()).not.toContain('Pinned');
  });

  it('merges the thread read again on reset: new replies in order, deleted ones gone, the rest fresh', async () => {
    let fresh = false;
    serveThread(MAIN_ID, () =>
      fresh
        ? thread(main({ replies: 3 }), [answer(1, { likes: 9 }), answer(3), answer(4)])
        : thread(main({ replies: 3 }), [answer(1), answer(2), answer(3)]),
    );
    const view = await mountThread();
    const stream = await current();
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 3', 'Réponse 4']);
    });
    expect(
      view.findAll('article')[1]!.find('button[aria-label^="Like"]').attributes('aria-label'),
    ).toContain('9');
  });

  it('keeps the replies "Load more" brought when the reset’s first page is shorter', async () => {
    let fresh = false;
    serveThread(MAIN_ID, (query) => {
      if (query.after === 'p1') return thread(main(), [answer(3), answer(4)]);
      return fresh
        ? thread(main(), [answer(1), answer(2, { likes: 4 })], 'p1')
        : thread(main(), [answer(1), answer(2)], 'p1');
    });
    const view = await mountThread();
    const stream = await current();
    const more = view.findAll('button').find((one) => one.text().toLowerCase().includes('more'))!;
    await more.trigger('click');
    await soon(() => {
      expect(bodies(view)).toHaveLength(5);
    });
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(
        view.findAll('article')[2]!.find('button[aria-label^="Like"]').attributes('aria-label'),
      ).toContain('4');
    });
    expect(bodies(view)).toEqual([main().text, 'Réponse 1', 'Réponse 2', 'Réponse 3', 'Réponse 4']);
  });

  it('keeps what it shows when reading the thread again fails for another reason than not found', async () => {
    let fail = false;
    serveThread(MAIN_ID, () => {
      if (fail) throw createError({ status: 500 });
      return thread(main(), [answer(1)]);
    });
    const view = await mountThread();
    const stream = await current();
    fail = true;
    stream.send('reset', {});
    await settle(10);
    expect(bodies(view)).toEqual([main().text, 'Réponse 1']);
    expect(view.text()).not.toContain('This post was deleted');
    expect(useToast().toasts.value).toEqual([]);
  });
});

describe('leaving a thread', () => {
  // A page left while the views of a burst are being asked asks for no more of them.
  it('asks for no more views, and drops the answer of one in flight, once the page was left', async () => {
    const slow = deferred<{ posts: FeedPostView[] }>();
    serveThread(MAIN_ID, () => thread(main(), [answer(1)]));
    const asked: string[] = [];
    registerEndpoint('/api/feed/views', (event) => {
      asked.push(event.path);
      return slow.promise;
    });
    const view = await mountThread();
    const stream = await current();
    // Twenty-five in one second: two calls, the second only once the first is answered.
    for (let n = 0; n < 25; n++) stream.send('post', postEvent(answer(10 + n)), n + 1);
    await soon(() => {
      expect(asked).toHaveLength(1);
    });
    view.unmount();
    mounted.splice(0);
    slow.resolve({ posts: [answer(10)] });
    await settle(10);
    await wait(300);
    expect(asked).toHaveLength(1);
  });
});
