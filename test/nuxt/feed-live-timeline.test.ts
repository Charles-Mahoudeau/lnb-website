import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import FeedPage from '~/pages/minecraft/feed/index.vue';

import {
  announcer,
  clearPortals,
  clearToasts,
  deferred,
  id,
  inApp,
  me,
  page,
  post,
  servePages,
  settle,
} from './feed-fixtures';
import { current, live, playStream, postEvent, serveViews, viewsAsked } from './feed-live-stream';

import type { FeedPage as FeedPageData, FeedPostView } from '#shared/schemas/feed';

// The Feed page's live updates on the timeline, in every state the contract's "Pages" section lists
// (docs/feed.md, "Live updates in the browser"): where a new post goes when the reader is at the top,
// scrolled, or under a tall pinned group; the other tab's dot; own posts in every order; the waiting
// list across tabs; views asked once a second, 20 at a time; reset, gaps and their merge; pins moving
// posts in and out of the group; deletions of pinned and waiting posts; counts and markers.

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

// The first page shown asks for icons that fail and retry on timers: show one in real time first.
beforeAll(async () => {
  playStream();
  live.fallback = { status: 503 };
  servePages(() => page({ posts: [glob(1)] }));
  const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  view.unmount();
  vi.unstubAllGlobals();
});

const mounted: { unmount: () => void }[] = [];
let scrollTo: MockInstance<typeof window.scrollTo>;
beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
  clearToasts();
  clearPortals();
  playStream();
  vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
  vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
  scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  for (const view of mounted.splice(0)) view.unmount();
  for (const stream of live.streams) expect(stream.closed).toBe(true);
  document.querySelector('header')?.remove();
  vi.unstubAllGlobals();
});

async function mountFeed(route = '/minecraft/feed?feed=global') {
  const view = await mountSuspended(inApp(FeedPage), { route });
  mounted.push(view);
  return view;
}

type View = Awaited<ReturnType<typeof mountFeed>>;
const bodies = (view: View) =>
  view.findAll('article').map((article) => article.find('p.whitespace-pre-wrap').text());
const button = (view: View) =>
  view.findAll('button').find((one) => /new (post|announcement)/.test(one.text()));
/** Clicks a tab and waits for the page to move to its address. */
async function chooseTab(view: View, label: string) {
  const before = useRouter().currentRoute.value.fullPath;
  await view
    .findAll('[role="tab"]')
    .find((tab) => tab.text().startsWith(label))!
    .trigger('mousedown', { button: 0 });
  await vi.waitFor(() => {
    expect(useRouter().currentRoute.value.fullPath).not.toBe(before);
  });
  await settle(10);
}
const soon = (check: () => void, timeout = 3000) => vi.waitFor(check, { timeout });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Where the rows are, as a browser would lay them out: the row at an index, the bottom of the list,
 * the bottom of the site's header. A test changes them to scroll.
 */
function layout(initial: { rowTop: (index: number) => number; listBottom?: number }) {
  const state = { ...initial, headerBottom: 0 };
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (top: number, bottom = top + 100) => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    if (this.tagName === 'ARTICLE' && this.parentElement) {
      const index = Array.prototype.indexOf.call(this.parentElement.children, this);
      return rect(state.rowTop(index));
    }
    if (this.tagName === 'HEADER') return rect(0, state.headerBottom);
    if (this.classList.contains('divide-y')) return rect(0, state.listBottom ?? 0);
    return rect(0, 0);
  });
  return state;
}

const scroll = async () => {
  window.dispatchEvent(new Event('scroll'));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await settle();
};

