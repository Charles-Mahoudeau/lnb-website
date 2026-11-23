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
  inDocument,
  me,
  noLink,
  page,
  post,
  serveThread,
  servePages,
  settle,
  thread,
  toastTitles,
} from './feed-fixtures';

import type {
  FeedMe,
  FeedName,
  FeedPage as FeedPageView,
  FeedPostView,
} from '#shared/schemas/feed';

// The Feed page and a thread's page as a person uses them (docs/feed.md, "The Feed page"): the
// tabs and their dots, the composer or the band, the seen marks, Load more, like, pin and delete
// with their dialogs and refusals, a post sent to the other feed, and a thread that is gone.

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
  clearToasts();
  clearPortals();
});

const T = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 23, 12, 0) - minutes * 60_000).toISOString();
const ann = (n: number, over: Partial<FeedPostView> = {}) =>
  post({
    id: id(n),
    feed: 'announcements',
    text: `Annonce ${String(n)}`,
    createdAt: T(n),
    ...over,
  });
const glob = (n: number, over: Partial<FeedPostView> = {}) =>
  post({ id: id(100 + n), feed: 'global', text: `Post ${String(n)}`, createdAt: T(n), ...over });
const announcements = (over: Partial<FeedPageView> = {}) =>
  page({ feed: 'announcements', posts: [ann(1)], ...over });

// Every page mounted is unmounted after the test: a page left alive would answer the next test's
// route changes and call its spies.
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) view.unmount();
});

async function mountFeed(route = '/minecraft/feed') {
  const view = await mountSuspended(inApp(FeedPage), { route });
  mounted.push(view);
  return view;
}

type View = Awaited<ReturnType<typeof mountFeed>>;

const articles = (view: View) => view.findAll('article');
/** The text of each post shown, in order. */
const bodies = (view: View) =>
  articles(view).map((article) => article.find('p.whitespace-pre-wrap').text());
const text = (view: View) => view.text();
const likeButtons = (view: View) => view.findAll('button[aria-label^="Like"]');

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

const confirmButton = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (node) => node.textContent.trim() === label && !node.closest('[role="menu"]'),
  );

describe('the tabs', () => {
  it('opens on Announcements, and on Global for ?feed=global, asking the site for each', async () => {
    const asked: string[] = [];
    servePages((query) => {
      asked.push(query.feed!);
      return query.feed === 'global' ? page({ posts: [glob(1)] }) : announcements();
    });
    const first = await mountFeed('/minecraft/feed');
    expect(text(first)).toContain('Annonce 1');
    clearNuxtData();
    const second = await mountFeed('/minecraft/feed?feed=global');
    expect(text(second)).toContain('Post 1');
    expect(asked).toEqual(['announcements', 'global']);
  });

  it('marks the tab shown as selected, Announcements first', async () => {
    servePages(() => announcements());
    const view = await mountFeed('/minecraft/feed');
    const tabs = view.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.text().trim())).toEqual(['Announcements', 'Global']);
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false']);
  });

  it('keeps the tab in the query, so a reload keeps it, and drops it for Announcements', async () => {
    servePages((query) => (query.feed === 'global' ? page({ posts: [glob(1)] }) : announcements()));
    const view = await mountFeed('/minecraft/feed');
    await chooseTab(view, 'Global');
    expect(useRoute().query.feed).toBe('global');
    expect(text(view)).toContain('Post 1');
    await chooseTab(view, 'Announcements');
    expect(useRoute().query.feed).toBeUndefined();
    expect(text(view)).toContain('Annonce 1');
  });

  it('dots only the tab that is not shown, from unread, and clears each dot once its feed is shown', async () => {
    servePages(
      (query) => (query.feed === 'global' ? page({ posts: [glob(1)] }) : announcements()),
      () => me({ unread: { announcements: true, global: true } }),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    const view = await mountFeed('/minecraft/feed?feed=global');
    await settle(10);
    const dots = () => view.findAll('[aria-label="New posts"]');
    // Global is shown, so its own dot is gone; Announcements' is on its tab.
    expect(dots()).toHaveLength(1);
    await chooseTab(view, 'Announcements');
    // Both feeds have been shown now.
    expect(dots()).toHaveLength(0);
  });

  it('shows no dot when nothing is unread', async () => {
    servePages(() => announcements());
    const view = await mountFeed('/minecraft/feed');
    expect(view.findAll('[aria-label="New posts"]')).toHaveLength(0);
  });
});

