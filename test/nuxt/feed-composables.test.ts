import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import {
  ALEX_ALT,
  MAIN_ID,
  clearToasts,
  deferred,
  id,
  me,
  noLink,
  page,
  post,
  servePages,
  serveThread,
  settle,
  thread,
  toastTitles,
} from './feed-fixtures';

import { FEED_PROBLEMS } from '#shared/schemas/feed';
import type { FeedMe, FeedName, FeedPage, FeedPostView } from '#shared/schemas/feed';

// The Feed page's composables (app/composables/useFeed.ts), against docs/feed.md ("The Feed
// page"): pagination without duplicates, the tab guard, the pinned group, threads, the writes and
// how a refusal is read, the toasts and the clock.

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

const ALT = ALEX_ALT;
const MAIN = MAIN_ID;

// $fetch is an auto-import: wrapped so a test can stand in for it, and the real one answers the rest.
mockNuxtImport('$fetch', (original) => vi.fn(original));

/** Stands in for $fetch for the rest of the test. */
function fetchWith(answer: (url: string, options?: never) => unknown) {
  vi.mocked($fetch).mockImplementation(answer as never);
}

beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.mocked($fetch).mockReset();
  vi.useRealTimers();
});

const T = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 23, 12, 0) - minutes * 60_000).toISOString();
const ann = (n: number, over: Partial<FeedPostView> = {}) =>
  post({ id: id(n), feed: 'announcements', text: `A${String(n)}`, createdAt: T(n), ...over });
const glob = (n: number, over: Partial<FeedPostView> = {}) =>
  post({ id: id(100 + n), feed: 'global', text: `G${String(n)}`, createdAt: T(n), ...over });
const ids = (posts: { id: string }[]) => posts.map((known) => known.id);

async function mountTimeline(initial: FeedName = 'global') {
  const feed = ref<FeedName>(initial);
  let timeline!: Awaited<ReturnType<typeof useFeedTimeline>>;
  const view = await mountSuspended(
    defineComponent({
      async setup() {
        timeline = await useFeedTimeline(feed);
        return () => h('div');
      },
    }),
  );
  return { feed, timeline, view };
}

