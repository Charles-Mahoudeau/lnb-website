import { registerEndpoint } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { UApp } from '#components';

import type { FeedMe, FeedPage, FeedPostView, FeedThread } from '#shared/schemas/feed';

// Fixtures of the Feed page's tests (test/nuxt/feed-*.test.ts): a post, the person, a page, the
// endpoints behind them, and the small helpers the interaction tests share.

export const ALEX = '6f1d6c3c-4a8b-3a55-9a0a-2b6f2a7f1c01';
export const ALEX_ALT = 'a1d0c6e8-3f5a-3b2c-8d4e-1f2a3b4c5d6e';
export const MAIN_ID = '0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70';

/** The query of a request to an endpoint registered with registerEndpoint. */
export function queryOf(event: { path: string }): Record<string, string> {
  return Object.fromEntries(new URL(event.path, 'http://localhost').searchParams);
}

/** A post id that sorts and reads: `id(1)`, `id(2)`... */
export const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function post(over: Partial<FeedPostView> = {}): FeedPostView {
  return {
    id: MAIN_ID,
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

export function me(over: Partial<FeedMe> = {}): FeedMe {
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

/** A person with two linked accounts. */
export function twoAccounts(over: Partial<FeedMe> = {}): FeedMe {
  return me({
    accounts: [
      { uuid: ALEX, username: 'Alex_Craft' },
      { uuid: ALEX_ALT, username: 'Alex_Alt' },
    ],
    ...over,
  });
}

/** An announcer: the right to announce, on top of writing. */
export function announcer(over: Partial<FeedMe> = {}): FeedMe {
  return me({
    rights: { write: true, announce: true, moderate: false },
    me: { uuid: ALEX, username: 'Alex_Craft', realName: 'Alexandre M.', announcer: true },
    ...over,
  });
}

export function noLink(over: Partial<FeedMe> = {}): FeedMe {
  return me({
    linked: false,
    me: null,
    accounts: [],
    postingAccount: null,
    rights: { write: false, announce: false, moderate: false },
    ...over,
  });
}

export function page(over: Partial<FeedPage> = {}): FeedPage {
  return { feed: 'global', pinned: [], posts: [post()], next: null, ...over };
}

/** Inside UApp, as app.vue renders it: menus, tooltips and toasts need its providers. */
export function inApp(component: unknown, props: Record<string, unknown> = {}) {
  return defineComponent({
    render: () => h(UApp, null, () => h(component as never, props)),
  });
}

/** A promise and the function that settles it. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) await flushPromises();
}

/** `/api/feed/me`, the seen mark, and the posts endpoint answering by query. */
export function servePages(
  answer: (query: Record<string, string>) => unknown,
  person: () => FeedMe = () => me(),
) {
  registerEndpoint('/api/feed/me', () => person());
  registerEndpoint('/api/feed/seen', { method: 'POST', handler: () => null });
  registerEndpoint('/api/feed/posts', {
    method: 'GET',
    handler: (event) => answer(queryOf(event)),
  });
}

/** A thread and its seen mark. */
export function serveThread(
  threadId: string,
  answer: (query: Record<string, string>) => unknown,
  person: () => FeedMe = () => me(),
) {
  registerEndpoint('/api/feed/me', () => person());
  registerEndpoint(`/api/feed/posts/${threadId}`, (event) => answer(queryOf(event)));
  registerEndpoint(`/api/feed/posts/${threadId}/seen`, { method: 'POST', handler: () => null });
}

export function thread(main: FeedPostView, replies: FeedPostView[], next: string | null = null) {
  return { post: main, replies, next } satisfies FeedThread;
}

/** The toasts shown so far, newest last. */
export function toastTitles(): string[] {
  return useToast().toasts.value.map((toast) =>
    typeof toast.title === 'string' ? toast.title : '',
  );
}

export function clearToasts() {
  useToast().clear();
}

/** The body text of a mounted wrapper with every run of spaces made one. */
export function words(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The newest element in the document that matches (menus and dialogs are teleported out of the
 * wrapper, and one a test left open stays there).
 */
export function inDocument(selector: string, match?: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)]
    .filter((node) => !match || node.textContent.includes(match))
    .at(-1);
}

/** Takes away the menus and dialogs earlier tests left in the document. */
export function clearPortals() {
  for (const node of document.querySelectorAll(
    '[role="menu"], [role="dialog"], [role="alertdialog"], [data-reka-popper-content-wrapper]',
  )) {
    node.closest('[data-reka-popper-content-wrapper]')?.remove();
    node.remove();
  }
}
