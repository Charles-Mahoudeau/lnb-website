import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FeedTab from '~/pages/admin/moderation/feed.vue';

import {
  clearPortals,
  clearToasts,
  deferred,
  id,
  inApp,
  inDocument,
  queryOf,
  settle,
  toastTitles,
  words,
} from './feed-fixtures';

import type { FeedAdminDetail, FeedAdminList, FeedAdminPost } from '#shared/schemas/feed';

// The drawer of the Feed tab and its delete dialog (docs/feed.md, "Moderation"): opening rows in
// quick succession, a row deleted or gone while its drawer is open, "Replying to" for every kind
// of target, the part of a thread it shows, and the requests the dialog sends.

vi.setConfig({ testTimeout: 30_000 });

const NOW = Date.UTC(2026, 10, 23, 12, 0);
const T = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const DAY = 86_400_000;

function row(over: Partial<FeedAdminPost> = {}): FeedAdminPost {
  return {
    id: id(1),
    feed: 'global',
    threadId: null,
    replyTo: null,
    text: 'Quelqu’un a vu des pillards près du spawn ?',
    createdAt: T(100),
    anonymous: false,
    author: { uuid: id(900), username: 'Alex_Craft', realName: 'Alexandre M.', announcer: false },
    likes: 8,
    replies: 0,
    pinnedAt: null,
    authorUserId: 'u-alex',
    replyToGone: false,
    source: 'server',
    deletedAt: null,
    deletedBy: null,
    deletedCause: null,
    deletedReason: null,
    purgeAt: null,
    ...over,
  };
}

const mika = { uuid: id(901), username: 'MikaPvP', realName: 'Mika L.', announcer: false };
const shy = { uuid: id(902), username: 'ShyOne', realName: null, announcer: false };

const list = (items: FeedAdminPost[]): FeedAdminList => ({
  items,
  nextCursor: null,
  summary: { last30Days: items.length, deleted: items.filter((item) => item.deletedAt).length },
});

const MAIN = row({ id: id(10), text: 'Le fil principal', replies: 8 });
/** Eight replies, oldest first, each by a different text. */
function replies(n = 8, over: (i: number) => Partial<FeedAdminPost> = () => ({})) {
  return Array.from({ length: n }, (_, i) =>
    row({
      id: id(20 + i),
      threadId: MAIN.id,
      text: `Réponse ${String(i + 1)}`,
      author: mika,
      authorUserId: 'u-mika',
      createdAt: T(90 - i),
      ...over(i),
    }),
  );
}

function detail(target: FeedAdminPost, thread: FeedAdminPost[] = [], main = MAIN): FeedAdminDetail {
  return {
    post: target,
    thread: { post: target.threadId ? main : target, replies: thread },
  };
}

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'me', name: 'Me', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) view.unmount();
  vi.mocked($fetch).mockReset();
});
beforeEach(() => {
  vi.restoreAllMocks();
  clearNuxtData();
  clearToasts();
  clearPortals();
  useState('feed-now').value = NOW;
});

let asked: Record<string, string>[] = [];
function serveList(answer: () => FeedAdminList = () => list([row()])) {
  asked = [];
  registerEndpoint('/api/feed/admin/posts', (event) => {
    asked.push(queryOf(event));
    return answer();
  });
}
function serveRow(answer: FeedAdminDetail) {
  registerEndpoint(`/api/feed/admin/posts/${answer.post.id}`, () => answer);
}

async function mountTab(route = '/admin/moderation/feed') {
  signIn('warden-admin');
  const view = await mountSuspended(inApp(FeedTab), { route });
  mounted.push(view);
  await settle(10);
  return view;
}