describe('the timeline', () => {
  it('shows the first page of the tab, with its pinned group and its cursor', async () => {
    const pinned = ann(9, { pinnedAt: T(1) });
    servePages(() =>
      page({ feed: 'announcements', pinned: [pinned], posts: [ann(1)], next: 'c1' }),
    );
    const { timeline } = await mountTimeline('announcements');
    expect(ids(timeline.pinned.value)).toEqual([pinned.id]);
    expect(ids(timeline.posts.value)).toEqual([id(1)]);
    expect(timeline.next.value).toBe('c1');
    expect(timeline.loadingMore.value).toBe(false);
  });

  it('asks the site for the tab shown, and again when the tab changes', async () => {
    const asked: string[] = [];
    servePages((query) => {
      asked.push(query.feed!);
      return query.feed === 'global'
        ? page({ posts: [glob(1)] })
        : page({ feed: 'announcements', posts: [ann(1)] });
    });
    const { feed, timeline } = await mountTimeline('global');
    feed.value = 'announcements';
    await settle();
    expect(asked).toEqual(['global', 'announcements']);
    expect(ids(timeline.posts.value)).toEqual([id(1)]);
  });

  it('shows nothing of another tab while a tab loads, and what arrives for it afterwards', async () => {
    const slow = deferred<FeedPage>();
    servePages((query) => (query.feed === 'global' ? page({ posts: [glob(1)] }) : slow.promise));
    const { feed, timeline } = await mountTimeline('global');
    expect(ids(timeline.posts.value)).toEqual([id(101)]);
    feed.value = 'announcements';
    await nextTick();
    await settle(2);
    expect(timeline.posts.value).toEqual([]);
    expect(timeline.pinned.value).toEqual([]);
    expect(timeline.next.value).toBeNull();
    slow.resolve(page({ feed: 'announcements', posts: [ann(1)] }));
    await settle();
    expect(ids(timeline.posts.value)).toEqual([id(1)]);
  });

  it('keeps the tab shown when an earlier tab’s page arrives late', async () => {
    const slow = deferred<FeedPage>();
    let announcements = 0;
    servePages((query) => {
      if (query.feed === 'announcements') {
        announcements++;
        return slow.promise;
      }
      return page({ posts: [glob(1)] });
    });
    const { feed, timeline } = await mountTimeline('global');
    feed.value = 'announcements';
    await settle(2);
    feed.value = 'global';
    await settle();
    slow.resolve(page({ feed: 'announcements', posts: [ann(1)], next: 'late' }));
    await settle();
    expect(announcements).toBe(1);
    expect(ids(timeline.posts.value)).toEqual([id(101)]);
    expect(timeline.next.value).toBeNull();
  });

  describe('Load more', () => {
    it('adds the older page without repeating a post, and takes its cursor', async () => {
      const requests: Record<string, string>[] = [];
      servePages((query) => {
        requests.push(query);
        return query.before
          ? page({ posts: [glob(2), glob(3)], next: null })
          : page({ posts: [glob(1), glob(2)], next: 'c1' });
      });
      const { timeline } = await mountTimeline('global');
      await timeline.loadMore();
      expect(ids(timeline.posts.value)).toEqual([id(101), id(102), id(103)]);
      expect(timeline.next.value).toBeNull();
      expect(requests.at(-1)).toEqual({ feed: 'global', before: 'c1' });
    });

    it('goes on through several pages to the end, with no gap and no repeat', async () => {
      servePages((query) => {
        if (!query.before) return page({ posts: [glob(1), glob(2)], next: 'c1' });
        if (query.before === 'c1') return page({ posts: [glob(2), glob(3)], next: 'c2' });
        return page({ posts: [glob(4)], next: null });
      });
      const { timeline } = await mountTimeline('global');
      await timeline.loadMore();
      await timeline.loadMore();
      expect(ids(timeline.posts.value)).toEqual([id(101), id(102), id(103), id(104)]);
      expect(timeline.next.value).toBeNull();
    });

    it('does nothing at the end of the feed', async () => {
      let calls = 0;
      servePages((query) => {
        if (query.before) calls++;
        return page({ posts: [glob(1)], next: null });
      });
      const { timeline } = await mountTimeline('global');
      await timeline.loadMore();
      expect(calls).toBe(0);
    });

    it('sends one request for two calls made while the first is running', async () => {
      const slow = deferred<FeedPage>();
      let calls = 0;
      servePages((query) => {
        if (!query.before) return page({ posts: [glob(1)], next: 'c1' });
        calls++;
        return slow.promise;
      });
      const { timeline } = await mountTimeline('global');
      const first = timeline.loadMore();
      const second = timeline.loadMore();
      await settle(2);
      expect(timeline.loadingMore.value).toBe(true);
      slow.resolve(page({ posts: [glob(2)], next: null }));
      await Promise.all([first, second]);
      expect(calls).toBe(1);
      expect(timeline.loadingMore.value).toBe(false);
      expect(ids(timeline.posts.value)).toEqual([id(101), id(102)]);
    });

    it('throws a FeedError, keeps the list and lets the next try go out', async () => {
      let fail = true;
      servePages((query) => {
        if (!query.before) return page({ posts: [glob(1)], next: 'c1' });
        if (fail) throw createError({ status: 503, data: { problem: 'disabled', flag: 'feed' } });
        return page({ posts: [glob(2)], next: null });
      });
      const { timeline } = await mountTimeline('global');
      await expect(timeline.loadMore()).rejects.toMatchObject({ problem: 'disabled' });
      expect(ids(timeline.posts.value)).toEqual([id(101)]);
      expect(timeline.next.value).toBe('c1');
      expect(timeline.loadingMore.value).toBe(false);
      fail = false;
      await timeline.loadMore();
      expect(ids(timeline.posts.value)).toEqual([id(101), id(102)]);
    });

    it('drops a page that arrives once another tab is shown, and does not show that tab busy', async () => {
      const slow = deferred<FeedPage>();
      servePages((query) => {
        if (query.before) return slow.promise;
        return query.feed === 'global'
          ? page({ posts: [glob(1)], next: 'c1' })
          : page({ feed: 'announcements', posts: [ann(1)], next: 'a1' });
      });
      const { feed, timeline } = await mountTimeline('global');
      const running = timeline.loadMore();
      await settle(2);
      expect(timeline.loadingMore.value).toBe(true);
      feed.value = 'announcements';
      await settle();
      expect(timeline.loadingMore.value).toBe(false);
      slow.resolve(page({ posts: [glob(2)], next: null }));
      await running;
      await settle();
      expect(ids(timeline.posts.value)).toEqual([id(1)]);
      expect(timeline.next.value).toBe('a1');
    });

    it('drops a page that arrives once the list was read again, whose cursor is another', async () => {
      const slow = deferred<FeedPage>();
      let fresh = false;
      servePages((query) => {
        if (query.before) return slow.promise;
        return fresh
          ? page({ posts: [glob(0), glob(1)], next: 'fresh' })
          : page({ posts: [glob(1)], next: 'c1' });
      });
      const { timeline } = await mountTimeline('global');
      const running = timeline.loadMore();
      await settle(2);
      fresh = true;
      await timeline.refresh();
      await settle();
      expect(timeline.next.value).toBe('fresh');
      slow.resolve(page({ posts: [glob(5)], next: null }));
      await running;
      expect(ids(timeline.posts.value)).toEqual([id(100), id(101)]);
      expect(timeline.next.value).toBe('fresh');
    });

    it('does not repeat a post unpinned from beyond the loaded range when it arrives with a page', async () => {
      const old = ann(50, { pinnedAt: T(2) });
      servePages((query) =>
        query.before
          ? page({ feed: 'announcements', posts: [ann(3), { ...old, pinnedAt: null }], next: null })
          : page({ feed: 'announcements', pinned: [old], posts: [ann(1), ann(2)], next: 'c1' }),
      );
      const { timeline } = await mountTimeline('announcements');
      await timeline.setPins([]);
      expect(ids(timeline.posts.value)).toEqual([id(1), id(2), id(50)]);
      await timeline.loadMore();
      expect(ids(timeline.posts.value).filter((known) => known === id(50))).toHaveLength(1);
    });
  });

  describe('changes the page makes itself', () => {
    it('updates a post in the pinned group and in the list, and leaves the others', async () => {
      servePages(() =>
        page({
          feed: 'announcements',
          pinned: [ann(9, { pinnedAt: T(1) })],
          posts: [ann(1), ann(2)],
        }),
      );
      const { timeline } = await mountTimeline('announcements');
      timeline.update(id(9), { likes: 99, liked: true });
      timeline.update(id(2), { likes: 5 });
      timeline.update('c0000000-0000-4000-8000-00000000ffff', { likes: 1 });
      expect(timeline.pinned.value[0]).toMatchObject({ likes: 99, liked: true });
      expect(timeline.posts.value.map((known) => known.likes)).toEqual([12, 5]);
    });

    it('removes a post from the pinned group and from the list', async () => {
      servePages(() =>
        page({ feed: 'announcements', pinned: [ann(9, { pinnedAt: T(1) })], posts: [ann(1)] }),
      );
      const { timeline } = await mountTimeline('announcements');
      timeline.remove(id(9));
      timeline.remove(id(1));
      timeline.remove(id(1));
      expect(timeline.pinned.value).toEqual([]);
      expect(timeline.posts.value).toEqual([]);
    });

    it('puts a new post first, once', async () => {
      servePages(() => page({ posts: [glob(2)] }));
      const { timeline } = await mountTimeline('global');
      timeline.prepend(glob(1));
      timeline.prepend(glob(1));
      expect(ids(timeline.posts.value)).toEqual([id(101), id(102)]);
    });

    it('turns a pin into a group change without reading the site when the page holds every post', async () => {
      let reads = 0;
      servePages(() => {
        reads++;
        return page({ feed: 'announcements', posts: [ann(1), ann(2)] });
      });
      const { timeline } = await mountTimeline('announcements');
      await timeline.setPins([{ id: id(2), pinnedAt: T(0) }]);
      expect(reads).toBe(1);
      expect(ids(timeline.pinned.value)).toEqual([id(2)]);
      expect(ids(timeline.posts.value)).toEqual([id(1)]);
    });

    it('reads only the pinned group when it names a post the page lacks, and keeps what Load more added', async () => {
      const far = ann(60, { pinnedAt: T(0) });
      const requests: Record<string, string>[] = [];
      servePages((query) => {
        requests.push(query);
        if (query.before) return page({ feed: 'announcements', posts: [ann(3)], next: null });
        if (query.limit) {
          return page({
            feed: 'announcements',
            pinned: [far, { ...ann(1), pinnedAt: T(0.5) }],
            posts: [],
            next: null,
          });
        }
        return page({ feed: 'announcements', posts: [ann(1), ann(2)], next: 'c1' });
      });
      const { timeline } = await mountTimeline('announcements');
      await timeline.loadMore();
      await timeline.setPins([
        { id: far.id, pinnedAt: T(0) },
        { id: id(1), pinnedAt: T(0.5) },
      ]);
      expect(requests.at(-1)).toEqual({ feed: 'announcements', limit: '1' });
      expect(ids(timeline.pinned.value)).toEqual([far.id, id(1)]);
      expect(ids(timeline.posts.value)).toEqual([id(2), id(3)]);
    });

    it('throws a FeedError when reading the group fails, and leaves the page as it was', async () => {
      let fail = false;
      servePages((query) => {
        if (query.limit && fail) throw createError({ status: 500 });
        return page({ feed: 'announcements', posts: [ann(1)] });
      });
      const { timeline } = await mountTimeline('announcements');
      fail = true;
      await expect(timeline.setPins([{ id: id(77), pinnedAt: T(0) }])).rejects.toMatchObject({
        problem: 'failed',
      });
      expect(ids(timeline.posts.value)).toEqual([id(1)]);
      expect(timeline.pinned.value).toEqual([]);
    });

    it('drops the group it read once another tab is shown', async () => {
      const slow = deferred<FeedPage>();
      servePages((query) => {
        if (query.limit) return slow.promise;
        return query.feed === 'global'
          ? page({ posts: [glob(1)] })
          : page({ feed: 'announcements', posts: [ann(1)] });
      });
      const { feed, timeline } = await mountTimeline('announcements');
      const running = timeline.setPins([{ id: id(77), pinnedAt: T(0) }]);
      await settle(2);
      feed.value = 'global';
      await settle();
      slow.resolve(page({ feed: 'announcements', pinned: [ann(77, { pinnedAt: T(0) })] }));
      await running;
      expect(timeline.pinned.value).toEqual([]);
      expect(ids(timeline.posts.value)).toEqual([id(101)]);
    });
  });
});

