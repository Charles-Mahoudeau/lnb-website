import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { UApp } from '#components';
import Composer from '~/components/feed/Composer.vue';
import Post from '~/components/feed/Post.vue';
import ThreadPage from '~/pages/minecraft/feed/[id].vue';
import FeedPage from '~/pages/minecraft/feed/index.vue';

import type { FeedMe, FeedPage as FeedPageView, FeedPostView } from '#shared/schemas/feed';

// The Feed page's behaviour the review asked for: Load more across a tab switch, ages that stay
// current, one post busy at a time, local updates instead of reloads, the right error for each
// failure, singular and plural counts, a draft whose post was deleted, and a quiet counter.

const ALEX = '6f1d6c3c-4a8b-3a55-9a0a-2b6f2a7f1c01';

function post(over: Partial<FeedPostView> = {}): FeedPostView {
  return {
    id: '0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70',
    feed: 'global',
    threadId: null,
    replyTo: null,
    text: 'Qui est chaud pour une virée dans le Nether ce soir ?',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    anonymous: false,
    author: { uuid: ALEX, username: 'Alex_Craft', realName: 'Alexandre M.', announcer: false },
    likes: 12,
    replies: 3,
    pinnedAt: null,
    liked: false,
    mine: false,
    canDelete: false,
    canPin: false,
    unseenReplies: 0,
    answersMe: false,
    ...over,
  };
}

function me(over: Partial<FeedMe> = {}): FeedMe {
  return {
    linked: true,
    banned: false,
    banExpiresAt: null,
    writing: true,
    rights: { write: true, announce: false, moderate: false },
    me: { uuid: ALEX, username: 'Alex_Craft', realName: 'Alexandre M.', announcer: false },
    unread: { announcements: false, global: false },
    accounts: [{ uuid: ALEX, username: 'Alex_Craft' }],
    postingAccount: ALEX,
    ...over,
  };
}

function page(over: Partial<FeedPageView> = {}): FeedPageView {
  return { feed: 'global', pinned: [], posts: [post()], next: null, ...over };
}

function inApp(component: unknown, props: Record<string, unknown> = {}) {
  return defineComponent({
    render: () => h(UApp, null, () => h(component as never, props)),
  });
}

/** A promise and the function that settles it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) await flushPromises();
}

/** The page's posts endpoint, answering by query: a page per feed, and `before` pages. */
function servePages(answer: (query: URLSearchParams) => unknown) {
  registerEndpoint('/api/feed/me', () => me());
  registerEndpoint('/api/feed/seen', { method: 'POST', handler: () => null });
  registerEndpoint('/api/feed/posts', {
    method: 'GET',
    handler: (event: { path: string }) =>
      answer(new URL(event.path, 'http://localhost').searchParams),
  });
}

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
});

describe('Load more across a tab switch (P1)', () => {
  it('drops a page that arrives once the other tab is shown', async () => {
    const older = deferred<FeedPageView>();
    const first = post({
      id: 'a0000000-0000-4000-8000-000000000001',
      feed: 'announcements',
      text: 'Première annonce',
    });
    const late = post({
      id: 'a0000000-0000-4000-8000-000000000002',
      feed: 'announcements',
      text: 'Annonce de la page deux',
    });
    const global = post({ id: 'b0000000-0000-4000-8000-000000000001', text: 'Un post de Global' });
    servePages((query) => {
      if (query.get('before')) return older.promise;
      return query.get('feed') === 'global'
        ? page({ posts: [global] })
        : page({ feed: 'announcements', posts: [first], next: 'cursor' });
    });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed' });
    const more = view.findAll('button').find((button) => button.text() === 'Load more');
    await more!.trigger('click');
    await useRouter().replace('/minecraft/feed?feed=global');
    await settle();
    older.resolve(page({ feed: 'announcements', posts: [late], next: null }));
    await settle();
    expect(view.text()).toContain('Un post de Global');
    expect(view.text()).not.toContain('Annonce de la page deux');
    expect(view.text()).not.toContain('Première annonce');
  });
});

