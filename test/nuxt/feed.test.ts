import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { createError } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { UApp } from '#components';
import Composer from '~/components/feed/Composer.vue';
import Post from '~/components/feed/Post.vue';
import ThreadPage from '~/pages/minecraft/feed/[id].vue';
import FeedPage from '~/pages/minecraft/feed/index.vue';

import type { FeedMe, FeedPage as FeedPageView, FeedPostView } from '#shared/schemas/feed';

// The Feed page (docs/feed.md, "The Feed page"): every form of post, the composer or the band
// that replaces it, the empty and deleted states, and a failed send that keeps its key.

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

/** Inside UApp, as app.vue renders it: menus and tooltips need its providers. */
function inApp(component: unknown, props: Record<string, unknown> = {}) {
  return defineComponent({
    render: () => h(UApp, null, () => h(component as never, props)),
  });
}

function serve(state: { me?: FeedMe; page?: FeedPageView }) {
  registerEndpoint('/api/feed/me', () => state.me ?? me());
  registerEndpoint('/api/feed/posts', { method: 'GET', handler: () => state.page ?? page() });
  registerEndpoint('/api/feed/seen', { method: 'POST', handler: () => null });
}

// Signed in: the pages need a session, or the auth middleware sends them to /sign-in.
registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

beforeEach(() => {
  clearNuxtData();
});

describe('a post', () => {
  it('shows the name, the handle, the announcer badge and the actions', async () => {
    const announcer = await mountSuspended(Post, {
      props: {
        post: post({ author: { ...post().author!, announcer: true }, liked: true }),
        canAct: true,
      },
    });
    expect(announcer.text()).toContain('Alexandre M.');
    expect(announcer.text()).toContain('@Alex_Craft');
    expect(announcer.text()).toContain('Announcer');
    expect(announcer.find('img').attributes('src')).toBe(`/api/warden/heads/${ALEX}`);
    expect(announcer.find('button[aria-pressed="true"]').text()).toContain('12');
    expect(announcer.find(`a[href="/minecraft/feed/${post().id}"]`).exists()).toBe(true);
  });

  it('prints the username alone when the real name is hidden', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post({ author: { ...post().author!, realName: null } }) },
    });
    expect(view.text()).toContain('Alex_Craft');
    expect(view.text()).not.toContain('@Alex_Craft');
  });

  it('hides an anonymous author behind the mask, and tells its author with the lock line', async () => {
    const hidden = await mountSuspended(Post, {
      props: { post: post({ anonymous: true, author: null }) },
    });
    expect(hidden.text()).toContain('Anonymous');
    expect(hidden.find('img').exists()).toBe(false);
    expect(hidden.find('[role="img"]').attributes('aria-label')).toBe('Anonymous');
    expect(hidden.text()).not.toContain('Posted anonymously by you');

    const own = await mountSuspended(Post, {
      props: { post: post({ anonymous: true, mine: true, canDelete: true }) },
    });
    expect(own.text()).toContain('Posted anonymously by you');
    expect(own.text()).not.toContain('@Alex_Craft');
    expect(own.text()).not.toContain('Announcer');

    const moderator = await mountSuspended(Post, {
      props: { post: post({ anonymous: true }) },
    });
    expect(moderator.text()).toContain('Author: Alexandre M. @Alex_Craft');
  });

  it('shows the reply-to line, the pinned line and the unseen replies pill', async () => {
    const reply = await mountSuspended(Post, {
      props: {
        post: post({ threadId: post().id, replyTo: { id: null, anonymous: true, name: null } }),
        mode: 'reply',
      },
    });
    expect(reply.text()).toContain('Replying to Anonymous');

    const pinned = await mountSuspended(Post, {
      props: {
        post: post({ pinnedAt: new Date().toISOString(), mine: true, unseenReplies: 2 }),
        canAct: true,
      },
    });
    expect(pinned.text()).toContain('Pinned');
    expect(pinned.text()).toContain('2 new');
  });

  it('keeps the counts static for someone who can’t act', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post(), canAct: false, mode: 'reply' },
    });
    expect(view.find('button[aria-pressed]').exists()).toBe(false);
    expect(view.text()).toContain('12');
  });
});