describe('a thread', () => {
  const THREAD = id(500);
  const main = (over: Partial<FeedPostView> = {}) => post({ id: THREAD, replies: 2, ...over });
  const answer = (n: number, over: Partial<FeedPostView> = {}) =>
    post({ id: id(500 + n), threadId: THREAD, text: `R${String(n)}`, replies: 0, ...over });

  async function mountThread() {
    let result!: Awaited<ReturnType<typeof useFeedThread>>;
    const view = await mountSuspended(
      defineComponent({
        async setup() {
          result = await useFeedThread(THREAD);
          return () => h('div');
        },
      }),
    );
    return { thread: result, view };
  }

  it('loads the main post and its replies, oldest first, with the cursor', async () => {
    serveThread(THREAD, () => thread(main(), [answer(1), answer(2)], 'n1'));
    const { thread: t } = await mountThread();
    expect(t.post.value?.id).toBe(THREAD);
    expect(ids(t.replies.value)).toEqual([id(501), id(502)]);
    expect(t.next.value).toBe('n1');
  });

  it('has no post for a deleted thread and says why through its error', async () => {
    registerEndpoint(`/api/feed/posts/${THREAD}`, () => {
      throw createError({ status: 404, data: { problem: 'notFound' } });
    });
    const { thread: t } = await mountThread();
    expect(t.post.value).toBeNull();
    expect(t.replies.value).toEqual([]);
    expect(t.error.value?.status).toBe(404);
  });

  it('adds the next replies without repeating one, and asks with the cursor', async () => {
    const requests: Record<string, string>[] = [];
    serveThread(THREAD, (query) => {
      requests.push(query);
      return query.after
        ? thread(main(), [answer(2), answer(3)], null)
        : thread(main({ replies: 3 }), [answer(1), answer(2)], 'n1');
    });
    const { thread: t } = await mountThread();
    await t.loadMore();
    expect(ids(t.replies.value)).toEqual([id(501), id(502), id(503)]);
    expect(t.next.value).toBeNull();
    expect(requests.at(-1)).toEqual({ after: 'n1' });
    await t.loadMore();
    expect(requests).toHaveLength(2);
  });

  it('sends one request for two Load more calls made together, and survives a failure', async () => {
    const slow = deferred<unknown>();
    let calls = 0;
    let fail = false;
    serveThread(THREAD, (query) => {
      if (!query.after) return thread(main(), [answer(1)], 'n1');
      calls++;
      if (fail) throw createError({ status: 500 });
      return slow.promise;
    });
    const { thread: t } = await mountThread();
    const first = t.loadMore();
    const second = t.loadMore();
    await settle(2);
    expect(t.loadingMore.value).toBe(true);
    slow.resolve(thread(main(), [answer(2)], null));
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(t.loadingMore.value).toBe(false);

    clearNuxtData();
    fail = true;
    const { thread: again } = await mountThread();
    await expect(again.loadMore()).rejects.toMatchObject({ problem: 'failed' });
    expect(again.loadingMore.value).toBe(false);
    expect(again.next.value).toBe('n1');
  });

  it('updates the main post or a reply', async () => {
    serveThread(THREAD, () => thread(main(), [answer(1)]));
    const { thread: t } = await mountThread();
    t.update(THREAD, { likes: 40, liked: true });
    t.update(id(501), { likes: 7 });
    t.update(id(999), { likes: 1 });
    expect(t.post.value).toMatchObject({ likes: 40, liked: true });
    expect(t.replies.value[0]?.likes).toBe(7);
  });

  describe('a reply just posted', () => {
    it('goes to the end, and counts on the main post and on the reply it answers', async () => {
      serveThread(THREAD, () => thread(main({ replies: 1 }), [answer(1, { replies: 0 })]));
      const { thread: t } = await mountThread();
      t.addReply(answer(2, { replyTo: { id: id(501), anonymous: false, name: 'Alexandre M.' } }));
      expect(ids(t.replies.value)).toEqual([id(501), id(502)]);
      expect(t.post.value?.replies).toBe(2);
      expect(t.replies.value[0]?.replies).toBe(1);
    });

    it('is counted once, however often it is added', async () => {
      serveThread(THREAD, () => thread(main({ replies: 1 }), [answer(1)]));
      const { thread: t } = await mountThread();
      t.addReply(answer(2));
      t.addReply(answer(2));
      t.addReply(answer(1));
      expect(ids(t.replies.value)).toEqual([id(501), id(502)]);
      expect(t.post.value?.replies).toBe(2);
    });

    it('is not shown while more replies are still to load, but counts', async () => {
      serveThread(THREAD, () => thread(main({ replies: 3 }), [answer(1)], 'n1'));
      const { thread: t } = await mountThread();
      t.addReply(answer(4));
      expect(ids(t.replies.value)).toEqual([id(501)]);
      expect(t.post.value?.replies).toBe(4);
    });
  });

  describe('a reply deleted', () => {
    it('leaves the list, with the counts it changed', async () => {
      const first = answer(1, { replies: 1 });
      const second = answer(2, {
        replyTo: { id: first.id, anonymous: false, name: 'Alexandre M.' },
      });
      serveThread(THREAD, () => thread(main({ replies: 2 }), [first, second]));
      const { thread: t } = await mountThread();
      t.removeReply(second);
      expect(ids(t.replies.value)).toEqual([first.id]);
      expect(t.replies.value[0]?.replies).toBe(0);
      expect(t.post.value?.replies).toBe(1);
    });

    it('changes nothing for a reply the page does not hold, and never goes below zero', async () => {
      serveThread(THREAD, () => thread(main({ replies: 0 }), [answer(1)]));
      const { thread: t } = await mountThread();
      t.removeReply(answer(9));
      expect(t.post.value?.replies).toBe(0);
      t.removeReply(answer(1));
      expect(t.post.value?.replies).toBe(0);
      expect(t.replies.value).toEqual([]);
    });
  });
});