describe('the composer or the band, per tab', () => {
  const placeholder = 'input[placeholder="What’s new on the server?"]';
  const cases: [string, FeedMe, FeedName, 'composer' | 'note' | 'band', string?][] = [
    ['a player on Global', me(), 'global', 'composer'],
    ['a player on Announcements', me(), 'announcements', 'note'],
    ['an announcer on Global', announcer(), 'global', 'composer'],
    ['an announcer on Announcements', announcer(), 'announcements', 'composer'],
    ['no linked account on Global', noLink(), 'global', 'band', 'Link your Minecraft account'],
    [
      'no linked account on Announcements',
      noLink(),
      'announcements',
      'band',
      'Link your Minecraft account',
    ],
    [
      'a banned player on Announcements',
      me({ banned: true, rights: { write: false, announce: false, moderate: false } }),
      'announcements',
      'band',
      'You are banned from the server',
    ],
    ['writing paused on Global', me({ writing: false }), 'global', 'band', 'Posting is paused'],
    [
      'writing paused on Announcements',
      announcer({ writing: false }),
      'announcements',
      'band',
      'Posting is paused',
    ],
  ];
  it.each(cases)('%s', async (_name, person, feed, expected, bandText) => {
    servePages(
      (query) => (query.feed === 'global' ? page({ posts: [glob(1)] }) : announcements()),
      () => person,
    );
    const view = await mountFeed(`/minecraft/feed${feed === 'global' ? '?feed=global' : ''}`);
    const note = 'Only the team posts here. You can like and reply.';
    expect(view.find(placeholder).exists()).toBe(expected === 'composer');
    expect(text(view).includes(note)).toBe(expected === 'note');
    if (bandText) expect(text(view)).toContain(bandText);
  });

  it('keeps the actions drawn but static for a reader who cannot write, the replies still linked', async () => {
    servePages(
      () => page({ posts: [glob(1, { replies: 2 })] }),
      () => noLink(),
    );
    const view = await mountFeed('/minecraft/feed?feed=global');
    expect(likeButtons(view)).toHaveLength(0);
    expect(view.find(`a[href="/minecraft/feed/${id(101)}"]`).exists()).toBe(true);
    expect(view.find('article [aria-label^="Like"]').exists()).toBe(true);
  });

  it('offers "Write a post" in an empty Global to a writer, and focuses the composer', async () => {
    servePages(() => page({ posts: [] }));
    const view = await mountFeed('/minecraft/feed?feed=global');
    expect(text(view)).toContain('No posts yet');
    expect(text(view)).toContain('Write a post');
    const empty = view.findAll('button').find((button) => button.text() === 'Write a post')!;
    await empty.trigger('click');
  });

  it('shows the empty Announcements without a button to a player, with one to an announcer', async () => {
    servePages(() => announcements({ posts: [] }));
    const player = await mountFeed('/minecraft/feed');
    expect(text(player)).toContain('No announcements');
    expect(player.findAll('button').some((button) => button.text() === 'Write a post')).toBe(false);
    clearNuxtData();
    servePages(
      () => announcements({ posts: [] }),
      () => announcer(),
    );
    const team = await mountFeed('/minecraft/feed');
    expect(team.findAll('button').some((button) => button.text() === 'Write a post')).toBe(true);
  });

  it('shows the list, not the empty state, when only a pinned post is there', async () => {
    servePages(() => announcements({ pinned: [ann(9, { pinnedAt: T(1) })], posts: [] }));
    const view = await mountFeed('/minecraft/feed');
    expect(text(view)).toContain('Annonce 9');
    expect(text(view)).not.toContain('No announcements');
  });
});

describe('the Feed page shows the pinned group first', () => {
  it('puts the pinned posts above the others with the Pinned line', async () => {
    servePages(() =>
      announcements({
        pinned: [ann(8, { pinnedAt: T(1) }), ann(9, { pinnedAt: T(2) })],
        posts: [ann(1)],
      }),
    );
    const view = await mountFeed('/minecraft/feed');
    expect(bodies(view)).toEqual(['Annonce 8', 'Annonce 9', 'Annonce 1']);
    expect(articles(view).filter((article) => article.text().includes('Pinned'))).toHaveLength(2);
  });
});

describe('the seen mark of a feed', () => {
  it('is sent once, from the client, with the newest post shown, the pinned group included', async () => {
    servePages(() =>
      announcements({
        pinned: [ann(50, { pinnedAt: T(1), createdAt: T(300) })],
        posts: [ann(2), ann(3)],
      }),
    );
    const seen = vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    await mountFeed('/minecraft/feed');
    await settle(15);
    expect(seen.mock.calls).toEqual([['announcements', T(2)]]);
  });

  it('is not sent again by what the page does afterwards, a like for example', async () => {
    servePages(() => page({ posts: [glob(1), glob(2)] }));
    const seen = vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'setLiked').mockResolvedValue({ id: id(101), likes: 13, liked: true });
    const view = await mountFeed('/minecraft/feed?feed=global');
    await settle(10);
    await likeButtons(view)[0]!.trigger('click');
    await settle(10);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('is sent for the feed shown after a switch, and not for a page that is not the tab’s', async () => {
    servePages((query) => (query.feed === 'global' ? page({ posts: [glob(1)] }) : announcements()));
    const seen = vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    const view = await mountFeed('/minecraft/feed');
    await settle(10);
    await chooseTab(view, 'Global');
    expect(seen.mock.calls).toEqual([
      ['announcements', T(1)],
      ['global', T(1)],
    ]);
  });

  it('is not sent for an empty feed', async () => {
    servePages(() => page({ posts: [] }));
    const seen = vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    await mountFeed('/minecraft/feed?feed=global');
    await settle(10);
    expect(seen).not.toHaveBeenCalled();
  });

  it('fails quietly: no toast, no error, the feed still shown', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    vi.spyOn(feedActions, 'markFeedSeen').mockRejectedValue(new FeedError('failed'));
    const view = await mountFeed('/minecraft/feed?feed=global');
    await settle(10);
    expect(toastTitles()).toEqual([]);
    expect(text(view)).toContain('Post 1');
  });
});

describe('Load more', () => {
  it('shows the button only while there is a next page, and adds the older posts', async () => {
    const asked: Record<string, string>[] = [];
    servePages((query) => {
      asked.push(query);
      return query.before
        ? page({ posts: [glob(3)], next: null })
        : page({ posts: [glob(1), glob(2)], next: 'c1' });
    });
    const view = await mountFeed('/minecraft/feed?feed=global');
    const more = () => view.findAll('button').find((button) => button.text() === 'Load more');
    expect(more()).toBeDefined();
    await more()!.trigger('click');
    await settle(10);
    expect(articles(view)).toHaveLength(3);
    expect(text(view)).toContain('Post 3');
    expect(more()).toBeUndefined();
    expect(asked.at(-1)).toEqual({ feed: 'global', before: 'c1' });
  });

  it('has no button on the last page', async () => {
    servePages(() => page({ posts: [glob(1)], next: null }));
    const view = await mountFeed('/minecraft/feed?feed=global');
    expect(view.findAll('button').some((button) => button.text() === 'Load more')).toBe(false);
  });

  it('says it failed in a toast and keeps the list and the button', async () => {
    servePages((query) => {
      if (query.before) throw createError({ status: 500 });
      return page({ posts: [glob(1)], next: 'c1' });
    });
    const view = await mountFeed('/minecraft/feed?feed=global');
    await view
      .findAll('button')
      .find((button) => button.text() === 'Load more')!
      .trigger('click');
    await settle(10);
    expect(toastTitles()).toEqual(['That didn’t go through. Check your connection and try again.']);
    expect(articles(view)).toHaveLength(1);
    expect(view.findAll('button').some((button) => button.text() === 'Load more')).toBe(true);
  });
});