/** The text of a node with a space between its text nodes, as a person reads it. */
function spoken(node: Node | null | undefined) {
  if (!node) return '';
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? '');
  return words(parts.join(' '));
}
const drawer = () => spoken(inDocument('[role="dialog"]'));
const query = () => useRouter().currentRoute.value.query;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('opening rows in quick succession', () => {
  it('shows the row opened last, whichever answers first', async () => {
    const slow = deferred<unknown>();
    const first = row({ id: id(1), text: 'Premier texte' });
    const second = row({ id: id(2), text: 'Second texte' });
    serveList(() => list([first, second]));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => slow.promise);
    registerEndpoint(`/api/feed/admin/posts/${id(2)}`, () => detail(second));
    await mountTab();
    await useRouter().push({ query: { post: id(1) } });
    await settle(5);
    await useRouter().push({ query: { post: id(2) } });
    await settle(10);
    expect(drawer()).toContain('Second texte');
    // The slow answer comes late: it must not replace the row now open.
    slow.resolve(detail(first));
    await settle(10);
    expect(drawer()).toContain('Second texte');
    expect(drawer()).not.toContain('Premier texte');
  });

  it('does not show the previous row’s text while the next one loads', async () => {
    const slow = deferred<unknown>();
    const first = row({ id: id(1), text: 'Premier texte' });
    const second = row({ id: id(2), text: 'Second texte' });
    serveList(() => list([first, second]));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => detail(first));
    registerEndpoint(`/api/feed/admin/posts/${id(2)}`, () => slow.promise);
    await mountTab(`/admin/moderation/feed?post=${id(1)}`);
    expect(drawer()).toContain('Premier texte');
    await useRouter().push({ query: { post: id(2) } });
    await settle(10);
    expect(drawer()).not.toContain('Premier texte');
    expect(drawer()).not.toContain('Delete the post');
    slow.resolve(detail(second));
    await settle(10);
    expect(drawer()).toContain('Second texte');
  });

  it('goes from a post that is gone to one that is kept, with no stale message', async () => {
    serveList(() => list([row({ id: id(2) })]));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => {
      throw createError({ status: 404, data: { problem: 'notFound' } });
    });
    registerEndpoint(`/api/feed/admin/posts/${id(2)}`, () =>
      detail(row({ id: id(2), text: 'Toujours là' })),
    );
    await mountTab(`/admin/moderation/feed?post=${id(1)}`);
    expect(drawer()).toContain('This post is no longer kept');
    await useRouter().push({ query: { post: id(2) } });
    await vi.waitFor(() => {
      expect(drawer()).toContain('Toujours là');
    });
    expect(drawer()).not.toContain('no longer kept');
  });

  it('closes on the close button and keeps the filters in the URL', async () => {
    serveList();
    serveRow(detail(row()));
    await mountTab(`/admin/moderation/feed?feeds=global&post=${id(1)}`);
    expect(inDocument('[role="dialog"]')).toBeDefined();
    useRouter().back();
    await settle(5);
    await useRouter().push({ query: { feeds: 'global', post: id(1) } });
    await settle(5);
    (
      inDocument('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement | undefined
    )?.click();
    await vi.waitFor(() => {
      expect(query()).toEqual({ feeds: 'global' });
    });
  });
});