describe('ages (P2)', () => {
  it('sets the clock to now once mounted, so ages read from an old clock catch up', async () => {
    useFeedNow().value = Date.now() - 3_600_000;
    const Clocked = defineComponent({
      setup() {
        useFeedClock();
        return () =>
          h(Post, { post: post({ createdAt: new Date(Date.now() - 5 * 60_000).toISOString() }) });
      },
    });
    const view = await mountSuspended(Clocked);
    await settle();
    expect(view.find('time').text()).toMatch(/^5\smin$/);
  });

  it('keeps the clock moving while the page stays open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const Clocked = defineComponent({
        setup() {
          useFeedClock();
          return () =>
            h(Post, { post: post({ createdAt: new Date(Date.now() - 5 * 60_000).toISOString() }) });
        },
      });
      const view = await mountSuspended(Clocked);
      await settle();
      expect(view.find('time').text()).toMatch(/^5\smin$/);
      vi.advanceTimersByTime(10 * 60_000);
      await settle();
      expect(view.find('time').text()).toMatch(/^15\smin$/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('one post busy at a time (P3)', () => {
  it('keeps the other posts live while one post’s like runs, and ignores a second click on it', async () => {
    const firstLike = deferred<{ id: string; likes: number; liked: boolean }>();
    const a = post({ id: 'c0000000-0000-4000-8000-000000000001', text: 'Post A' });
    const b = post({ id: 'c0000000-0000-4000-8000-000000000002', text: 'Post B' });
    servePages(() => page({ posts: [a, b] }));
    const like = vi
      .spyOn(feedActions, 'setLiked')
      .mockImplementation((id) =>
        id === a.id ? firstLike.promise : Promise.resolve({ id, likes: 13, liked: true }),
      );
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    const likes = () =>
      view
        .findAll('button[aria-pressed]')
        .filter((b) => !b.attributes('aria-label')?.startsWith('Pin'));
    await likes()[0]!.trigger('click');
    await likes()[0]!.trigger('click');
    await likes()[1]!.trigger('click');
    await settle();
    expect(like.mock.calls.map(([id]) => id)).toEqual([a.id, b.id]);
    firstLike.resolve({ id: a.id, likes: 13, liked: true });
    await settle();
  });
});

describe('local updates instead of reloads (P4)', () => {
  it('removes a deleted reply in place, with its counts, without reading the thread again', async () => {
    const main = post({ replies: 2 });
    const first = post({
      id: 'd0000000-0000-4000-8000-000000000001',
      threadId: main.id,
      text: 'Première réponse',
      replies: 1,
    });
    const own = post({
      id: 'd0000000-0000-4000-8000-000000000002',
      threadId: main.id,
      text: 'Ma réponse',
      replyTo: { id: first.id, anonymous: false, name: 'Alexandre M.' },
      replies: 0,
      mine: true,
      canDelete: true,
    });
    let reads = 0;
    registerEndpoint('/api/feed/me', () => me());
    registerEndpoint(`/api/feed/posts/${main.id}`, () => {
      reads++;
      return { post: main, replies: [first, own], next: null };
    });
    registerEndpoint(`/api/feed/posts/${main.id}/seen`, { method: 'POST', handler: () => null });
    const remove = vi.spyOn(feedActions, 'remove').mockResolvedValue(null);
    const view = await mountSuspended(inApp(ThreadPage), { route: `/minecraft/feed/${main.id}` });
    expect(view.text()).toContain('2 replies, oldest first');
    await view.find('button[aria-label="More actions"]').trigger('click');
    await settle();
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
      node.textContent.includes('Delete'),
    );
    item!.click();
    await settle();
    const confirm = [...document.querySelectorAll<HTMLElement>('button')].find(
      (node) => node.textContent.trim() === 'Delete' && !node.closest('[role="menu"]'),
    );
    confirm!.click();
    await settle(10);
    expect(remove).toHaveBeenCalledWith(own.id);
    expect(view.text()).not.toContain('Ma réponse');
    expect(view.text()).toContain('1 reply');
    // The reply it answered lost its count too.
    expect(view.findAll('article')[1]!.find('button[aria-label="Reply"]').text()).toBe('');
    expect(reads).toBe(1);
  });
});

describe('error messages (P5)', () => {
  it('names each failure for what it is', () => {
    const writing = new FeedError('disabled', { problem: 'disabled', flag: 'feed.writing' });
    const feedOff = new FeedError('disabled', { problem: 'disabled', flag: 'feed' });
    expect(feedErrorKey(writing)).toBe('writingPaused');
    expect(feedErrorKey(feedOff)).toBe('unavailable');
    expect(feedErrorKey(feedOff, { send: true })).toBe('unavailable');
    expect(feedErrorKey(new FeedError('failed'), { send: true })).toBe('sendFailed');
    expect(feedErrorKey(new FeedError('failed'))).toBe('failed');
    expect(feedErrorKey(new Error('network'))).toBe('failed');
    expect(feedErrorKey(new FeedError('notFound'), { sentThenDeleted: true })).toBe(
      'sentThenDeleted',
    );
    expect(feedErrorKey(new FeedError('notFound'))).toBe('notFound');
    expect(feedErrorKey(new FeedError('rateLimited'), { send: true })).toBe('rateLimited');
  });

  it('has every message in both languages, the send one alone promising no double post', async () => {
    const i18n = useNuxtApp().$i18n;
    await i18n.loadLocaleMessages('fr');
    for (const key of ['writingPaused', 'unavailable', 'sendFailed', 'failed', 'sentThenDeleted']) {
      for (const locale of ['en', 'fr'] as const) {
        expect(i18n.t(`feed.errors.${key}`, {}, { locale }), `${key} in ${locale}`).not.toBe(
          `feed.errors.${key}`,
        );
      }
    }
    expect(i18n.t('feed.errors.sendFailed', {}, { locale: 'en' })).toContain(
      'won’t be posted twice',
    );
    expect(i18n.t('feed.errors.failed', {}, { locale: 'en' })).not.toContain('posted twice');
  });
});

describe('counts (P6)', () => {
  it('says them in the singular and the plural, in both languages', async () => {
    const { t, loadLocaleMessages } = useNuxtApp().$i18n;
    await loadLocaleMessages('fr');
    const say = (key: string, count: number, locale: 'en' | 'fr') =>
      t(key, { count }, { plural: count, locale });
    expect(say('feed.post.unseen', 1, 'fr')).toBe('1 nouvelle');
    expect(say('feed.post.unseen', 2, 'fr')).toBe('2 nouvelles');
    expect(say('feed.post.unseen', 1, 'en')).toBe('1 new');
    expect(say('feed.thread.count', 1, 'fr')).toBe('1 réponse');
    expect(say('feed.thread.count', 4, 'fr')).toBe(
      '4 réponses, de la plus ancienne à la plus récente',
    );
    expect(say('feed.thread.count', 1, 'en')).toBe('1 reply');
    expect(say('feed.post.replies', 1, 'fr')).toBe('1 réponse');
    expect(say('feed.post.replies', 0, 'en')).toBe('No replies');
    expect(say('feed.post.like', 1, 'en')).toBe('Like, 1 like');
    expect(say('feed.post.like', 2, 'en')).toBe('Like, 2 likes');
  });
});

describe('a draft whose post was deleted since (P7)', () => {
  it('clears the draft, tells the person, and takes a new key after', async () => {
    const keys: string[] = [];
    vi.spyOn(feedActions, 'post').mockImplementation((body) => {
      keys.push(body.idempotencyKey);
      if (keys.length === 1) return Promise.reject(new FeedError('notFound'));
      return Promise.resolve({ replayed: false, post: post({ mine: true }) });
    });
    const view = await mountSuspended(inApp(Composer, { me: me(), feed: 'global' }));
    await view.find('input').trigger('focus');
    await nextTick();
    await view.find('textarea').setValue('Déjà parti');
    await view.find('form').trigger('submit');
    await settle();
    expect(view.find('textarea').exists()).toBe(false);
    await view.find('input').trigger('focus');
    await nextTick();
    expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('');
    await view.find('textarea').setValue('Déjà parti');
    await view.find('form').trigger('submit');
    await settle();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
});

describe('the counter (P8)', () => {
  it('is announced only near and past the limit', async () => {
    const view = await mountSuspended(inApp(Composer, { me: me(), feed: 'global' }));
    await view.find('input').trigger('focus');
    await nextTick();
    const live = () => view.find('[aria-live]').attributes('aria-live');
    await view.find('textarea').setValue('a'.repeat(259));
    expect(live()).toBe('off');
    await view.find('textarea').setValue('a'.repeat(260));
    expect(live()).toBe('polite');
    await view.find('textarea').setValue('a'.repeat(300));
    expect(live()).toBe('polite');
  });
});