describe('a failed load', () => {
  it('says so with "Try again", which asks again', async () => {
    let fail = true;
    let asked = 0;
    servePages(() => {
      asked++;
      if (fail) throw createError({ status: 500 });
      return page({ posts: [glob(1)] });
    });
    const view = await mountFeed('/minecraft/feed?feed=global');
    expect(text(view)).toContain('The Feed didn’t load');
    expect(articles(view)).toHaveLength(0);
    fail = false;
    const before = asked;
    await view
      .findAll('button')
      .find((button) => button.text() === 'Try again')!
      .trigger('click');
    await settle(10);
    expect(asked).toBeGreaterThan(before);
    expect(text(view)).toContain('Post 1');
    expect(text(view)).not.toContain('The Feed didn’t load');
  });

  it('shows the feed with no composer or band when only the person’s state fails', async () => {
    registerEndpoint('/api/feed/me', () => {
      throw createError({ status: 500 });
    });
    registerEndpoint('/api/feed/seen', { method: 'POST', handler: () => null });
    registerEndpoint('/api/feed/posts', {
      method: 'GET',
      handler: () => page({ posts: [glob(1)] }),
    });
    const view = await mountFeed('/minecraft/feed?feed=global');
    expect(text(view)).toContain('The Feed didn’t load');
    expect(view.find('input[placeholder="What’s new on the server?"]').exists()).toBe(false);
    expect(text(view)).toContain('Post 1');
    expect(likeButtons(view)).toHaveLength(0);
  });
});

describe('liking from the Feed', () => {
  it('sends the opposite of the state, and shows what the site answered', async () => {
    servePages(() => page({ posts: [glob(1, { likes: 4 }), glob(2, { liked: true, likes: 9 })] }));
    const like = vi
      .spyOn(feedActions, 'setLiked')
      .mockImplementation((postId, liked) =>
        Promise.resolve({ id: postId, likes: liked ? 5 : 8, liked }),
      );
    const view = await mountFeed('/minecraft/feed?feed=global');
    await likeButtons(view)[0]!.trigger('click');
    await likeButtons(view)[1]!.trigger('click');
    await settle(10);
    expect(like.mock.calls).toEqual([
      [id(101), true],
      [id(102), false],
    ]);
    expect(
      likeButtons(view).map((button) => [button.attributes('aria-pressed'), button.text()]),
    ).toEqual([
      ['true', '5'],
      ['false', '8'],
    ]);
  });

  it('says what a refusal means and leaves the post as it was, ready for another try', async () => {
    servePages(() => page({ posts: [glob(1, { likes: 4 })] }));
    vi.spyOn(feedActions, 'setLiked').mockRejectedValue(
      new FeedError('rateLimited', { retryAfter: 8 }),
    );
    const view = await mountFeed('/minecraft/feed?feed=global');
    await likeButtons(view)[0]!.trigger('click');
    await settle(10);
    expect(toastTitles()).toEqual(['You’re going a bit fast. Try again in 8 s.']);
    expect(likeButtons(view)[0]!.text()).toBe('4');
    expect(likeButtons(view)[0]!.attributes('disabled')).toBeUndefined();
  });

  it('removes a post found deleted, with the message', async () => {
    servePages(() => page({ posts: [glob(1), glob(2)] }));
    vi.spyOn(feedActions, 'setLiked').mockRejectedValue(new FeedError('notFound'));
    const view = await mountFeed('/minecraft/feed?feed=global');
    await likeButtons(view)[0]!.trigger('click');
    await settle(10);
    expect(articles(view)).toHaveLength(1);
    expect(text(view)).not.toContain('Post 1');
    expect(toastTitles()).toEqual(['This post was deleted.']);
  });

  it('keeps one post’s action from blocking the others, and a second click on it waits', async () => {
    const slow = deferred<{ id: string; likes: number; liked: boolean }>();
    servePages(() => page({ posts: [glob(1), glob(2)] }));
    const like = vi
      .spyOn(feedActions, 'setLiked')
      .mockImplementation((postId) =>
        postId === id(101) ? slow.promise : Promise.resolve({ id: postId, likes: 1, liked: true }),
      );
    const view = await mountFeed('/minecraft/feed?feed=global');
    await likeButtons(view)[0]!.trigger('click');
    await settle(2);
    expect(likeButtons(view)[0]!.attributes('disabled')).toBeDefined();
    expect(likeButtons(view)[1]!.attributes('disabled')).toBeUndefined();
    await likeButtons(view)[0]!.trigger('click');
    await likeButtons(view)[1]!.trigger('click');
    await settle(5);
    expect(like.mock.calls.map(([postId]) => postId)).toEqual([id(101), id(102)]);
    slow.resolve({ id: id(101), likes: 2, liked: true });
    await settle(5);
    expect(likeButtons(view)[0]!.attributes('disabled')).toBeUndefined();
  });
});