describe('a post that is gone or will not load', () => {
  it('says a purged or unknown post is no longer kept, and offers no Delete', async () => {
    serveList();
    registerEndpoint(`/api/feed/admin/posts/${id(7)}`, () => {
      throw createError({ status: 404, data: { problem: 'notFound' } });
    });
    await mountTab(`/admin/moderation/feed?post=${id(7)}`);
    expect(drawer()).toContain('This post is no longer kept');
    expect(drawer()).not.toContain('Delete the');
    expect(drawer()).not.toContain('Open the profile');
  });

  it('says the post did not load, on a server error, and keeps the table', async () => {
    serveList();
    registerEndpoint(`/api/feed/admin/posts/${id(7)}`, () => {
      throw createError({ status: 500 });
    });
    const view = await mountTab(`/admin/moderation/feed?post=${id(7)}`);
    expect(drawer()).toContain('This post didn’t load');
    expect(drawer()).not.toContain('no longer kept');
    expect(view.findAll('tbody tr')).toHaveLength(1);
  });

  it('ignores a ?post= that is not a UUID: no drawer, no request for it', async () => {
    serveList();
    const calls: string[] = [];
    registerEndpoint('/api/feed/admin/posts/nope', () => {
      calls.push('nope');
      return null;
    });
    await mountTab('/admin/moderation/feed?post=nope');
    expect(inDocument('[role="dialog"]')).toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe('the drawer for each kind of row', () => {
  const cases: [string, FeedAdminPost, string][] = [
    ['a post', row({ id: id(1) }), 'Post'],
    ['an announcement', row({ id: id(1), feed: 'announcements' }), 'Announcement'],
    ['a reply', row({ id: id(1), threadId: MAIN.id }), 'Reply'],
    ['an anonymous post', row({ id: id(1), anonymous: true }), 'Anonymous post'],
    [
      'an anonymous announcement',
      row({ id: id(1), anonymous: true, feed: 'announcements' }),
      'Anonymous announcement',
    ],
    [
      'an anonymous reply',
      row({ id: id(1), anonymous: true, threadId: MAIN.id }),
      'Anonymous reply',
    ],
  ];
  for (const [label, target, title] of cases) {
    it(`titles ${label} “${title}”`, async () => {
      serveList(() => list([target]));
      serveRow(detail(target, target.threadId ? [target] : []));
      await mountTab(`/admin/moderation/feed?post=${target.id}`);
      expect(
        inDocument('[role="dialog"] [data-slot="title"], [role="dialog"] h2')?.textContent.trim(),
      ).toBe(title);
    });
  }

  it('shows the real author of an anonymous post, with a lock label and a link to the profile', async () => {
    const target = row({ anonymous: true, author: mika, authorUserId: 'u-mika/odd id' });
    serveList(() => list([target]));
    serveRow(detail(target));
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    expect(drawer()).toContain('Mika L. @MikaPvP');
    expect(drawer()).toContain('Real author, hidden from players');
    expect(inDocument('[role="dialog"] a', 'Open the profile')?.getAttribute('href')).toBe(
      '/admin/people/u-mika%2Fodd%20id/summary',
    );
  });

  it('names a plain author as Author, and one with a hidden name by their username alone', async () => {
    const target = row({ author: shy, authorUserId: 'u-shy' });
    serveList(() => list([target]));
    serveRow(detail(target));
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    expect(drawer()).toContain('ShyOne');
    expect(drawer()).not.toContain('@ShyOne');
    expect(drawer()).not.toContain('Real author');
  });

  it('shows the facts: feed, pinned, date, account, source, likes, replies', async () => {
    const target = row({
      feed: 'announcements',
      pinnedAt: T(50),
      source: 'site',
      likes: 12,
      replies: 3,
    });
    serveList(() => list([target]));
    serveRow(detail(target));
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    const text = drawer();
    expect(text).toContain('Announcements, pinned');
    expect(text).toContain('Minecraft account Alex_Craft');
    expect(text).toContain('Posted from The website');
    expect(text).toContain('Likes 12');
    expect(text).toContain('Replies 3');
    expect(text).toMatch(/Posted .*2026/);
  });

  it('shows who deleted a row, why and the purge date, and no Delete', async () => {
    const target = row({
      deletedAt: T(60),
      deletedCause: 'moderator',
      deletedBy: { userId: 'u-ines', name: 'Inès R.' },
      deletedReason: 'Moquerie',
      purgeAt: new Date(NOW - 60 * 60_000 + 30 * DAY).toISOString(),
    });
    serveList(() => list([target]));
    serveRow(detail(target));
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    expect(drawer()).toMatch(/By Inès R\., \d{1,2}:\d{2}/);
    expect(drawer()).toContain('Erased on Dec 23');
    expect(drawer()).toContain('Reason Moquerie');
    expect(drawer()).not.toContain('Delete the post');
  });

  it('says a post its author deleted, and a reply that went with its post, and gives no Delete', async () => {
    for (const [cause, line] of [
      ['author', 'By the author'],
      ['thread', 'With its post'],
    ] as const) {
      clearNuxtData();
      clearPortals();
      const target = row({
        id: id(cause === 'author' ? 1 : 2),
        deletedAt: T(30),
        deletedCause: cause,
        purgeAt: new Date(NOW + 29 * DAY).toISOString(),
      });
      serveList(() => list([target]));
      serveRow(detail(target));
      await mountTab(`/admin/moderation/feed?post=${target.id}`);
      expect(drawer(), cause).toContain(line);
      expect(drawer(), cause).not.toContain('Reason');
      expect(drawer(), cause).not.toContain('Delete the');
      mounted.pop()!.unmount();
    }
  });

  it('shows a pinned post as pinned in its feed fact only for a live pin', async () => {
    const target = row({ feed: 'announcements', pinnedAt: null });
    serveList(() => list([target]));
    serveRow(detail(target));
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    expect(drawer()).not.toContain('pinned');
  });
});

describe('“Replying to”', () => {
  const open = async (target: FeedAdminPost, thread: FeedAdminPost[], main = MAIN) => {
    serveList(() => list([target]));
    serveRow(detail(target, thread, main));
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    return drawer();
  };

  it('names no one for a post, and the main post’s author and text for a reply to the post', async () => {
    const post = await open(MAIN, []);
    expect(post).not.toContain('Replying to');
    clearNuxtData();
    clearPortals();
    mounted.pop()!.unmount();
    const [first] = replies(1);
    expect(await open(first!, [first!])).toContain('Replying to Alexandre M., “Le fil principal”');
  });

  it('names the reply it answers, with its text', async () => {
    const [first, second] = replies(2, (i) =>
      i === 1 ? { replyTo: { id: id(20), anonymous: false, name: 'Mika L.' } } : {},
    );
    expect(await open(second!, [first!, second!])).toContain('Replying to Mika L., “Réponse 1”');
  });

  it('says Anonymous for a reply to an anonymous reply, never its real author', async () => {
    const [first, second] = replies(2, (i) =>
      i === 0 ? { anonymous: true } : { replyTo: { id: id(20), anonymous: true, name: null } },
    );
    const text = await open(second!, [first!, second!]);
    expect(text).toContain('Replying to Anonymous, “Réponse 1”');
    // The real author is the row's, in the band; the "Replying to" fact does not carry it.
    expect(text.split('Replying to')[1]!.split('Posted')[0]).not.toContain('MikaPvP');
  });

  it('says Anonymous for a reply to an anonymous main post, without its real author', async () => {
    const hiddenMain = { ...MAIN, anonymous: true };
    const [first] = replies(1);
    const text = await open(first!, [first!], hiddenMain);
    expect(text).toContain('Replying to Anonymous, “Le fil principal”');
    expect(text.split('Replying to')[1]!.slice(0, 80)).not.toContain('Alexandre');
  });

  it('names a reply target that is purged from the thread by the name the row carries, with no text', async () => {
    const [first] = replies(1, () => ({
      replyTo: { id: id(99), anonymous: false, name: 'Léa B.' },
    }));
    const text = await open(first!, [first!]);
    expect(text).toContain('Replying to Léa B.');
    expect(text).not.toContain('Léa B., “');
  });

  it('says a deleted account for a target with no name and nothing left of it', async () => {
    const [first] = replies(1, () => ({ replyTo: { id: null, anonymous: false, name: null } }));
    const text = await open(first!, [first!]);
    expect(text).toContain('Replying to A deleted account');
  });

  it('reads a reply to a deleted reply from the thread, deleted rows included', async () => {
    const [first, second] = replies(2, (i) =>
      i === 0
        ? {
            deletedAt: T(5),
            deletedCause: 'moderator',
            deletedBy: { userId: 'u', name: 'Inès R.' },
          }
        : { replyTo: { id: id(20), anonymous: false, name: 'Mika L.' } },
    );
    expect(await open(second!, [first!, second!])).toContain('Replying to Mika L., “Réponse 1”');
  });
});

describe('the discussion', () => {
  const open = async (target: FeedAdminPost, thread: FeedAdminPost[]) => {
    serveList(() => list([target]));
    serveRow(detail(target, thread));
    return mountTab(`/admin/moderation/feed?post=${target.id}`);
  };
  it('shows nothing for a post that has no replies', async () => {
    await open(row({ id: id(10) }), []);
    expect(drawer()).not.toContain('The discussion');
  });

  it('shows the main post and the first replies of a main post, with how many are left', async () => {
    const all = replies(8);
    await open(MAIN, all);
    const text = drawer();
    expect(text).toContain('The discussion');
    for (const n of [1, 2, 3, 4, 5]) expect(text).toContain(`Réponse ${String(n)}`);
    for (const n of [6, 7, 8]) expect(text).not.toContain(`Réponse ${String(n)}`);
    expect(text).toContain('3 more replies');
    expect(text).not.toContain('earlier');
  });

  it('shows two replies each side of a reply in the middle, and counts the rest on both sides', async () => {
    const all = replies(9);
    await open(all[4]!, all);
    const text = drawer();
    for (const n of [3, 4, 5, 6, 7]) expect(text).toContain(`Réponse ${String(n)}`);
    for (const n of [1, 2, 8, 9]) expect(text).not.toContain(`Réponse ${String(n)}`);
    expect(text).toContain('2 earlier replies');
    expect(text).toContain('2 more replies');
    expect(text).toContain('Le fil principal');
    // The main post comes first, the row is marked as the current one.
    expect(text.indexOf('Le fil principal')).toBeLessThan(text.indexOf('Réponse 3'));
    const current = document.querySelectorAll('[role="dialog"] [aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(spoken(current[0])).toContain('Réponse 5');
  });

  it('says one earlier reply and one more reply in the singular', async () => {
    const all = replies(5);
    await open(all[3]!, all);
    const text = drawer();
    expect(text).toContain('1 earlier reply');
    expect(text).not.toContain('1 earlier replies');
    expect(text).not.toContain('more reply');
    clearPortals();
    clearNuxtData();
    mounted.pop()!.unmount();
    const six = replies(5);
    await open(six[1]!, six);
    expect(drawer()).toContain('1 more reply');
    expect(drawer()).not.toContain('earlier');
  });

  it('shows the whole thread when it is short, with no counts', async () => {
    const all = replies(3);
    await open(all[1]!, all);
    const text = drawer();
    for (const n of [1, 2, 3]) expect(text).toContain(`Réponse ${String(n)}`);
    expect(text).not.toContain('earlier');
    expect(text).not.toContain('more repl');
  });

  it('shows the first reply and the last: the edges of a long thread', async () => {
    const all = replies(8);
    await open(all[0]!, all);
    expect(drawer()).toContain('Réponse 3');
    expect(drawer()).not.toContain('Réponse 4');
    expect(drawer()).toContain('5 more replies');
    clearPortals();
    clearNuxtData();
    mounted.pop()!.unmount();
    await open(all[7]!, all);
    expect(drawer()).toContain('Réponse 6');
    expect(drawer()).not.toContain('Réponse 5');
    expect(drawer()).toContain('5 earlier replies');
  });

  it('dims a deleted reply of the discussion and marks it as deleted', async () => {
    const all = replies(3, (i) =>
      i === 0
        ? {
            deletedAt: T(5),
            deletedCause: 'moderator',
            deletedBy: { userId: 'u', name: 'Inès R.' },
            purgeAt: new Date(NOW + 29 * DAY).toISOString(),
          }
        : {},
    );
    await open(all[1]!, all);
    const text = drawer();
    expect(text).toContain('Réponse 1');
    const dimmed = [...document.querySelectorAll('[role="dialog"] .opacity-60')].map((node) =>
      spoken(node),
    );
    expect(dimmed.some((item) => item.includes('Réponse 1'))).toBe(true);
    expect(dimmed.some((item) => item.includes('Réponse 2'))).toBe(false);
    // "Deleted" appears under the reply that went, as a mark.
    expect(text.match(/Deleted/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('shows an anonymous reply of the discussion as anonymous, with the real author on its private line', async () => {
    const all = replies(2, (i) => (i === 0 ? { anonymous: true } : {}));
    await open(all[1]!, all);
    const section = spoken(document.querySelector('[role="dialog"] section'));
    // As on the Feed page for a moderator: "Anonymous", and the private line with the author.
    expect(section).toContain('Anonymous');
    expect(section).toContain('Author: Mika L. @MikaPvP');
    expect(section.indexOf('Anonymous')).toBeLessThan(section.indexOf('Author: Mika L.'));
  });
});

// $fetch is an auto-import: wrapped so a test can stand in for the delete route, while the real one
// answers the rest.
const real = vi.hoisted(() => ({
  fetch: undefined as unknown as (url: string, options?: unknown) => unknown,
}));
mockNuxtImport('$fetch', (original) => {
  real.fetch = original as never;
  return vi.fn(original);
});

/**
 * Answers the delete route as the server does (204, or the refusal the handler throws), recording
 * the request the page sent: the endpoint test harness gives a handler no readable body, so the
 * call is taken at `$fetch`, where the method and the JSON body are plain.
 */
const deleteRequests: { url: string; method?: string }[] = [];
function onDelete(path: string, handle: (body: unknown) => void) {
  deleteRequests.length = 0;
  vi.mocked($fetch).mockImplementation(((url: string, options?: Record<string, unknown>) => {
    if (url !== path) return real.fetch(url, options);
    deleteRequests.push({ url, method: options?.method as string | undefined });
    try {
      handle(options?.body);
    } catch (failure) {
      const data = (failure as { data?: unknown }).data;
      return Promise.reject(Object.assign(new Error('failed'), { data: { data } }));
    }
    return Promise.resolve(null);
  }) as never);
}

describe('deleting', () => {
  /** Serves a row, the list and the delete route; the delete flips the row to deleted. */
  function serveDelete(target: FeedAdminPost, thread: FeedAdminPost[] = [], fail?: () => never) {
    const state = { deleted: false, calls: [] as unknown[] };
    const deletedRow = (value: FeedAdminPost): FeedAdminPost =>
      state.deleted && value.id === target.id
        ? {
            ...value,
            deletedAt: T(0),
            deletedCause: 'moderator',
            deletedBy: { userId: 'me', name: 'Me' },
            purgeAt: new Date(NOW + 30 * DAY).toISOString(),
          }
        : value;
    serveList(() => list([deletedRow(target)]));
    registerEndpoint(`/api/feed/admin/posts/${target.id}`, () => {
      const current = deletedRow(target);
      return detail(current, thread);
    });
    onDelete(`/api/feed/admin/posts/${target.id}/delete`, (body) => {
      state.calls.push(body);
      if (fail) fail();
      state.deleted = true;
    });
    return state;
  }

  const confirmButton = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].at(-1)!;
  const clickDelete = async (label: string) => {
    inDocument('[role="dialog"] button', label)!.click();
    await settle(10);
  };
  const type = async (value: string) => {
    const reason = inDocument('textarea') as HTMLTextAreaElement;
    reason.value = value;
    reason.dispatchEvent(new Event('input'));
    await settle(5);
  };

  it('sends the typed reason, trimmed, updates the row and the drawer, and says so', async () => {
    const target = MAIN;
    const state = serveDelete(target, []);
    const view = await mountTab(`/admin/moderation/feed?post=${target.id}`);
    expect(view.findAll('tbody tr td')[0]!.classes()).not.toContain('opacity-60');
    await clickDelete('Delete the post');
    await type('  Hors sujet  ');
    confirmButton().click();
    await vi.waitFor(() => {
      expect(state.calls).toEqual([{ reason: 'Hors sujet' }]);
    });
    expect(deleteRequests).toEqual([
      { url: `/api/feed/admin/posts/${target.id}/delete`, method: 'POST' },
    ]);
    await vi.waitFor(() => {
      expect(toastTitles()).toContain('Post deleted');
    });
    await settle(15);
    // The table row is dimmed with who deleted it, and the drawer has no Delete any more.
    expect(view.findAll('tbody tr td')[0]!.classes()).toContain('opacity-60');
    expect(words(view.findAll('tbody tr')[0]!.text())).toContain('By Me');
    expect(drawer()).toContain('By Me');
    expect(drawer()).not.toContain('Delete the post');
  });

  it('sends an empty body when no reason is typed or only spaces are', async () => {
    for (const typed of [null, '   \n ']) {
      clearNuxtData();
      clearPortals();
      clearToasts();
      const state = serveDelete(MAIN, []);
      await mountTab(`/admin/moderation/feed?post=${MAIN.id}`);
      await clickDelete('Delete the post');
      if (typed !== null) await type(typed);
      confirmButton().click();
      await vi.waitFor(() => {
        expect(state.calls).toEqual([{}]);
      });
      mounted.pop()!.unmount();
    }
  });

  it('asks first, says what it does, and sends nothing when cancelled', async () => {
    const state = serveDelete(MAIN, []);
    await mountTab(`/admin/moderation/feed?post=${MAIN.id}`);
    await clickDelete('Delete the post');
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    const text = spoken(dialogs.at(-1));
    expect(text).toContain('Delete this post?');
    expect(text).toContain('Reason (optional)');
    expect(text).toContain('Players don’t see it');
    inDocument('button', 'Cancel')!.click();
    await settle(10);
    expect(state.calls).toEqual([]);
    expect(toastTitles()).toEqual([]);
    expect(inDocument('[role="dialog"]')).toBeDefined();
    expect(drawer()).toContain('Delete the post');
  });

  it('limits the reason to 500 characters in the field', async () => {
    serveDelete(MAIN, []);
    await mountTab(`/admin/moderation/feed?post=${MAIN.id}`);
    await clickDelete('Delete the post');
    expect((inDocument('textarea') as HTMLTextAreaElement).maxLength).toBe(500);
  });

  it('counts only the live replies a post takes with it, in the singular and the plural', async () => {
    const cases: [number, FeedAdminPost[], string][] = [
      [0, [], 'It disappears at once for everyone, in game and on the site. Moderators'],
      [1, replies(1), 'with its reply.'],
      [
        2,
        replies(3, (i) =>
          i === 0 ? { deletedAt: T(5), deletedCause: 'moderator', purgeAt: T(-9000) } : {},
        ),
        'with its 2 replies.',
      ],
    ];
    for (const [, thread, expected] of cases) {
      clearNuxtData();
      clearPortals();
      serveDelete(MAIN, thread);
      await mountTab(`/admin/moderation/feed?post=${MAIN.id}`);
      await clickDelete('Delete the post');
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      expect(spoken(dialogs.at(-1)), expected).toContain(expected);
      mounted.pop()!.unmount();
    }
  });

  it('deletes a reply with its own wording, and says the reply is deleted', async () => {
    const [target] = replies(1);
    const state = serveDelete(target!, [target!]);
    await mountTab(`/admin/moderation/feed?post=${target!.id}`);
    await clickDelete('Delete the reply');
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    expect(spoken(dialogs.at(-1))).toContain('Delete this reply?');
    expect(spoken(dialogs.at(-1))).not.toContain('with its');
    confirmButton().click();
    await vi.waitFor(() => {
      expect(state.calls).toEqual([{}]);
    });
    await vi.waitFor(() => {
      expect(toastTitles()).toContain('Reply deleted');
    });
  });

  const failures: [string, number, string | undefined, string][] = [
    ['a server error', 500, undefined, 'The post couldn’t be deleted'],
    ['a post that is gone', 404, 'notFound', 'This post is no longer kept'],
    ['a moderator under a ban', 403, 'notAllowed', 'You can’t delete posts while a ban'],
    ['an unknown problem', 409, 'somethingNew', 'The post couldn’t be deleted'],
  ];
  for (const [label, status, problem, expected] of failures) {
    it(`shows an error and leaves the row alone for ${label}`, async () => {
      const state = serveDelete(MAIN, [], () => {
        throw createError({ status, data: problem ? { problem } : undefined });
      });
      const view = await mountTab(`/admin/moderation/feed?post=${MAIN.id}`);
      await clickDelete('Delete the post');
      await type('Raison');
      confirmButton().click();
      await vi.waitFor(() => {
        expect(state.calls).toEqual([{ reason: 'Raison' }]);
      });
      await vi.waitFor(() => {
        expect(toastTitles().some((title) => title.includes(expected))).toBe(true);
      });
      await settle(10);
      expect(toastTitles()).not.toContain('Post deleted');
      expect(view.findAll('tbody tr td')[0]!.classes()).not.toContain('opacity-60');
      expect(drawer()).toContain('Delete the post');
    });
  }

  it('lets the moderator try again after a failure', async () => {
    let failing = true;
    const state = serveDelete(MAIN, [], () => {
      if (failing) throw createError({ status: 500 });
      return undefined as never;
    });
    await mountTab(`/admin/moderation/feed?post=${MAIN.id}`);
    await clickDelete('Delete the post');
    confirmButton().click();
    await vi.waitFor(() => {
      expect(toastTitles().length).toBe(1);
    });
    failing = false;
    await settle(10);
    await clickDelete('Delete the post');
    confirmButton().click();
    await vi.waitFor(() => {
      expect(toastTitles()).toContain('Post deleted');
    });
    expect(state.calls).toHaveLength(2);
  });

  it('shows a post deleted by someone else while its drawer is open when it is next read', async () => {
    const target = MAIN;
    let deletedElsewhere = false;
    serveList(() =>
      list([
        deletedElsewhere
          ? {
              ...target,
              deletedAt: T(1),
              deletedCause: 'moderator',
              deletedBy: { userId: 'x', name: 'Inès R.' },
            }
          : target,
      ]),
    );
    registerEndpoint(`/api/feed/admin/posts/${target.id}`, () =>
      detail(
        deletedElsewhere
          ? {
              ...target,
              deletedAt: T(1),
              deletedCause: 'moderator',
              deletedBy: { userId: 'x', name: 'Inès R.' },
            }
          : target,
      ),
    );
    // The delete answers 204 for a post already deleted, as the route does.
    onDelete(`/api/feed/admin/posts/${target.id}/delete`, () => {
      deletedElsewhere = true;
    });
    const view = await mountTab(`/admin/moderation/feed?post=${target.id}`);
    await clickDelete('Delete the post');
    confirmButton().click();
    await vi.waitFor(() => {
      expect(drawer()).toContain('By Inès R.');
    });
    expect(drawer()).not.toContain('Delete the post');
    expect(view.findAll('tbody tr td')[0]!.classes()).toContain('opacity-60');
  });

  it('shows a post purged while its drawer was open as no longer kept after the delete', async () => {
    const target = MAIN;
    serveList(() => list([]));
    let gone = false;
    registerEndpoint(`/api/feed/admin/posts/${target.id}`, () => {
      if (gone) throw createError({ status: 404, data: { problem: 'notFound' } });
      return detail(target);
    });
    onDelete(`/api/feed/admin/posts/${target.id}/delete`, () => {
      gone = true;
      throw createError({ status: 404, data: { problem: 'notFound' } });
    });
    await mountTab(`/admin/moderation/feed?post=${target.id}`);
    await clickDelete('Delete the post');
    confirmButton().click();
    await vi.waitFor(() => {
      expect(drawer()).toContain('This post is no longer kept');
    });
    expect(toastTitles().some((title) => title.includes('no longer kept'))).toBe(true);
    await pause(10);
  });
});