describe('where a new post goes', () => {
  it('inserts straight away when its place is in view with room for it, newest first', async () => {
    const older = glob(-1, { text: 'Plus ancien' });
    const newer = glob(-2, { text: 'Plus récent' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([older, newer]);
    layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    // The newer post is announced first: the list still ends up newest first.
    stream.send('post', postEvent(newer), 1);
    stream.send('post', postEvent(older), 2);
    await soon(() => {
      expect(bodies(view)).toEqual(['Plus récent', 'Plus ancien', 'Post 1']);
    });
    expect(button(view)).toBeUndefined();
    expect(feedActions.markFeedSeen).toHaveBeenCalledWith('global', newer.createdAt);
  });

  it('keeps the list still when the place is above the reader, pointing up, and scrolls to the first when clicked', async () => {
    const fresh = glob(-1, { text: 'Nouveau' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([fresh]);
    layout({ rowTop: () => -400 });
    const view = await mountFeed();
    const stream = await current();
    await settle();
    vi.mocked(feedActions.markFeedSeen).mockClear();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)?.text()).toBe('1 new post');
    });
    expect(button(view)!.find('[class*="arrow-up"]').exists()).toBe(true);
    expect(bodies(view)).toEqual(['Post 1']);
    expect(feedActions.markFeedSeen).not.toHaveBeenCalled();
    await button(view)!.trigger('click');
    await settle();
    expect(bodies(view)).toEqual(['Nouveau', 'Post 1']);
    await soon(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: -416, behavior: 'smooth' });
    });
    expect(feedActions.markFeedSeen).toHaveBeenCalledWith('global', fresh.createdAt);
  });

  it('scrolls without animation for a reader who asked for less motion', async () => {
    const fresh = glob(-1);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([fresh]);
    layout({ rowTop: () => -400 });
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    );
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)).toBeDefined();
    });
    await button(view)!.trigger('click');
    await soon(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: -416, behavior: 'auto' });
    });
  });

  it('counts the site header as covering the top of the page', async () => {
    const fresh = glob(-1);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([fresh]);
    const state = layout({ rowTop: () => 50 });
    const header = document.createElement('header');
    document.body.append(header);
    state.headerBottom = 64;
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    // The row is under the header at 50: above what the reader sees.
    await soon(() => {
      expect(button(view)?.find('[class*="arrow-up"]').exists()).toBe(true);
    });
  });

  it('puts a post that would go below the screen behind a button with no arrow', async () => {
    const fresh = glob(-1);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([fresh]);
    // 800 high, a post needs 96: at 710 there is no room.
    const state = layout({ rowTop: () => 710 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)?.text()).toBe('1 new post');
    });
    expect(button(view)!.find('[class*="arrow"]').exists()).toBe(false);
    // A row at 704 still has room: the boundary is 800 - 96.
    state.rowTop = () => 704;
    await scroll();
    expect(button(view)).toBeUndefined();
    expect(bodies(view)).toEqual(['Post -1', 'Post 1']);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('shows a new announcement under a tall pinned group at the top of the page: no arrow, then in on scrolling', async () => {
    const fresh = ann(-1, { text: 'Nouvelle annonce' });
    const pinned = [3, 4, 5].map((n) => ann(n, { pinnedAt: T(n), text: `Épinglée ${String(n)}` }));
    servePages(
      () => page({ feed: 'announcements', pinned, posts: [ann(10)] }),
      () => announcer(),
    );
    serveViews([fresh]);
    // Three tall pinned posts fill the screen: the first unpinned row is at 1800 on an 800 screen.
    const state = layout({ rowTop: (index) => (index < 3 ? index * 600 : 1800) });
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)?.text()).toBe('1 new announcement');
    });
    expect(button(view)!.find('[class*="arrow"]').exists()).toBe(false);
    expect(bodies(view)).toEqual(['Épinglée 3', 'Épinglée 4', 'Épinglée 5', 'Annonce 10']);
    // The reader scrolls down until the place is in view: the post comes in under the group.
    state.rowTop = (index) => (index < 3 ? index * 600 - 1500 : 300);
    await scroll();
    expect(button(view)).toBeUndefined();
    expect(bodies(view)).toEqual([
      'Épinglée 3',
      'Épinglée 4',
      'Épinglée 5',
      'Nouvelle annonce',
      'Annonce 10',
    ]);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('lets the button bring a below-the-screen post in and scroll to it', async () => {
    const fresh = ann(-1, { text: 'Nouvelle annonce' });
    const pinned = [3, 4, 5].map((n) => ann(n, { pinnedAt: T(n) }));
    servePages(
      () => page({ feed: 'announcements', pinned, posts: [ann(10)] }),
      () => announcer(),
    );
    serveViews([fresh]);
    layout({ rowTop: (index) => (index < 3 ? index * 600 : 1800) });
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)).toBeDefined();
    });
    await button(view)!.trigger('click');
    await settle();
    expect(bodies(view)[3]).toBe('Nouvelle annonce');
    // The first of the new posts sits at 1800: 1800 - 16 under a header that is not there.
    await soon(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 1784, behavior: 'smooth' });
    });
  });

  it('flips the arrow as the reader scrolls past the place, without letting the posts in', async () => {
    const fresh = glob(-1);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([fresh]);
    const state = layout({ rowTop: () => -400 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)?.find('[class*="arrow-up"]').exists()).toBe(true);
    });
    state.rowTop = () => 5000;
    await scroll();
    expect(button(view)).toBeDefined();
    expect(button(view)!.find('[class*="arrow"]').exists()).toBe(false);
    state.rowTop = () => -10;
    await scroll();
    expect(button(view)!.find('[class*="arrow-up"]').exists()).toBe(true);
    expect(bodies(view)).toEqual(['Post 1']);
  });

  it('keeps later posts behind the button while some wait, even if their place is in view', async () => {
    const first = glob(-1, { text: 'Premier' });
    const second = glob(-2, { text: 'Second' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([first, second]);
    const state = layout({ rowTop: () => -400 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(first), 1);
    await soon(() => {
      expect(button(view)?.text()).toBe('1 new post');
    });
    // The reader is now at the top, but has not scrolled: the second queues behind the first.
    state.rowTop = () => 100;
    stream.send('post', postEvent(second), 2);
    await soon(() => {
      expect(button(view)?.text()).toBe('2 new posts');
    });
    expect(bodies(view)).toEqual(['Post 1']);
    await scroll();
    expect(bodies(view)).toEqual(['Second', 'Premier', 'Post 1']);
  });

  it('inserts into an empty feed at once, replacing its empty state', async () => {
    const fresh = glob(-1, { text: 'Le tout premier' });
    servePages(() => page({ posts: [] }));
    serveViews([fresh]);
    const view = await mountFeed();
    expect(view.text()).toContain('No posts yet');
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(bodies(view)).toEqual(['Le tout premier']);
    });
    expect(view.text()).not.toContain('No posts yet');
  });

  it('forgets what waited when the reader changes tab, and lets nothing of it come back', async () => {
    const fresh = glob(-1);
    servePages((query) =>
      query.feed === 'announcements'
        ? page({ feed: 'announcements', posts: [ann(1)] })
        : page({ posts: [glob(1)] }),
    );
    serveViews([fresh]);
    layout({ rowTop: () => -400 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)).toBeDefined();
    });
    await chooseTab(view, 'Announcements');
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 1']);
    });
    expect(button(view)).toBeUndefined();
    await chooseTab(view, 'Global');
    await soon(() => {
      expect(bodies(view)).toContain('Post 1');
    });
    expect(button(view)).toBeUndefined();
  });
});