describe('the Feed page', () => {
  it('opens on Announcements, with the note for players and their posts', async () => {
    serve({ page: page({ feed: 'announcements', posts: [post({ feed: 'announcements' })] }) });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed' });
    expect(view.text()).toContain('Only the team posts here. You can like and reply.');
    expect(view.text()).toContain('Qui est chaud');
    expect(view.text()).not.toContain('What’s new on the server?');
  });

  it('gives a writer the composer on Global, with Change account for several accounts', async () => {
    serve({
      me: me({
        accounts: [
          { uuid: ALEX, username: 'Alex_Craft' },
          { uuid: 'a1d0c6e8-3f5a-3b2c-8d4e-1f2a3b4c5d6e', username: 'Alex_Alt' },
        ],
      }),
    });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    const field = view.find('input[placeholder="What’s new on the server?"]');
    expect(field.exists()).toBe(true);
    await field.trigger('focus');
    expect(view.text()).toContain('Change account');
    expect(view.text()).toContain('0/280');
  });

  it('shows the band to link an account, and no composer', async () => {
    serve({
      me: me({
        linked: false,
        me: null,
        accounts: [],
        postingAccount: null,
        rights: { write: false, announce: false, moderate: false },
      }),
    });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    expect(view.text()).toContain('Link your Minecraft account to take part');
    expect(view.find('a[href="/minecraft/account"]').exists()).toBe(true);
    expect(view.find('input[placeholder="What’s new on the server?"]').exists()).toBe(false);
    expect(view.find('button[aria-pressed]').exists()).toBe(false);
  });

  it('tells a banned player until when', async () => {
    serve({
      me: me({
        banned: true,
        banExpiresAt: '2026-12-04T10:00:00.000Z',
        rights: { write: false, announce: false, moderate: false },
      }),
    });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    expect(view.text()).toContain('You are banned from the server until December 4, 2026');
    expect(view.text()).toContain('See my ban');
  });

  it('says posting is paused while writing is off', async () => {
    serve({ me: me({ writing: false }) });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    expect(view.text()).toContain('Posting is paused for now.');
    expect(view.find('input[placeholder="What’s new on the server?"]').exists()).toBe(false);
  });

  it('shows the empty states', async () => {
    serve({ page: page({ feed: 'announcements', posts: [] }) });
    const announcements = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed' });
    expect(announcements.text()).toContain('No announcements');
    clearNuxtData();
    serve({ page: page({ posts: [] }) });
    const global = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    expect(global.text()).toContain('No posts yet');
    expect(global.text()).toContain('Write a post');
  });

  it('dots the tab that isn’t shown when it has unread posts', async () => {
    serve({ me: me({ unread: { announcements: true, global: true } }) });
    const view = await mountSuspended(inApp(FeedPage), { route: '/minecraft/feed?feed=global' });
    expect(view.findAll('[aria-label="New posts"]')).toHaveLength(1);
  });
});

describe('a thread', () => {
  it('says the post was deleted, with the way back', async () => {
    registerEndpoint('/api/feed/me', () => me());
    registerEndpoint('/api/feed/posts/0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70', () => {
      throw createError({ status: 404, data: { problem: 'notFound' } });
    });
    const view = await mountSuspended(inApp(ThreadPage), {
      route: '/minecraft/feed/0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70',
    });
    expect(view.text()).toContain('This post was deleted');
    expect(view.find('a[href="/minecraft/feed"]').exists()).toBe(true);
  });

  it('shows the main post, its replies oldest first and the reply composer', async () => {
    const main = post();
    registerEndpoint('/api/feed/me', () => me());
    registerEndpoint('/api/feed/posts/0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70', () => ({
      post: main,
      replies: [
        post({ id: '1b1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e71', threadId: main.id, text: 'Premier' }),
        post({ id: '2b1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e72', threadId: main.id, text: 'Second' }),
      ],
      next: null,
    }));
    registerEndpoint('/api/feed/posts/0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70/seen', {
      method: 'POST',
      handler: () => null,
    });
    const view = await mountSuspended(inApp(ThreadPage), {
      route: '/minecraft/feed/0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70',
    });
    const text = view.text();
    expect(text).toContain('3 replies, oldest first');
    expect(text.indexOf('Premier')).toBeLessThan(text.indexOf('Second'));
    expect(text).toContain('Replying to Alexandre M.');
    expect(text).toContain('Reply anonymously');
  });
});

describe('the composer', () => {
  it('keeps the draft and its key after a failed send, so the retry can’t post twice', async () => {
    const keys: string[] = [];
    const send = vi.spyOn(feedActions, 'post').mockImplementation((body) => {
      keys.push(body.idempotencyKey);
      if (keys.length === 1) return Promise.reject(new FeedError('failed'));
      return Promise.resolve({ replayed: false, post: post({ mine: true }) });
    });
    const view = await mountSuspended(inApp(Composer, { me: me(), feed: 'global' }));
    await view.find('input').trigger('focus');
    await nextTick();
    await view.find('textarea').setValue('Salut tout le monde');
    await view.find('form').trigger('submit');
    await flushPromises();
    expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Salut tout le monde',
    );
    await view.find('form').trigger('submit');
    await flushPromises();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(view.find('textarea').exists()).toBe(false);
    send.mockRestore();
  });

  it('counts as the site does and refuses more than 280', async () => {
    const view = await mountSuspended(inApp(Composer, { me: me(), feed: 'global' }));
    await view.find('input').trigger('focus');
    await nextTick();
    // Trimmed, and an emoji is one code point: 280 of them pass, 281 don't.
    await view.find('textarea').setValue(`  ${'😀'.repeat(280)}  `);
    expect(view.text()).toContain('280/280');
    expect(view.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    await view.find('textarea').setValue('😀'.repeat(281));
    expect(view.text()).toContain('281/280');
    expect(view.find('button[type="submit"]').attributes('disabled')).toBeDefined();
  });
});