describe('the writes', () => {
  interface Seen {
    method: string;
    path: string;
    body: unknown;
  }

  /** Stands in for $fetch, recording what each write sends and answering as the site does. */
  function record() {
    const seen: Seen[] = [];
    const created = { replayed: false, post: post() };
    const like = { id: MAIN, likes: 1, liked: true };
    fetchWith((url: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? 'GET';
      seen.push({
        method,
        path: url.replace('/api/feed', '').replace(MAIN, ':id'),
        body: options.body,
      });
      if (url.endsWith('/like'))
        return Promise.resolve(method === 'PUT' ? like : { ...like, liked: false });
      if (url.endsWith('/pin')) return Promise.resolve({ pinned: [], unpinned: null });
      if (url === '/api/feed/me') return Promise.resolve(me());
      if (url.endsWith('/posts') || url.endsWith('/replies')) return Promise.resolve(created);
      return Promise.resolve(null);
    });
    return seen;
  }

  it('sends each write to its route, with the method and body of docs/feed.md', async () => {
    const seen = record();
    await feedActions.setPostingAccount(ALT);
    await feedActions.post({
      idempotencyKey: 'k1',
      feed: 'global',
      text: 'Salut',
      anonymous: true,
    });
    await feedActions.reply(MAIN, {
      idempotencyKey: 'k2',
      replyTo: null,
      text: 'Moi',
      anonymous: false,
    });
    await feedActions.setLiked(MAIN, true);
    await feedActions.setLiked(MAIN, false);
    await feedActions.pin(MAIN);
    await feedActions.pin(MAIN, true);
    await feedActions.unpin(MAIN);
    await feedActions.remove(MAIN);
    await feedActions.markFeedSeen('global', '2026-11-23T20:14:05.000Z');
    await feedActions.markThreadSeen(MAIN);
    expect(seen).toEqual([
      { method: 'PATCH', path: '/me', body: { postingAccount: ALT } },
      {
        method: 'POST',
        path: '/posts',
        body: { idempotencyKey: 'k1', feed: 'global', text: 'Salut', anonymous: true },
      },
      {
        method: 'POST',
        path: '/posts/:id/replies',
        body: { idempotencyKey: 'k2', replyTo: null, text: 'Moi', anonymous: false },
      },
      { method: 'PUT', path: '/posts/:id/like', body: undefined },
      { method: 'DELETE', path: '/posts/:id/like', body: undefined },
      { method: 'PUT', path: '/posts/:id/pin', body: { replace: false } },
      { method: 'PUT', path: '/posts/:id/pin', body: { replace: true } },
      { method: 'DELETE', path: '/posts/:id/pin', body: undefined },
      { method: 'DELETE', path: '/posts/:id', body: undefined },
      {
        method: 'POST',
        path: '/seen',
        body: { feed: 'global', upTo: '2026-11-23T20:14:05.000Z' },
      },
      { method: 'POST', path: '/posts/:id/seen', body: undefined },
    ]);
  });

  it('answers what the site answered', async () => {
    record();
    expect(await feedActions.setLiked(MAIN, true)).toEqual({ id: MAIN, likes: 1, liked: true });
    expect(
      await feedActions.post({ idempotencyKey: 'k', feed: 'global', text: 'x', anonymous: false }),
    ).toMatchObject({ replayed: false, post: { id: MAIN } });
  });

  describe('a refusal', () => {
    const refusals: [string, number][] = [
      ['notFound', 404],
      ['notLinked', 404],
      ['banned', 403],
      ['notAllowed', 403],
      ['emptyText', 400],
      ['tooLong', 400],
      ['idempotencyMismatch', 409],
      ['pinLimit', 409],
      ['notPinnable', 409],
      ['rateLimited', 429],
      ['disabled', 503],
    ];

    it.each(refusals)(
      'reads %s as a FeedError carrying the problem and its data',
      async (name, status) => {
        registerEndpoint(`/api/feed/posts/${MAIN}/pin`, {
          method: 'PUT',
          handler: () => {
            throw createError({
              status,
              statusText: name,
              data: { problem: name, oldest: { id: 'x' }, retryAfter: 9, flag: 'feed.writing' },
            });
          },
        });
        const error = await feedActions.pin(MAIN).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(FeedError);
        expect(error).toMatchObject({
          problem: name,
          data: { problem: name, oldest: { id: 'x' }, retryAfter: 9, flag: 'feed.writing' },
        });
      },
    );

    it('knows every problem the contract lists for the browser', () => {
      for (const [name] of refusals) expect(FEED_PROBLEMS).toContain(name);
    });

    it('reads a refusal without a problem code as a plain failure, whatever the status', async () => {
      for (const status of [400, 401, 403, 404, 500, 502]) {
        registerEndpoint(`/api/feed/posts/${MAIN}/pin`, {
          method: 'PUT',
          handler: () => {
            throw createError({ status });
          },
        });
        const error = await feedActions.pin(MAIN).catch((caught: unknown) => caught);
        expect(error, String(status)).toMatchObject({ problem: 'failed', data: {} });
      }
    });

    it('reads an unknown problem code as a plain failure', async () => {
      registerEndpoint(`/api/feed/posts/${MAIN}/pin`, {
        method: 'PUT',
        handler: () => {
          throw createError({ status: 409, data: { problem: 'somethingNew' } });
        },
      });
      const error = await feedActions.pin(MAIN).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ problem: 'failed' });
    });

    it('reads a network failure as a plain failure', async () => {
      fetchWith(() => Promise.reject(new TypeError('Failed to fetch')));
      const error = await feedActions.remove(MAIN).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(FeedError);
      expect(error).toMatchObject({ problem: 'failed', data: {} });
    });

    it('reads a non-object error without failing itself', async () => {
      for (const thrown of ['boom', 42, { data: null }, { data: { data: 'x' } }]) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- what a broken caller could throw
        fetchWith(() => Promise.reject(thrown));
        const error = await feedActions.remove(MAIN).catch((caught: unknown) => caught);
        expect(error, JSON.stringify(thrown)).toMatchObject({ problem: 'failed' });
      }
    });

    // The rate-limit middleware (the `api` and `write` rules) answers 429 with only the
    // `Retry-After` header; the per-account limits of the services put `retryAfter` in the body.
    const limited = (body: Record<string, unknown>, retryAfter?: string) =>
      Object.assign(new Error('429'), {
        status: 429,
        data: { statusCode: 429, data: { problem: 'rateLimited', ...body } },
        response: {
          headers: new Headers(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
        },
      });

    it('reads the seconds to wait from Retry-After when the body has none', async () => {
      fetchWith(() => Promise.reject(limited({}, '7')));
      const error = await feedActions.setLiked(MAIN, true).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ problem: 'rateLimited', data: { retryAfter: 7 } });
    });

    it('prefers the body’s seconds, and ignores a header that is not a number of seconds', async () => {
      fetchWith(() => Promise.reject(limited({ retryAfter: 12 }, '7')));
      const fromBody = await feedActions.setLiked(MAIN, true).catch((caught: unknown) => caught);
      expect(fromBody).toMatchObject({ data: { retryAfter: 12 } });
      for (const header of ['', 'soon', '0', '-3', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
        fetchWith(() => Promise.reject(limited({}, header)));
        const error = await feedActions.setLiked(MAIN, true).catch((caught: unknown) => caught);
        expect((error as FeedError).data.retryAfter, header).toBeUndefined();
      }
    });
  });
});