describe('the other tab and the reader’s own posts', () => {
  it('lights the dot once, asking nothing more while it is lit', async () => {
    const one = ann(-1);
    const two = ann(-2);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([one, two]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    await soon(() => {
      expect(view.find('[role="tab"] [role="img"]').exists()).toBe(true);
    });
    expect(viewsAsked).toEqual([[one.id]]);
    stream.send('post', postEvent(two), 2);
    await wait(1300);
    // The tab already says there is something new: nothing needs asking for.
    expect(viewsAsked).toEqual([[one.id]]);
    expect(bodies(view)).toEqual(['Post 1']);
  });

  it('keeps the dot off for a person whose rights are not loaded, and for one with the dot already lit', async () => {
    const one = ann(-1);
    servePages(
      () => page({ posts: [glob(1)] }),
      () => me({ unread: { announcements: true, global: false } }),
    );
    serveViews([one]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    await wait(1300);
    expect(viewsAsked).toEqual([]);
    expect(view.find('[role="tab"] [role="img"]').exists()).toBe(true);
  });

  it('shows the own post once when the answer comes after the post was let in from behind the button', async () => {
    const own = glob(0, { mine: true, text: 'Tout neuf' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([own]);
    layout({ rowTop: () => -400 });
    const sent = deferred<{ replayed: boolean; post: FeedPostView }>();
    vi.spyOn(feedActions, 'post').mockReturnValue(sent.promise);
    const view = await mountFeed();
    const stream = await current();
    await view.find('input[placeholder="What’s new on the server?"]').trigger('focus');
    await settle(3);
    await view.find('textarea').setValue('Tout neuf');
    await view.find('form').trigger('submit');
    stream.send('post', postEvent(own), 1);
    // The event's view comes back while the reader is scrolled: it waits behind the button.
    await soon(() => {
      expect(button(view)?.text()).toBe('1 new post');
    });
    sent.resolve({ replayed: false, post: own });
    await settle(10);
    // The answer put it in the list: the button has nothing left to bring.
    expect(bodies(view)).toEqual(['Tout neuf', 'Post 1']);
    expect(button(view)).toBeUndefined();
  });

  it('shows the own post once when the answer comes first while scrolled, asking nothing', async () => {
    const own = glob(0, { mine: true, text: 'Tout neuf' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([own]);
    layout({ rowTop: () => -400 });
    const sent = deferred<{ replayed: boolean; post: FeedPostView }>();
    vi.spyOn(feedActions, 'post').mockReturnValue(sent.promise);
    const view = await mountFeed();
    const stream = await current();
    await view.find('input[placeholder="What’s new on the server?"]').trigger('focus');
    await settle(3);
    await view.find('textarea').setValue('Tout neuf');
    await view.find('form').trigger('submit');
    sent.resolve({ replayed: false, post: own });
    await settle(10);
    stream.send('post', postEvent(own), 1);
    await wait(1300);
    expect(viewsAsked).toEqual([]);
    expect(bodies(view)).toEqual(['Tout neuf', 'Post 1']);
    expect(button(view)).toBeUndefined();
  });

  it('shows the own post once when its view comes back between the request and the answer', async () => {
    const own = glob(0, { mine: true, text: 'Tout neuf' });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([own]);
    layout({ rowTop: () => 100 });
    const sent = deferred<{ replayed: boolean; post: FeedPostView }>();
    vi.spyOn(feedActions, 'post').mockReturnValue(sent.promise);
    const view = await mountFeed();
    const stream = await current();
    await view.find('input[placeholder="What’s new on the server?"]').trigger('focus');
    await settle(3);
    await view.find('textarea').setValue('Tout neuf');
    await view.find('form').trigger('submit');
    stream.send('post', postEvent(own), 1);
    await soon(() => {
      expect(bodies(view)).toEqual(['Tout neuf', 'Post 1']);
    });
    sent.resolve({ replayed: false, post: own });
    await settle(10);
    expect(bodies(view)).toEqual(['Tout neuf', 'Post 1']);
  });

  it('does not light the other tab’s dot for the reader’s own post there', async () => {
    const own = ann(-1, { mine: true });
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([own]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(own), 1);
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    await settle(10);
    expect(view.find('[role="tab"] [role="img"]').exists()).toBe(false);
  });
});

describe('views, one second at a time', () => {
  it('asks for the posts of one second in one call, and 20 at most per call', async () => {
    const posts = Array.from({ length: 25 }, (_, n) => glob(-1 - n, { text: `N${String(n)}` }));
    servePages(() => page({ posts: [glob(1)] }));
    serveViews(posts);
    layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    for (const [n, one] of posts.entries()) stream.send('post', postEvent(one), n + 1);
    await soon(() => {
      expect(bodies(view)).toHaveLength(26);
    });
    expect(viewsAsked).toHaveLength(2);
    expect(viewsAsked[0]).toEqual(posts.slice(0, 20).map((one) => one.id));
    expect(viewsAsked[1]).toEqual(posts.slice(20).map((one) => one.id));
    // Newest first, whatever the order they were asked in.
    expect(bodies(view)[0]).toBe('N24');
  });

  it('asks again a second after the first call for what comes later, not at once', async () => {
    const first = glob(-1);
    const second = glob(-2);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([first, second]);
    layout({ rowTop: () => 100 });
    await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(first), 1);
    await wait(400);
    expect(viewsAsked).toEqual([]);
    stream.send('post', postEvent(second), 2);
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    expect(viewsAsked[0]).toEqual([first.id, second.id]);
  });

  it('asks the same post only once in a second, and shows what the site returns, not what it left out', async () => {
    const kept = glob(-1);
    const gone = glob(-2);
    servePages(() => page({ posts: [glob(1)] }));
    // The site leaves the deleted one out.
    serveViews([kept]);
    layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(kept), 1);
    stream.send('post', postEvent(kept), 1);
    stream.send('post', postEvent(gone), 2);
    stream.send('deleted', { items: [{ id: gone.id, feed: 'global', threadId: null }] });
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    expect(viewsAsked[0]).toEqual([kept.id, gone.id]);
    await soon(() => {
      expect(bodies(view)).toEqual(['Post -1', 'Post 1']);
    });
  });

  it('shows nothing and does not complain when a views call fails, and goes on with the next', async () => {
    const lost = glob(-1);
    const kept = glob(-2);
    servePages(() => page({ posts: [glob(1)] }));
    let fail = true;
    registerEndpoint('/api/feed/views', () => {
      if (fail) throw createError({ status: 500 });
      return { posts: [kept] };
    });
    layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(lost), 1);
    await wait(1400);
    expect(bodies(view)).toEqual(['Post 1']);
    expect(useToast().toasts.value).toEqual([]);
    fail = false;
    stream.send('post', postEvent(kept), 2);
    await soon(() => {
      expect(bodies(view)).toEqual(['Post -2', 'Post 1']);
    });
  });

  it('asks nothing once the page is left, for what was gathered', async () => {
    const one = glob(-1);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([one]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    await settle(3);
    view.unmount();
    mounted.splice(0);
    await wait(1400);
    expect(viewsAsked).toEqual([]);
  });

  it('drops a views answer that comes after the page was left, without error', async () => {
    const one = glob(-1);
    const slow = deferred<{ posts: FeedPostView[] }>();
    servePages(() => page({ posts: [glob(1)] }));
    registerEndpoint('/api/feed/views', () => slow.promise);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    await wait(1300);
    view.unmount();
    mounted.splice(0);
    slow.resolve({ posts: [one] });
    await settle(10);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('reset and its merge', () => {
  const newer = (n: number) => glob(-n, { text: `Récent ${String(n)}` });

  it('lets the posts of a gap in from behind the button, and the list then goes on from them', async () => {
    let fresh = false;
    const cursors: (string | undefined)[] = [];
    servePages((query) => {
      cursors.push(query.before);
      if (query.before === 'c1')
        return page({ posts: [glob(0, { text: 'Entre les deux' })], next: null });
      return fresh
        ? page({ posts: [newer(3), newer(2), newer(1)], next: 'c1' })
        : page({ posts: [glob(1), glob(2)] });
    });
    layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    fresh = true;
    stream.send('reset', {});
    // More than a page went by: the new ones wait, the reader keeps what they were reading.
    await soon(() => {
      expect(button(view)?.text()).toBe('3 new posts');
    });
    expect(bodies(view)).toEqual(['Post 1', 'Post 2']);
    await button(view)!.trigger('click');
    await settle();
    expect(bodies(view)).toEqual(['Récent 3', 'Récent 2', 'Récent 1']);
    // "Load more" resumes from the cursor after the gap's newest page.
    const more = view.findAll('button').find((one) => one.text().includes('Load more'))!;
    await more.trigger('click');
    await soon(() => {
      expect(bodies(view)).toEqual(['Récent 3', 'Récent 2', 'Récent 1', 'Entre les deux']);
    });
    expect(cursors.at(-1)).toBe('c1');
  });

  it('lets a gap in when the reader scrolls to it, and counts a live post with it', async () => {
    let fresh = false;
    servePages(() =>
      fresh
        ? page({ posts: [newer(3), newer(2), newer(1)], next: 'c1' })
        : page({ posts: [glob(1), glob(2)] }),
    );
    const live4 = glob(-4, { text: 'En direct' });
    serveViews([live4]);
    const state = layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(button(view)?.text()).toBe('3 new posts');
    });
    stream.send('post', postEvent(live4), 1);
    await soon(() => {
      expect(button(view)?.text()).toBe('4 new posts');
    });
    state.rowTop = () => 120;
    await scroll();
    expect(bodies(view)).toEqual(['En direct', 'Récent 3', 'Récent 2', 'Récent 1']);
  });

  it('puts new posts of a reset at the top when there is no gap, and drops the deleted ones', async () => {
    let fresh = false;
    servePages(() =>
      fresh
        ? page({ posts: [newer(1), glob(1, { likes: 9 })] })
        : page({ posts: [glob(1), glob(2), glob(3)] }),
    );
    layout({ rowTop: () => 100 });
    const view = await mountFeed();
    const stream = await current();
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(bodies(view)).toEqual(['Récent 1', 'Post 1']);
    });
    expect(button(view)).toBeUndefined();
  });

  it('keeps new posts of a reset behind the button when the reader is scrolled', async () => {
    let fresh = false;
    servePages(() => (fresh ? page({ posts: [newer(1), glob(1)] }) : page({ posts: [glob(1)] })));
    layout({ rowTop: () => -400 });
    const view = await mountFeed();
    const stream = await current();
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(button(view)?.text()).toBe('1 new post');
    });
    expect(bodies(view)).toEqual(['Post 1']);
  });

  it('takes the pinned group of the reset, moving posts between the group and the list', async () => {
    let fresh = false;
    servePages(
      () =>
        fresh
          ? page({
              feed: 'announcements',
              pinned: [ann(2, { pinnedAt: T(0) })],
              posts: [ann(1), ann(3)],
            })
          : page({
              feed: 'announcements',
              pinned: [ann(1, { pinnedAt: T(5) })],
              posts: [ann(2), ann(3)],
            }),
      () => announcer(),
    );
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    expect(bodies(view)).toEqual(['Annonce 1', 'Annonce 2', 'Annonce 3']);
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 2', 'Annonce 1', 'Annonce 3']);
    });
    expect(view.findAll('article')[0]!.text()).toContain('Pinned');
    expect(view.findAll('article')[1]!.text()).not.toContain('Pinned');
  });

  it('keeps what it shows when reading the page again fails, quietly', async () => {
    let fail = false;
    servePages(() => {
      if (fail) throw createError({ status: 500 });
      return page({ posts: [glob(1), glob(2)] });
    });
    const view = await mountFeed();
    const stream = await current();
    fail = true;
    stream.send('reset', {});
    await settle(10);
    expect(bodies(view)).toEqual(['Post 1', 'Post 2']);
    expect(useToast().toasts.value).toEqual([]);
    expect(stream.signal.aborted).toBe(false);
  });

  it('drops a reset’s page that comes back after the reader changed tab', async () => {
    const slow = deferred<FeedPageData>();
    let calls = 0;
    servePages((query) => {
      if (query.feed === 'announcements') return page({ feed: 'announcements', posts: [ann(1)] });
      calls++;
      return calls === 1 ? page({ posts: [glob(1)] }) : slow.promise;
    });
    const view = await mountFeed();
    const stream = await current();
    stream.send('reset', {});
    await settle(3);
    await chooseTab(view, 'Announcements');
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 1']);
    });
    slow.resolve(page({ posts: [newer(1), glob(1)] }));
    await settle(10);
    expect(bodies(view)).toEqual(['Annonce 1']);
    expect(button(view)).toBeUndefined();
  });

  it('keeps the posts "Load more" brought, when the reset’s page is only the first', async () => {
    let fresh = false;
    servePages((query) => {
      if (query.before === 'c1') return page({ posts: [glob(3), glob(4)], next: null });
      return page({
        posts: fresh ? [glob(1, { likes: 7 }), glob(2)] : [glob(1), glob(2)],
        next: 'c1',
      });
    });
    const view = await mountFeed();
    const stream = await current();
    const more = view.findAll('button').find((one) => one.text().includes('Load more'))!;
    await more.trigger('click');
    await soon(() => {
      expect(bodies(view)).toEqual(['Post 1', 'Post 2', 'Post 3', 'Post 4']);
    });
    fresh = true;
    stream.send('reset', {});
    await soon(() => {
      expect(view.find('button[aria-label^="Like"]').attributes('aria-label')).toContain('7');
    });
    expect(bodies(view)).toEqual(['Post 1', 'Post 2', 'Post 3', 'Post 4']);
  });
});