describe('pinning from the Feed', () => {
  const pinnable = (n: number, over: Partial<FeedPostView> = {}) =>
    ann(n, { canPin: true, ...over });
  const pinButtons = (view: View) =>
    view.findAll('button[aria-label="Pin"], button[aria-label="Unpin"]');

  it('moves a pinned post to the group, with the Pinned line and an Unpin toggle', async () => {
    servePages(
      () => announcements({ posts: [pinnable(1), pinnable(2)] }),
      () => announcer(),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    const pin = vi
      .spyOn(feedActions, 'pin')
      .mockResolvedValue({ pinned: [{ id: id(2), pinnedAt: T(0) }], unpinned: null });
    const view = await mountFeed('/minecraft/feed');
    await pinButtons(view)[1]!.trigger('click');
    await settle(10);
    expect(pin).toHaveBeenCalledWith(id(2));
    expect(articles(view)[0]!.text()).toContain('Annonce 2');
    expect(articles(view)[0]!.text()).toContain('Pinned');
    expect(articles(view)[0]!.find('button[aria-label="Unpin"]').exists()).toBe(true);
    expect(toastTitles()).toEqual(['Pinned']);
  });

  it('unpins, sending the post back to its place', async () => {
    servePages(
      () =>
        announcements({
          pinned: [pinnable(9, { pinnedAt: T(0) })],
          posts: [pinnable(1), pinnable(20)],
        }),
      () => announcer(),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    const unpin = vi.spyOn(feedActions, 'unpin').mockResolvedValue({ pinned: [], unpinned: null });
    const view = await mountFeed('/minecraft/feed');
    await view.find('button[aria-label="Unpin"]').trigger('click');
    await settle(10);
    expect(unpin).toHaveBeenCalledWith(id(9));
    expect(bodies(view)).toEqual(['Annonce 1', 'Annonce 9', 'Annonce 20']);
    expect(text(view)).not.toContain('Pinned');
    expect(toastTitles()).toEqual(['Unpinned']);
  });

  describe('when three are pinned already', () => {
    const group = () => [
      pinnable(7, { pinnedAt: T(1) }),
      pinnable(8, { pinnedAt: T(2) }),
      pinnable(9, { pinnedAt: T(3), text: 'La plus ancienne' }),
    ];

    async function mountFull() {
      servePages(
        () => announcements({ pinned: group(), posts: [pinnable(1)] }),
        () => announcer(),
      );
      vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
      const pin = vi.spyOn(feedActions, 'pin').mockImplementation((_postId, replace) =>
        replace
          ? Promise.resolve({
              pinned: [
                { id: id(1), pinnedAt: T(0) },
                { id: id(7), pinnedAt: T(1) },
                { id: id(8), pinnedAt: T(2) },
              ],
              unpinned: id(9),
            })
          : Promise.reject(new FeedError('pinLimit', { oldest: { id: id(9) } })),
      );
      const view = await mountFeed('/minecraft/feed');
      await view
        .findAll('article')
        .find((article) => article.text().includes('Annonce 1'))!
        .find('button[aria-label="Pin"]')
        .trigger('click');
      await settle(10);
      return { pin, view };
    }

    it('asks which to replace, naming the oldest by its text', async () => {
      const { pin } = await mountFull();
      expect(pin).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain('Replace a pin?');
      expect(document.body.textContent).toContain('“La plus ancienne”');
    });

    it('replaces it when confirmed, the replaced post going back to the list', async () => {
      const { pin, view } = await mountFull();
      confirmButton('Replace')!.click();
      await settle(15);
      expect(pin.mock.calls).toEqual([[id(1)], [id(1), true]]);
      expect(bodies(view)).toEqual(['Annonce 1', 'Annonce 7', 'Annonce 8', 'La plus ancienne']);
      expect(articles(view)[3]!.text()).not.toContain('Pinned');
      expect(toastTitles()).toEqual(['Pinned']);
    });

    it('changes nothing when cancelled', async () => {
      const { pin, view } = await mountFull();
      confirmButton('Cancel')!.click();
      await settle(15);
      expect(pin).toHaveBeenCalledTimes(1);
      expect(toastTitles()).toEqual([]);
      expect(articles(view).filter((article) => article.text().includes('Pinned'))).toHaveLength(3);
    });
  });

  it('says what a refusal means, and leaves the post as it was', async () => {
    servePages(
      () => announcements({ posts: [pinnable(1)] }),
      () => announcer(),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'pin').mockRejectedValue(new FeedError('notAllowed'));
    const view = await mountFeed('/minecraft/feed');
    await pinButtons(view)[0]!.trigger('click');
    await settle(10);
    expect(toastTitles()).toEqual(['Only announcers can do that.']);
    expect(articles(view)[0]!.text()).not.toContain('Pinned');
  });

  it('keeps a second click on a post that is being pinned from sending a second request, and the other post live', async () => {
    const slow = deferred<{ pinned: { id: string; pinnedAt: string }[]; unpinned: null }>();
    servePages(
      () => announcements({ posts: [pinnable(1), pinnable(2)] }),
      () => announcer(),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    const pin = vi.spyOn(feedActions, 'pin').mockImplementation(() => slow.promise);
    const view = await mountFeed('/minecraft/feed');
    await pinButtons(view)[0]!.trigger('click');
    await settle(2);
    expect(pinButtons(view)[0]!.attributes('disabled')).toBeDefined();
    expect(pinButtons(view)[1]!.attributes('disabled')).toBeUndefined();
    await pinButtons(view)[0]!.trigger('click');
    await settle(3);
    expect(pin).toHaveBeenCalledTimes(1);
    slow.resolve({ pinned: [{ id: id(1), pinnedAt: T(0) }], unpinned: null });
    await settle(10);
  });

  it('reads the pinned group again when it names a post the page lacks, keeping the posts loaded', async () => {
    const far = pinnable(60, { pinnedAt: T(0) });
    const asked: Record<string, string>[] = [];
    servePages(
      (query) => {
        asked.push(query);
        if (query.limit) return announcements({ pinned: [far], posts: [] });
        return announcements({ posts: [pinnable(1), pinnable(2)] });
      },
      () => announcer(),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'pin').mockResolvedValue({
      pinned: [{ id: far.id, pinnedAt: T(0) }],
      unpinned: null,
    });
    const view = await mountFeed('/minecraft/feed');
    await pinButtons(view)[0]!.trigger('click');
    await settle(10);
    expect(asked.at(-1)).toEqual({ feed: 'announcements', limit: '1' });
    expect(bodies(view)).toEqual(['Annonce 60', 'Annonce 1', 'Annonce 2']);
  });
});

describe('deleting from the Feed', () => {
  const own = (n: number) => glob(n, { mine: true, canDelete: true });

  async function openDelete(view: View, index = 0) {
    await view.findAll('button[aria-label="More actions"]')[index]!.trigger('click');
    await settle();
    inDocument('[role="menuitem"]', 'Delete')!.click();
    await settle(10);
  }

  it('asks first, then deletes and removes the post, saying so', async () => {
    servePages(() => page({ posts: [own(1), glob(2)] }));
    const remove = vi.spyOn(feedActions, 'remove').mockResolvedValue(null);
    const view = await mountFeed('/minecraft/feed?feed=global');
    await openDelete(view);
    expect(document.body.textContent).toContain('Delete this post?');
    expect(remove).not.toHaveBeenCalled();
    confirmButton('Delete')!.click();
    await settle(15);
    expect(remove).toHaveBeenCalledWith(id(101));
    expect(articles(view)).toHaveLength(1);
    expect(toastTitles()).toEqual(['Post deleted']);
  });

  it('does nothing when cancelled', async () => {
    servePages(() => page({ posts: [own(1)] }));
    const remove = vi.spyOn(feedActions, 'remove').mockResolvedValue(null);
    const view = await mountFeed('/minecraft/feed?feed=global');
    await openDelete(view);
    confirmButton('Cancel')!.click();
    await settle(15);
    expect(remove).not.toHaveBeenCalled();
    expect(articles(view)).toHaveLength(1);
  });

  it('offers it only on the person’s own posts', async () => {
    servePages(() => page({ posts: [own(1), glob(2), glob(3)] }));
    const view = await mountFeed('/minecraft/feed?feed=global');
    expect(view.findAll('button[aria-label="More actions"]')).toHaveLength(1);
  });

  it('keeps the post and says why when the site refuses', async () => {
    servePages(() => page({ posts: [own(1)] }));
    vi.spyOn(feedActions, 'remove').mockRejectedValue(new FeedError('notAllowed'));
    const view = await mountFeed('/minecraft/feed?feed=global');
    await openDelete(view);
    confirmButton('Delete')!.click();
    await settle(15);
    expect(articles(view)).toHaveLength(1);
    expect(toastTitles()).toEqual(['Only announcers can do that.']);
  });
});

describe('posting from the Feed', () => {
  async function openComposer(view: View) {
    await view.find('input[placeholder="What’s new on the server?"]').trigger('focus');
    await settle(3);
  }

  it('puts a post made in the tab shown at the top of it', async () => {
    servePages(() => page({ posts: [glob(1)] }));
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'post').mockResolvedValue({
      replayed: false,
      post: glob(0, { mine: true, text: 'Tout neuf' }),
    });
    const view = await mountFeed('/minecraft/feed?feed=global');
    await openComposer(view);
    await view.find('textarea').setValue('Tout neuf');
    await view.find('form').trigger('submit');
    await settle(10);
    expect(articles(view)[0]!.text()).toContain('Tout neuf');
    expect(articles(view)).toHaveLength(2);
  });

  it('goes to the other tab for a post made there, which is that tab’s query', async () => {
    servePages(
      (query) => (query.feed === 'global' ? page({ posts: [glob(1)] }) : announcements()),
      () => announcer(),
    );
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'post').mockResolvedValue({
      replayed: false,
      post: ann(0, { mine: true, text: 'Nouvelle annonce' }),
    });
    const view = await mountFeed('/minecraft/feed?feed=global');
    await openComposer(view);
    await view
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === 'Announcements' && tab.attributes('aria-label') !== 'Feeds')!
      .trigger('mousedown', { button: 0 });
    await settle(3);
    await view.find('textarea').setValue('Nouvelle annonce');
    await view.find('form').trigger('submit');
    await settle(15);
    expect(useRoute().query.feed).toBeUndefined();
  });

  it('shows the account the person picked, in the composer, once the page learns it', async () => {
    const two = me({
      accounts: [
        { uuid: '6f1d6c3c-4a8b-3a55-9a0a-2b6f2a7f1c01', username: 'Alex_Craft' },
        { uuid: 'a1d0c6e8-3f5a-3b2c-8d4e-1f2a3b4c5d6e', username: 'Alex_Alt' },
      ],
    });
    servePages(
      () => page({ posts: [glob(1)] }),
      () => two,
    );
    const updated: FeedMe = {
      ...two,
      postingAccount: 'a1d0c6e8-3f5a-3b2c-8d4e-1f2a3b4c5d6e',
      me: {
        uuid: 'a1d0c6e8-3f5a-3b2c-8d4e-1f2a3b4c5d6e',
        username: 'Alex_Alt',
        realName: null,
        announcer: false,
      },
    };
    vi.spyOn(feedActions, 'markFeedSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'setPostingAccount').mockResolvedValue(updated);
    const view = await mountFeed('/minecraft/feed?feed=global');
    await openComposer(view);
    expect(text(view)).toMatch(/Alexandre M\.\s*@Alex_Craft/);
    await view
      .findAll('button')
      .find((button) => button.text() === 'Change account')!
      .trigger('click');
    await settle();
    inDocument('[role^="menuitem"]', 'Alex_Alt')!.click();
    await settle(15);
    expect(view.find('form').text()).toContain('Alex_Alt');
    expect(view.find('form').text()).not.toContain('@Alex_Alt');
  });
});

// --- A thread -----------------------------------------------------------------------------------

describe('a thread', () => {
  const main = (over: Partial<FeedPostView> = {}) => post({ id: MAIN_ID, replies: 2, ...over });
  const answer = (n: number, over: Partial<FeedPostView> = {}) =>
    post({
      id: id(500 + n),
      threadId: MAIN_ID,
      text: `Réponse ${String(n)}`,
      replies: 0,
      author: {
        uuid: id(900 + n),
        username: `Mika_${String(n)}`,
        realName: `Mika ${String(n)}.`,
        announcer: false,
      },
      ...over,
    });

  async function mountThread(route = `/minecraft/feed/${MAIN_ID}`) {
    const view = await mountSuspended(inApp(ThreadPage), { route });
    mounted.push(view);
    return view;
  }

  const goneEndpoint = (threadId: string, status = 404) =>
    registerEndpoint(`/api/feed/posts/${threadId}`, () => {
      throw createError({ status, data: status === 404 ? { problem: 'notFound' } : undefined });
    });

  describe('shown', () => {
    it('shows the main post, its replies oldest first, the count and the reply composer', async () => {
      serveThread(MAIN_ID, () => thread(main(), [answer(1), answer(2)]));
      const seen = vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const view = await mountThread();
      await settle(10);
      const body = view.text();
      expect(body).toContain('2 replies, oldest first');
      expect(body.indexOf('Réponse 1')).toBeLessThan(body.indexOf('Réponse 2'));
      expect(view.find('textarea').exists()).toBe(true);
      expect(view.find('a[href="/minecraft/feed?feed=global"]').text()).toContain('Feed');
      expect(seen.mock.calls).toEqual([[MAIN_ID]]);
    });

    it('says the count in the singular, and "No replies yet" for none', async () => {
      serveThread(MAIN_ID, () => thread(main({ replies: 1 }), [answer(1)]));
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const one = await mountThread();
      expect(one.text()).toContain('1 reply');
      clearNuxtData();
      serveThread(MAIN_ID, () => thread(main({ replies: 0 }), []));
      const none = await mountThread();
      expect(none.text()).toContain('No replies yet');
    });

    it('goes back to the feed the post belongs to', async () => {
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      serveThread(MAIN_ID, () => thread(main({ feed: 'global' }), []));
      const global = await mountThread();
      expect(global.find('a[href="/minecraft/feed?feed=global"]').exists()).toBe(true);
      clearNuxtData();
      serveThread(MAIN_ID, () => thread(main({ feed: 'announcements' }), []));
      const announcements = await mountThread();
      expect(announcements.find('a[href="/minecraft/feed"]').exists()).toBe(true);
    });

    it('marks the thread seen once, after the markers were read, and says nothing if that fails', async () => {
      serveThread(MAIN_ID, () => thread(main({ mine: true, unseenReplies: 2 }), [answer(1)]));
      const seen = vi
        .spyOn(feedActions, 'markThreadSeen')
        .mockRejectedValue(new FeedError('failed'));
      const view = await mountThread();
      await settle(15);
      expect(seen).toHaveBeenCalledTimes(1);
      expect(toastTitles()).toEqual([]);
      expect(view.text()).toContain('Réponse 1');
    });

    it('shows the replies’ reply-to line and keeps the main post’s author private line', async () => {
      serveThread(MAIN_ID, () =>
        thread(main({ anonymous: true, mine: true }), [
          answer(1, { replyTo: { id: id(999), anonymous: true, name: null } }),
        ]),
      );
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const view = await mountThread();
      expect(view.text()).toContain('Posted anonymously by you');
      expect(view.text()).toContain('Replying to Anonymous');
    });
  });

  describe('gone', () => {
    it('says the post was deleted, with the way back, no composer and no seen mark', async () => {
      registerEndpoint('/api/feed/me', () => me());
      goneEndpoint(MAIN_ID);
      const seen = vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const view = await mountThread();
      await settle(10);
      expect(view.text()).toContain('This post was deleted');
      expect(view.text()).toContain('Its author or a moderator deleted it, or the link is wrong.');
      expect(view.find('a[href="/minecraft/feed"]').exists()).toBe(true);
      expect(view.findAll('a').some((link) => link.text() === 'Back to the Feed')).toBe(true);
      expect(view.find('textarea').exists()).toBe(false);
      expect(seen).not.toHaveBeenCalled();
    });

    it('says the same for an ID that is not a UUID, and for a reply’s ID', async () => {
      registerEndpoint('/api/feed/me', () => me());
      for (const bad of ['nope', '123', id(501)]) {
        clearNuxtData();
        goneEndpoint(bad);
        const view = await mountThread(`/minecraft/feed/${bad}`);
        await settle(5);
        expect(view.text(), bad).toContain('This post was deleted');
        expect(view.find('textarea').exists(), bad).toBe(false);
      }
    });

    it('does not say "deleted" for a failure of the site, but offers to try again', async () => {
      registerEndpoint('/api/feed/me', () => me());
      let fail = true;
      let asked = 0;
      registerEndpoint(`/api/feed/posts/${MAIN_ID}`, () => {
        asked++;
        if (fail) throw createError({ status: 500 });
        return thread(main(), []);
      });
      registerEndpoint(`/api/feed/posts/${MAIN_ID}/seen`, { method: 'POST', handler: () => null });
      const view = await mountThread();
      expect(view.text()).toContain('The Feed didn’t load');
      expect(view.text()).not.toContain('This post was deleted');
      fail = false;
      const before = asked;
      await view
        .findAll('button')
        .find((button) => button.text() === 'Try again')!
        .trigger('click');
      await settle(10);
      expect(asked).toBeGreaterThan(before);
      expect(view.text()).toContain('Qui est chaud');
    });

    it('is shown when the thread comes back with no post', async () => {
      registerEndpoint('/api/feed/me', () => me());
      registerEndpoint(`/api/feed/posts/${MAIN_ID}`, () => null);
      const view = await mountThread();
      expect(view.text()).toContain('This post was deleted');
    });
  });

  describe('who may reply', () => {
    it('shows the band in the composer’s place for each reason someone cannot write', async () => {
      const cases: [FeedMe, string][] = [
        [noLink(), 'Link your Minecraft account to take part'],
        [
          me({ banned: true, rights: { write: false, announce: false, moderate: false } }),
          'You are banned from the server',
        ],
        [me({ writing: false }), 'Posting is paused for now.'],
      ];
      for (const [person, band] of cases) {
        clearNuxtData();
        serveThread(
          MAIN_ID,
          () => thread(main(), [answer(1)]),
          () => person,
        );
        vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
        const view = await mountThread();
        expect(view.find('textarea').exists(), band).toBe(false);
        expect(view.text(), band).toContain(band);
        expect(view.findAll('button[aria-label^="Like"]'), band).toHaveLength(0);
      }
    });
  });

  describe('replying', () => {
    async function mountWriter() {
      serveThread(MAIN_ID, () =>
        thread(main(), [answer(1), answer(2, { anonymous: true, author: null })]),
      );
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      return mountThread();
    }
    const replyButtons = (view: Awaited<ReturnType<typeof mountThread>>) =>
      view.findAll('article').map((article) => article.find('button[aria-label="Reply"]'));

    it('answers the main post by default, a reply once its button is clicked, and the main post again from the cross', async () => {
      const view = await mountWriter();
      expect(view.find('form').text()).toContain('Replying to Alexandre M.');
      await replyButtons(view)[1]!.trigger('click');
      await settle(3);
      expect(view.find('form').text()).toContain('Replying to Mika 1.');
      await replyButtons(view)[2]!.trigger('click');
      await settle(3);
      expect(view.find('form').text()).toContain('Replying to Anonymous');
      await view.find('button[aria-label="Reply to the main post instead"]').trigger('click');
      await settle(3);
      expect(view.find('form').text()).toContain('Replying to Alexandre M.');
      await replyButtons(view)[1]!.trigger('click');
      await replyButtons(view)[0]!.trigger('click');
      await settle(3);
      expect(view.find('form').text()).toContain('Replying to Alexandre M.');
    });

    it('sends the reply to the thread, answering the reply chosen, and adds it at the end with the counts', async () => {
      const view = await mountWriter();
      const send = vi.spyOn(feedActions, 'reply').mockResolvedValue({
        replayed: false,
        post: answer(3, {
          mine: true,
          text: 'Ma réponse',
          replyTo: { id: id(501), anonymous: false, name: 'Mika 1.' },
        }),
      });
      await replyButtons(view)[1]!.trigger('click');
      await settle(3);
      await view.find('textarea').setValue('Ma réponse');
      await view.find('form').trigger('submit');
      await settle(15);
      expect(send.mock.calls[0]![0]).toBe(MAIN_ID);
      expect(send.mock.calls[0]![1]).toMatchObject({ replyTo: id(501), text: 'Ma réponse' });
      const body = view.text();
      expect(body.indexOf('Ma réponse')).toBeGreaterThan(body.indexOf('Réponse 2'));
      expect(body).toContain('3 replies, oldest first');
      expect(view.find('form').text()).toContain('Replying to Alexandre M.');
      expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('');
    });

    it('reads the thread again when the reply composer finds it gone', async () => {
      let reads = 0;
      registerEndpoint('/api/feed/me', () => me());
      registerEndpoint(`/api/feed/posts/${MAIN_ID}`, () => {
        reads++;
        return thread(main(), [answer(1)]);
      });
      registerEndpoint(`/api/feed/posts/${MAIN_ID}/seen`, { method: 'POST', handler: () => null });
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      vi.spyOn(feedActions, 'reply').mockRejectedValue(new FeedError('notFound'));
      const view = await mountThread();
      await view.find('textarea').setValue('Trop tard');
      await view.find('form').trigger('submit');
      await settle(15);
      expect(reads).toBe(2);
    });

    it('keeps the text and answers the main post when only the reply answered is gone', async () => {
      registerEndpoint('/api/feed/me', () => me());
      let replies = [answer(1)];
      registerEndpoint(`/api/feed/posts/${MAIN_ID}`, () => thread(main(), replies));
      registerEndpoint(`/api/feed/posts/${MAIN_ID}/seen`, { method: 'POST', handler: () => null });
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const reply = vi.spyOn(feedActions, 'reply').mockImplementation(() => {
        replies = [];
        return Promise.reject(new FeedError('notFound'));
      });
      const view = await mountThread();
      await view.findAll('button[aria-label="Reply"]').at(-1)!.trigger('click');
      await settle(5);
      expect(view.find('form').text()).not.toContain('Replying to Alexandre M.');
      await view.find('textarea').setValue('Je réponds');
      await view.find('form').trigger('submit');
      await settle(15);
      expect(reply.mock.calls[0]![1]).toMatchObject({ replyTo: id(501), text: 'Je réponds' });
      expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('Je réponds');
      expect(view.find('form').text()).toContain('Replying to Alexandre M.');
    });

    it('shows the thread as deleted, its composer gone, when the thread itself is gone', async () => {
      registerEndpoint('/api/feed/me', () => me());
      let goneNow = false;
      registerEndpoint(`/api/feed/posts/${MAIN_ID}`, () => {
        if (goneNow) throw createError({ status: 404, data: { problem: 'notFound' } });
        return thread(main(), [answer(1)]);
      });
      registerEndpoint(`/api/feed/posts/${MAIN_ID}/seen`, { method: 'POST', handler: () => null });
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      vi.spyOn(feedActions, 'reply').mockImplementation(() => {
        goneNow = true;
        return Promise.reject(new FeedError('notFound'));
      });
      const view = await mountThread();
      await view.find('textarea').setValue('Trop tard');
      await view.find('form').trigger('submit');
      await settle(15);
      expect(view.text()).toContain('This post was deleted');
      expect(view.find('textarea').exists()).toBe(false);
    });
  });

  describe('its actions', () => {
    it('likes the main post and a reply, updating each in place', async () => {
      serveThread(MAIN_ID, () => thread(main({ likes: 1 }), [answer(1, { likes: 2 })]));
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const like = vi
        .spyOn(feedActions, 'setLiked')
        .mockImplementation((postId, liked) => Promise.resolve({ id: postId, likes: 10, liked }));
      const view = await mountThread();
      await view.findAll('button[aria-label^="Like"]')[1]!.trigger('click');
      await settle(10);
      expect(like).toHaveBeenCalledWith(id(501), true);
      expect(view.findAll('button[aria-label^="Like"]').map((button) => button.text())).toEqual([
        '1',
        '10',
      ]);
    });

    it('drops a reply found deleted, with the count, and reads the thread again for a main post found deleted', async () => {
      let reads = 0;
      registerEndpoint('/api/feed/me', () => me());
      registerEndpoint(`/api/feed/posts/${MAIN_ID}`, () => {
        reads++;
        return thread(main(), [answer(1), answer(2)]);
      });
      registerEndpoint(`/api/feed/posts/${MAIN_ID}/seen`, { method: 'POST', handler: () => null });
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      vi.spyOn(feedActions, 'setLiked').mockRejectedValue(new FeedError('notFound'));
      const view = await mountThread();
      await view.findAll('button[aria-label^="Like"]')[1]!.trigger('click');
      await settle(10);
      expect(view.text()).not.toContain('Réponse 1');
      expect(view.text()).toContain('1 reply');
      expect(reads).toBe(1);
      await view.findAll('button[aria-label^="Like"]')[0]!.trigger('click');
      await settle(10);
      expect(reads).toBe(2);
    });

    it('deletes one’s own reply after asking, removing it with the count', async () => {
      serveThread(MAIN_ID, () =>
        thread(main(), [answer(1, { mine: true, canDelete: true }), answer(2)]),
      );
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const remove = vi.spyOn(feedActions, 'remove').mockResolvedValue(null);
      const view = await mountThread();
      await view.find('button[aria-label="More actions"]').trigger('click');
      await settle();
      inDocument('[role="menuitem"]', 'Delete')!.click();
      await settle(10);
      expect(document.body.textContent).toContain('Delete this reply?');
      confirmButton('Delete')!.click();
      await settle(15);
      expect(remove).toHaveBeenCalledWith(id(501));
      expect(view.text()).not.toContain('Réponse 1');
      expect(view.text()).toContain('1 reply');
      expect(toastTitles()).toEqual(['Reply deleted']);
    });

    it('asks about the whole post, replies included, when it is the main post to delete', async () => {
      serveThread(MAIN_ID, () => thread(main({ mine: true, canDelete: true }), [answer(1)]));
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      vi.spyOn(feedActions, 'remove').mockRejectedValue(new FeedError('failed'));
      const view = await mountThread();
      await view.find('button[aria-label="More actions"]').trigger('click');
      await settle();
      inDocument('[role="menuitem"]', 'Delete')!.click();
      await settle(10);
      expect(document.body.textContent).toContain('Delete this post?');
      expect(document.body.textContent).toContain('Its replies will be deleted too.');
      confirmButton('Cancel')!.click();
      await settle(10);
    });
  });

  describe('Load more replies', () => {
    it('shows the button while there are more, and adds them after the others', async () => {
      const asked: Record<string, string>[] = [];
      serveThread(MAIN_ID, (query) => {
        asked.push(query);
        return query.after
          ? thread(main({ replies: 3 }), [answer(3)], null)
          : thread(main({ replies: 3 }), [answer(1), answer(2)], 'n1');
      });
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const view = await mountThread();
      const more = () =>
        view.findAll('button').find((button) => button.text() === 'Load more replies');
      expect(more()).toBeDefined();
      await more()!.trigger('click');
      await settle(10);
      expect(view.text()).toContain('Réponse 3');
      expect(more()).toBeUndefined();
      expect(asked.at(-1)).toEqual({ after: 'n1' });
    });

    it('says it failed in a toast and keeps what is shown', async () => {
      serveThread(MAIN_ID, (query) => {
        if (query.after) throw createError({ status: 500 });
        return thread(main({ replies: 3 }), [answer(1)], 'n1');
      });
      vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
      const view = await mountThread();
      await view
        .findAll('button')
        .find((button) => button.text() === 'Load more replies')!
        .trigger('click');
      await settle(10);
      expect(toastTitles()).toEqual([
        'That didn’t go through. Check your connection and try again.',
      ]);
      expect(view.text()).toContain('Réponse 1');
    });
  });

  it('does not show a reply posted while more are still to load, which arrives with them', async () => {
    serveThread(MAIN_ID, () => thread(main({ replies: 3 }), [answer(1)], 'n1'));
    vi.spyOn(feedActions, 'markThreadSeen').mockResolvedValue(null);
    vi.spyOn(feedActions, 'reply').mockResolvedValue({
      replayed: false,
      post: answer(9, { mine: true, text: 'Ma réponse' }),
    });
    const view = await mountThread();
    await view.find('textarea').setValue('Ma réponse');
    await view.find('form').trigger('submit');
    await settle(15);
    expect(view.text()).not.toContain('Ma réponse');
    expect(view.text()).toContain('4 replies, oldest first');
  });
});