describe('feedErrorKey', () => {
  const messages: [string, string][] = [
    ['notFound', 'notFound'],
    ['notLinked', 'notLinked'],
    ['banned', 'banned'],
    ['notAllowed', 'notAllowed'],
    ['emptyText', 'emptyText'],
    ['tooLong', 'tooLong'],
    ['notPinnable', 'notPinnable'],
    ['rateLimited', 'rateLimited'],
  ];

  it.each(messages)('gives %s its own message, for a read and for a send', (problem, key) => {
    expect(feedErrorKey(new FeedError(problem as never))).toBe(key);
    expect(feedErrorKey(new FeedError(problem as never), { send: true })).toBe(key);
  });

  it('gives a problem with no message of its own the plain failure, or the send one', () => {
    for (const problem of [
      'idempotencyMismatch',
      'pinLimit',
      'impliedByRole',
      'isGhost',
      'issuerNotAllowed',
      'failed',
    ]) {
      expect(feedErrorKey(new FeedError(problem as never)), problem).toBe('failed');
      expect(feedErrorKey(new FeedError(problem as never), { send: true }), problem).toBe(
        'sendFailed',
      );
    }
  });

  it('tells a paused writing from the whole Feed being off, by the flag in the refusal', () => {
    expect(feedErrorKey(new FeedError('disabled', { flag: 'feed.writing' }))).toBe('writingPaused');
    expect(feedErrorKey(new FeedError('disabled', { flag: 'feed' }))).toBe('unavailable');
    expect(feedErrorKey(new FeedError('disabled', { flag: 'feed.live' }))).toBe('unavailable');
    expect(feedErrorKey(new FeedError('disabled'))).toBe('unavailable');
    expect(feedErrorKey(new FeedError('disabled', { flag: 'feed.writing' }), { send: true })).toBe(
      'writingPaused',
    );
  });

  it('reads a thrown value that is not a FeedError as a plain failure', () => {
    for (const thrown of [new Error('x'), 'x', null, undefined, { problem: 'banned' }]) {
      expect(feedErrorKey(thrown)).toBe('failed');
      expect(feedErrorKey(thrown, { send: true })).toBe('sendFailed');
    }
  });

  it('says a post sent then deleted only for notFound, and only when asked', () => {
    expect(feedErrorKey(new FeedError('notFound'), { sentThenDeleted: true })).toBe(
      'sentThenDeleted',
    );
    expect(feedErrorKey(new FeedError('banned'), { sentThenDeleted: true })).toBe('banned');
    expect(feedErrorKey(new FeedError('notFound'), { send: true })).toBe('notFound');
  });
});