describe('pins, deletions and counts', () => {
  const group = () => {
    servePages(
      () =>
        page({
          feed: 'announcements',
          pinned: [ann(1, { pinnedAt: T(9) }), ann(2, { pinnedAt: T(8) })],
          posts: [ann(3), ann(4)],
        }),
      () => announcer(),
    );
  };

  it('shows a pinned group in the order the site gives, most recently pinned first', async () => {
    group();
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('pins', {
      pinned: [
        { id: ann(4).id, pinnedAt: T(0) },
        { id: ann(1).id, pinnedAt: T(9) },
        { id: ann(2).id, pinnedAt: T(8) },
      ],
    });
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 4', 'Annonce 1', 'Annonce 2', 'Annonce 3']);
    });
    expect(
      view
        .findAll('article')
        .slice(0, 3)
        .every((one) => one.text().includes('Pinned')),
    ).toBe(true);
  });

  it('reads the group again when it names a post the page does not hold', async () => {
    const asked: Record<string, string>[] = [];
    servePages(
      (query) => {
        asked.push(query);
        if (query.limit === '1') {
          return page({
            feed: 'announcements',
            pinned: [ann(99, { pinnedAt: T(0), text: 'Annonce ailleurs' })],
            posts: [],
          });
        }
        return page({ feed: 'announcements', posts: [ann(3), ann(4)] });
      },
      () => announcer(),
    );
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('pins', { pinned: [{ id: ann(99).id, pinnedAt: T(0) }] });
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce ailleurs', 'Annonce 3', 'Annonce 4']);
    });
    expect(asked.at(-1)).toMatchObject({ feed: 'announcements', limit: '1' });
  });

  it('does not show a pinned post twice when its own post event comes after the pin', async () => {
    const fresh = ann(-1, { pinnedAt: T(-1), text: 'Annonce épinglée neuve' });
    servePages(
      (query) =>
        query.limit === '1'
          ? page({ feed: 'announcements', pinned: [fresh], posts: [] })
          : page({ feed: 'announcements', posts: [ann(3)] }),
      () => announcer(),
    );
    serveViews([fresh]);
    layout({ rowTop: () => 100 });
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    stream.send('pins', { pinned: [{ id: fresh.id, pinnedAt: fresh.pinnedAt }] });
    await soon(() => {
      expect(viewsAsked).toHaveLength(1);
    });
    await settle(10);
    expect(bodies(view).filter((text) => text === 'Annonce épinglée neuve')).toHaveLength(1);
    expect(button(view)).toBeUndefined();
  });

  it('removes a pinned post that is deleted, and the group that follows has one less', async () => {
    group();
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('deleted', { items: [{ id: ann(1).id, feed: 'announcements', threadId: null }] });
    stream.send('pins', { pinned: [{ id: ann(2).id, pinnedAt: T(8) }] });
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 2', 'Annonce 3', 'Annonce 4']);
    });
    expect(view.findAll('article')[0]!.text()).toContain('Pinned');
    expect(view.findAll('article')[1]!.text()).not.toContain('Pinned');
  });

  it('puts an unpinned post back in its place by date', async () => {
    group();
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('pins', { pinned: [{ id: ann(2).id, pinnedAt: T(8) }] });
    await soon(() => {
      expect(bodies(view)).toEqual(['Annonce 2', 'Annonce 1', 'Annonce 3', 'Annonce 4']);
    });
    // Annonce 1 is the newest by date: it is first of the list under the group.
    expect(view.findAll('article')[1]!.text()).not.toContain('Pinned');
  });

  it('removes a waiting post that is deleted before the reader looks, and its button', async () => {
    const fresh = glob(-1);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([fresh]);
    layout({ rowTop: () => -400 });
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)).toBeDefined();
    });
    stream.send('deleted', { items: [{ id: fresh.id, feed: 'global', threadId: null }] });
    await soon(() => {
      expect(button(view)).toBeUndefined();
    });
    expect(bodies(view)).toEqual(['Post 1']);
  });

  it('ignores deletions, counts and pins about posts it does not have, and the other feed', async () => {
    servePages(() => page({ posts: [glob(1), glob(2)] }));
    const view = await mountFeed();
    const stream = await current();
    stream.send('deleted', { items: [{ id: id(777), feed: 'global', threadId: null }] });
    stream.send('counts', { items: [{ id: id(777), likes: 3, replies: 4 }] });
    stream.send('pins', { pinned: [{ id: id(777), pinnedAt: T(0) }] });
    await settle(10);
    expect(bodies(view)).toEqual(['Post 1', 'Post 2']);
    expect(stream.signal.aborted).toBe(false);
  });

  it('applies counts to a pinned post and to a waiting one', async () => {
    const fresh = ann(-1, { text: 'En attente' });
    servePages(
      () =>
        page({
          feed: 'announcements',
          pinned: [ann(1, { pinnedAt: T(9), likes: 1, replies: 0 })],
          posts: [ann(3)],
        }),
      () => announcer(),
    );
    serveViews([fresh]);
    layout({ rowTop: () => -400 });
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('post', postEvent(fresh), 1);
    await soon(() => {
      expect(button(view)).toBeDefined();
    });
    stream.send('counts', {
      items: [
        { id: ann(1).id, likes: 8, replies: 2 },
        { id: fresh.id, likes: 5, replies: 1 },
      ],
    });
    await soon(() => {
      expect(view.findAll('button[aria-label^="Like"]')[0]!.attributes('aria-label')).toContain(
        '8',
      );
    });
    await button(view)!.trigger('click');
    await settle();
    expect(
      view.findAll('article')[1]!.find('button[aria-label^="Like"]').attributes('aria-label'),
    ).toContain('5');
  });

  it('marks the feed seen at most every two seconds while posts arrive at the top', async () => {
    const a = glob(-1);
    const b = glob(-2);
    servePages(() => page({ posts: [glob(1)] }));
    serveViews([a, b]);
    layout({ rowTop: () => 100 });
    await mountFeed();
    const stream = await current();
    await settle();
    vi.mocked(feedActions.markFeedSeen).mockClear();
    stream.send('post', postEvent(a), 1);
    await soon(() => {
      expect(feedActions.markFeedSeen).toHaveBeenCalledTimes(1);
    });
    stream.send('post', postEvent(b), 2);
    await soon(() => {
      expect(viewsAsked).toHaveLength(2);
    });
    await settle(3);
    // The second mark waits for its turn, then goes with the newest.
    expect(feedActions.markFeedSeen).toHaveBeenCalledTimes(1);
    await soon(() => {
      expect(feedActions.markFeedSeen).toHaveBeenCalledTimes(2);
    }, 3000);
    expect(feedActions.markFeedSeen).toHaveBeenLastCalledWith('global', b.createdAt);
  });
});