describe('the toasts', () => {
  async function toasts() {
    let result!: ReturnType<typeof useFeedToasts>;
    await mountSuspended(
      defineComponent({
        setup() {
          result = useFeedToasts();
          return () => h('div');
        },
      }),
    );
    clearToasts();
    return result;
  }

  it('says what worked, in success colours', async () => {
    const feedToasts = await toasts();
    feedToasts.done('Posted');
    await settle();
    const [shown] = useToast().toasts.value;
    expect(shown).toMatchObject({ title: 'Posted', color: 'success' });
  });

  it('says what a refusal means in the person’s language, with the seconds to wait', async () => {
    const feedToasts = await toasts();
    feedToasts.failed(new FeedError('rateLimited', { retryAfter: 42 }));
    feedToasts.failed(new FeedError('rateLimited'));
    feedToasts.failed(new FeedError('rateLimited', { retryAfter: 'soon' }));
    await settle();
    expect(toastTitles()).toEqual([
      'You’re going a bit fast. Try again in 42 s.',
      'You’re going a bit fast. Try again in 60 s.',
      'You’re going a bit fast. Try again in 60 s.',
    ]);
    expect(useToast().toasts.value.every((toast) => toast.color === 'error')).toBe(true);
  });

  it('names a failed send as safe to send again, and a failed read as not', async () => {
    const feedToasts = await toasts();
    feedToasts.failed(new FeedError('failed'), { send: true });
    feedToasts.failed(new FeedError('failed'));
    feedToasts.failed(new FeedError('disabled', { flag: 'feed.writing' }), { send: true });
    feedToasts.failed(new FeedError('notFound'), { sentThenDeleted: true });
    await settle();
    const titles = toastTitles();
    expect(titles[0]).toContain('won’t be posted twice');
    expect(titles[1]).not.toContain('posted twice');
    expect(titles[2]).toBe('Posting is paused for now. Try again later.');
    expect(titles[3]).toContain('went through earlier');
  });
});