describe('markers on the reader’s own posts', () => {
  const toMe = (threadId: string, n = 301) =>
    post({ id: id(n), threadId, answersMe: true, createdAt: T(0) });

  it('raises the marker of a pinned post of the reader’s own', async () => {
    const mine = ann(1, { pinnedAt: T(9), mine: true });
    servePages(
      () => page({ feed: 'announcements', pinned: [mine], posts: [ann(3)] }),
      () => announcer(),
    );
    const reply = toMe(mine.id);
    serveViews([reply]);
    const view = await mountFeed('/minecraft/feed');
    const stream = await current();
    stream.send('post', postEvent(reply), 1);
    await soon(() => {
      expect(view.findAll('article')[0]!.text()).toContain('1 new');
    });
  });

  it('adds up several replies, and ignores one to a post the page does not show', async () => {
    const mine = glob(1, { mine: true });
    servePages(() => page({ posts: [mine] }));
    const one = toMe(mine.id, 301);
    const two = toMe(mine.id, 302);
    const elsewhere = toMe(id(999), 303);
    serveViews([one, two, elsewhere]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(one), 1);
    stream.send('post', postEvent(two), 2);
    stream.send('post', postEvent(elsewhere), 3);
    await soon(() => {
      expect(view.text()).toContain('2 new');
    });
    expect(viewsAsked.flat()).toEqual([one.id, two.id]);
  });

  it('raises nothing on someone else’s post, whoever the reply answers', async () => {
    const theirs = glob(1);
    servePages(() => page({ posts: [theirs] }));
    const reply = toMe(theirs.id);
    serveViews([reply]);
    const view = await mountFeed();
    const stream = await current();
    stream.send('post', postEvent(reply), 1);
    await wait(1300);
    // Nobody asked for it: the post isn't the reader's.
    expect(viewsAsked).toEqual([]);
    expect(view.text()).not.toContain('new');
  });
});