describe('the clock', () => {
  async function mountClock() {
    return mountSuspended(
      defineComponent({
        setup() {
          useFeedClock();
          return () => h('div');
        },
      }),
    );
  }

  it('is one value for every post, set to now when the page mounts', async () => {
    useFeedNow().value = 1;
    const before = Date.now();
    const view = await mountClock();
    expect(useFeedNow().value).toBeGreaterThanOrEqual(before);
    view.unmount();
  });

  it('moves every 30 seconds, not before', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const view = await mountClock();
    const start = useFeedNow().value;
    vi.advanceTimersByTime(29_999);
    expect(useFeedNow().value).toBe(start);
    vi.advanceTimersByTime(1);
    expect(useFeedNow().value).toBe(start + 30_000);
    view.unmount();
  });

  it('stops when the page goes, and does not leave a timer behind', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const view = await mountClock();
    expect(vi.getTimerCount()).toBe(1);
    const start = useFeedNow().value;
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(useFeedNow().value).toBe(start);
  });

  it('starts again from now when the page is opened again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const first = await mountClock();
    first.unmount();
    vi.advanceTimersByTime(600_000);
    const second = await mountClock();
    expect(useFeedNow().value).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);
    second.unmount();
  });
});

describe('who may write', () => {
  const cases: [string, FeedMe | null | undefined, boolean][] = [
    ['nothing loaded', null, false],
    ['nothing loaded yet', undefined, false],
    ['a person who may write', me(), true],
    ['an announcer', me({ rights: { write: true, announce: true, moderate: false } }), true],
    ['no linked account', noLink(), false],
    [
      'a Warden ban',
      me({ banned: true, rights: { write: false, announce: false, moderate: false } }),
      false,
    ],
    ['writing paused', me({ writing: false }), false],
    [
      'linked but with no right to write',
      me({ rights: { write: false, announce: false, moderate: false } }),
      false,
    ],
    ['unlinked with a right left over', me({ linked: false }), false],
  ];
  it.each(cases)('%s', (_name, value, expected) => {
    expect(canWriteFeed(value)).toBe(expected);
  });
});
