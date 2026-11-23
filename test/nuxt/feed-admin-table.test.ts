import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { feedAdminActions } from '~/composables/useFeedAdmin';
import FeedTab from '~/pages/admin/moderation/feed.vue';

import {
  clearPortals,
  clearToasts,
  id,
  inApp,
  inDocument,
  queryOf,
  settle,
  words,
} from './feed-fixtures';

import type { FeedAdminList, FeedAdminPost } from '#shared/schemas/feed';

// The Feed tab of Moderation (docs/feed.md, "Moderation"; mock M1): the table for every kind of
// row, each chip and the search driving the request and the URL, the person filter, the summary,
// the pages, and the back and forward buttons.

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
    createdAt: T(10),
    anonymous: false,
    author: { uuid: id(900), username: 'Alex_Craft', realName: 'Alexandre M.', announcer: false },
    likes: 8,
    replies: 2,
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

const list = (items: FeedAdminPost[], over: Partial<FeedAdminList> = {}): FeedAdminList => ({
  items,
  nextCursor: null,
  summary: { last30Days: items.length, deleted: items.filter((item) => item.deletedAt).length },
  ...over,
});

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'me', name: 'Me', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) view.unmount();
});
beforeEach(() => {
  vi.restoreAllMocks();
  clearNuxtData();
  clearToasts();
  clearPortals();
  useState('feed-now').value = NOW;
});

let asked: Record<string, string>[] = [];
function serveList(answer: (query: Record<string, string>) => FeedAdminList | Promise<unknown>) {
  asked = [];
  registerEndpoint('/api/feed/admin/posts', (event) => {
    const query = queryOf(event);
    asked.push(query);
    return answer(query);
  });
}

async function mountTab(route = '/admin/moderation/feed') {
  signIn('warden-admin');
  const view = await mountSuspended(inApp(FeedTab), { route });
  mounted.push(view);
  await settle(10);
  return view;
}

const query = () => useRouter().currentRoute.value.query;
const chipOf = (view: Awaited<ReturnType<typeof mountTab>>, label: string) =>
  view.findAll('button').find((button) => button.text() === label)!;
const rowsOf = (view: Awaited<ReturnType<typeof mountTab>>) =>
  view.findAll('tbody tr').map((tr) => words(tr.text()));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('every kind of row', () => {
  it('shows a plain post with its author, feed, counts and a time today', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    const [text] = rowsOf(view);
    expect(text).toContain('Alexandre M.');
    expect(text).toContain('@Alex_Craft');
    expect(text).toContain('Quelqu’un a vu des pillards près du spawn ?');
    expect(text).toContain('Global');
    expect(text).not.toContain('Pinned');
    expect(text).not.toContain('Deleted');
    expect(text).not.toContain('Reply to');
    expect(view.find('tbody [aria-label="8 likes"]').exists()).toBe(true);
    expect(view.find('tbody [aria-label="2 replies"]').exists()).toBe(true);
    const time = view.find('tbody time');
    expect(time.attributes('datetime')).toBe(T(10));
    // Today, so only the time of day, in Paris time.
    expect(time.text()).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)?$/i);
  });

  it('shows the day, and the year when it is not this year, for older rows', async () => {
    serveList(() =>
      list([
        row({ id: id(1), createdAt: new Date(NOW - 3 * DAY).toISOString() }),
        row({ id: id(2), createdAt: new Date(NOW - 400 * DAY).toISOString() }),
      ]),
    );
    const view = await mountTab();
    const [recent, old] = view.findAll('tbody time').map((time) => time.text());
    expect(recent).toMatch(/Nov 20/);
    expect(recent).not.toMatch(/2026|2025/);
    expect(old).toMatch(/2025/);
  });

  it('shows an announcement with its badge, and a pinned one with Pinned', async () => {
    serveList(() =>
      list([
        row({ id: id(1), feed: 'announcements', pinnedAt: T(60), text: 'Maintenance ce soir' }),
        row({ id: id(2), feed: 'announcements', text: 'Nouvelle règle' }),
      ]),
    );
    const view = await mountTab();
    const [pinned, plain] = rowsOf(view);
    expect(pinned).toContain('Announcements');
    expect(pinned).toContain('Pinned');
    expect(plain).toContain('Announcements');
    expect(plain).not.toContain('Pinned');
  });

  it('shows an anonymous row as Anonymous, with the real author behind a lock', async () => {
    serveList(() =>
      list([
        row({ id: id(1), anonymous: true, author: mika, authorUserId: 'u-mika' }),
        row({ id: id(2), anonymous: true, author: shy, authorUserId: 'u-shy' }),
      ]),
    );
    const view = await mountTab();
    const [named, hidden] = rowsOf(view);
    expect(named).toContain('Anonymous');
    expect(named).toContain('Mika L. @MikaPvP');
    expect(hidden).toContain('Anonymous');
    expect(hidden).toContain('ShyOne');
    // The lock carries the label a screen reader reads.
    const locks = view.findAll('tbody [aria-label="Real author, hidden from players"]');
    expect(locks).toHaveLength(2);
  });

  it('shows a person who hides their real name by their username, with a note', async () => {
    serveList(() => list([row({ author: shy, authorUserId: 'u-shy' })]));
    const view = await mountTab();
    const [text] = rowsOf(view);
    expect(text).toContain('ShyOne');
    expect(text).toContain('Real name hidden');
  });

  it('shows the reply-to line: the post, a named reply, an anonymous one', async () => {
    const parent = id(50);
    serveList(() =>
      list([
        row({ id: id(1), threadId: parent, replyTo: null, text: 'À la discussion' }),
        row({
          id: id(2),
          threadId: parent,
          replyTo: { id: id(3), anonymous: false, name: 'Mika L.' },
          text: 'À Mika',
        }),
        row({
          id: id(4),
          threadId: parent,
          replyTo: { id: id(5), anonymous: true, name: null },
          text: 'À quelqu’un de caché',
        }),
        row({ id: id(6), text: 'Un post, pas une réponse' }),
      ]),
    );
    const view = await mountTab();
    const [post, named, anonymous, main] = rowsOf(view);
    expect(post).toContain('Reply to the post');
    expect(named).toContain('Reply to Mika L.');
    expect(named).not.toContain('Reply to the post');
    // An anonymous target is named as Anonymous, never by its real author.
    expect(anonymous).toContain('Reply to Anonymous');
    expect(anonymous).not.toContain('Mika');
    expect(main).not.toContain('Reply to');
  });

  it('names a reply to a person with no name left as Anonymous, not as nobody', async () => {
    serveList(() =>
      list([
        row({
          id: id(1),
          threadId: id(50),
          replyTo: { id: null, anonymous: false, name: null },
          text: 'Cible disparue',
        }),
      ]),
    );
    const view = await mountTab();
    expect(rowsOf(view)[0]).toContain('Reply to Anonymous');
  });

  it('dims a deleted row and says who, when and the purge date, for each cause', async () => {
    const purge = (minutes: number) => new Date(Date.parse(T(minutes)) + 30 * DAY).toISOString();
    serveList(() =>
      list([
        row({
          id: id(1),
          deletedAt: T(5),
          deletedCause: 'moderator',
          deletedBy: { userId: 'u-ines', name: 'Inès R.' },
          deletedReason: 'Moquerie',
          purgeAt: purge(5),
        }),
        row({ id: id(2), deletedAt: T(6), deletedCause: 'author', purgeAt: purge(6) }),
        row({
          id: id(3),
          threadId: id(1),
          deletedAt: T(5),
          deletedCause: 'thread',
          purgeAt: purge(5),
        }),
        row({
          id: id(4),
          deletedAt: new Date(NOW - 20 * DAY).toISOString(),
          deletedCause: 'moderator',
          deletedBy: { userId: 'u-ines', name: 'Inès R.' },
          purgeAt: new Date(NOW + 10 * DAY).toISOString(),
        }),
      ]),
    );
    const view = await mountTab();
    const [byMod, byAuthor, withPost, older] = rowsOf(view);
    expect(byMod).toContain('Deleted');
    expect(byMod).toMatch(/By Inès R\., \d{1,2}:\d{2}/);
    expect(byMod).toMatch(/Erased on Dec 2[23]/);
    expect(byAuthor).toContain('By the author');
    expect(withPost).toContain('With its post');
    expect(older).toMatch(/By Inès R\., Nov 3/);
    expect(older).toMatch(/Erased on Dec 3/);
    for (const tr of view.findAll('tbody tr')) {
      const cells = tr.findAll('td');
      // Author, post, feed, reactions and date are dimmed; the state is not.
      for (const cell of cells.slice(0, 5)) expect(cell.classes()).toContain('opacity-60');
      expect(cells[5]!.classes()).not.toContain('opacity-60');
    }
  });

  it('does not dim a live row, and shows no state for it', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    const cells = view.findAll('tbody tr td');
    for (const cell of cells) expect(cell.classes()).not.toContain('opacity-60');
    expect(cells[5]!.text()).toBe('');
  });

  it('opens a row from its text button with one click, and from the row', async () => {
    serveList(() => list([row({ id: id(1) }), row({ id: id(2) })]));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => ({
      post: row({ id: id(1) }),
      thread: { post: row({ id: id(1) }), replies: [] },
    }));
    registerEndpoint(`/api/feed/admin/posts/${id(2)}`, () => ({
      post: row({ id: id(2) }),
      thread: { post: row({ id: id(2) }), replies: [] },
    }));
    const view = await mountTab();
    await view.findAll('tbody tr button')[0]!.trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(1) });
    });
    await view.findAll('tbody tr')[1]!.trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(2) });
    });
    expect(view.findAll('tbody tr')[1]!.classes()).toContain('bg-secondary/10');
    expect(view.findAll('tbody tr')[0]!.classes()).not.toContain('bg-secondary/10');
  });
});

describe('the summary and the empty states', () => {
  it('says the posts and the deleted ones, in the singular and the plural', async () => {
    const cases: [FeedAdminList['summary'], string][] = [
      [{ last30Days: 0, deleted: 0 }, 'No posts in the last 30 days, none deleted'],
      [{ last30Days: 1, deleted: 0 }, '1 post in the last 30 days, none deleted'],
      [{ last30Days: 1, deleted: 1 }, '1 post in the last 30 days, 1 deleted'],
      [{ last30Days: 214, deleted: 2 }, '214 posts in the last 30 days, 2 deleted'],
    ];
    for (const [summary, line] of cases) {
      serveList(() => list([row()], { summary }));
      clearNuxtData();
      const view = await mountTab();
      expect(words(view.text()), line).toContain(line);
      view.unmount();
      mounted.pop();
    }
  });

  it('counts the deleted rows when the Deleted chip is on, and says they are kept 30 days', async () => {
    const summary = { last30Days: 9, deleted: 4 };
    serveList(() => list([row()], { summary }));
    const view = await mountTab('/admin/moderation/feed?deleted=true');
    const text = words(view.text());
    expect(text).toContain('4 deleted posts from the last 30 days.');
    expect(text).toContain('Deleted posts are kept 30 days, then erased.');
    expect(text).not.toContain('9 posts');
  });

  it('says there are no deleted posts, and one, with the chip on', async () => {
    serveList(() => list([], { summary: { last30Days: 3, deleted: 0 } }));
    const none = await mountTab('/admin/moderation/feed?deleted=true');
    expect(words(none.text())).toContain('No deleted posts from the last 30 days.');
    none.unmount();
    mounted.pop();
    clearNuxtData();
    serveList(() => list([row()], { summary: { last30Days: 3, deleted: 1 } }));
    const one = await mountTab('/admin/moderation/feed?deleted=true');
    expect(words(one.text())).toContain('1 deleted post from the last 30 days.');
  });

  it('says the table is empty, or that the filters match nothing, and offers to clear them', async () => {
    serveList(() => list([]));
    const empty = await mountTab();
    expect(empty.text()).toContain('No posts yet');
    expect(empty.text()).not.toContain('Clear the filters');
    empty.unmount();
    mounted.pop();
    for (const filtered of [
      '?feeds=global',
      '?replies=true',
      '?q=pillards',
      '?user=u-alex',
      '?deleted=true',
    ]) {
      clearNuxtData();
      serveList(() => list([]));
      const view = await mountTab(`/admin/moderation/feed${filtered}`);
      expect(view.text(), filtered).toContain('Nothing matches');
      expect(view.text(), filtered).toContain('Clear the filters');
      view.unmount();
      mounted.pop();
    }
  });

  it('does not count a one-character search as a filter', async () => {
    serveList(() => list([]));
    const view = await mountTab('/admin/moderation/feed?q=a');
    expect(view.text()).toContain('No posts yet');
    expect(asked.at(-1)).toEqual({});
  });

  it('says the table did not load, and keeps the page', async () => {
    registerEndpoint('/api/feed/admin/posts', () => {
      throw createError({ status: 500 });
    });
    const view = await mountTab();
    expect(view.text()).toContain('The Feed table didn’t load');
    expect(view.findAll('tbody tr')).toHaveLength(0);
  });
});

describe('the chips', () => {
  const CHIPS: [string, Record<string, string>][] = [
    ['Announcements', { feeds: 'announcements' }],
    ['Global', { feeds: 'global' }],
    ['Replies', { replies: 'true' }],
    ['Anonymous', { anonymous: 'true' }],
    ['Deleted', { deleted: 'true' }],
  ];

  for (const [label, expected] of CHIPS) {
    it(`sends the ${label} chip to the server and the URL, and takes it off again`, async () => {
      serveList(() => list([row()]));
      const view = await mountTab();
      await chipOf(view, label).trigger('click');
      await vi.waitFor(() => {
        expect(query()).toEqual(expected);
      });
      await settle(10);
      expect(asked.at(-1)).toEqual(expected);
      expect(chipOf(view, label).attributes('aria-pressed')).toBe('true');
      for (const [other] of CHIPS.filter(([name]) => name !== label)) {
        expect(chipOf(view, other).attributes('aria-pressed'), other).toBe('false');
      }
      await chipOf(view, label).trigger('click');
      await vi.waitFor(() => {
        expect(query()).toEqual({});
      });
      await settle(10);
      expect(asked.at(-1)).toEqual({});
      expect(chipOf(view, label).attributes('aria-pressed')).toBe('false');
    });
  }

  it('combines every chip into one request, with both feeds comma-separated', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    for (const [label] of CHIPS) {
      await chipOf(view, label).trigger('click');
      await vi.waitFor(() => {
        expect(chipOf(view, label).attributes('aria-pressed')).toBe('true');
      });
    }
    await vi.waitFor(() => {
      expect(query()).toEqual({
        feeds: 'announcements,global',
        replies: 'true',
        anonymous: 'true',
        deleted: 'true',
      });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({
      feeds: 'announcements,global',
      replies: 'true',
      anonymous: 'true',
      deleted: 'true',
    });
  });

  it('goes back to the first page when a chip changes, and keeps an open row', async () => {
    serveList(() => list([row()], { nextCursor: 'n' }));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => ({
      post: row(),
      thread: { post: row(), replies: [] },
    }));
    const view = await mountTab(`/admin/moderation/feed?cursor=older&post=${id(1)}`);
    await chipOf(view, 'Replies').trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ replies: 'true', post: id(1) });
    });
  });

  it('reads the chips back from the URL, ignoring values that are not ours', async () => {
    serveList(() => list([row()]));
    const view = await mountTab(
      '/admin/moderation/feed?feeds=global,nope&replies=yes&anonymous=true&deleted=false',
    );
    expect(chipOf(view, 'Global').attributes('aria-pressed')).toBe('true');
    expect(chipOf(view, 'Announcements').attributes('aria-pressed')).toBe('false');
    expect(chipOf(view, 'Replies').attributes('aria-pressed')).toBe('false');
    expect(chipOf(view, 'Anonymous').attributes('aria-pressed')).toBe('true');
    expect(chipOf(view, 'Deleted').attributes('aria-pressed')).toBe('false');
    expect(asked.at(-1)).toEqual({ feeds: 'global', anonymous: 'true' });
  });

  it('clears every filter at once, keeping nothing of the search either', async () => {
    serveList(() => list([]));
    const view = await mountTab('/admin/moderation/feed?feeds=global&q=pillards&user=u-alex');
    await chipOf(view, 'Clear the filters').trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({});
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({});
    expect((view.find('input[type="search"]').element as HTMLInputElement).value).toBe('');
  });
});

describe('the search', () => {
  it('fills the field from the URL, and sends it trimmed', async () => {
    serveList(() => list([row()]));
    const view = await mountTab('/admin/moderation/feed?q=%20pillards%20');
    expect((view.find('input[type="search"]').element as HTMLInputElement).value).toBe(
      ' pillards ',
    );
    expect(asked.at(-1)).toEqual({ q: 'pillards' });
  });

  it('waits for a pause in typing: one request for a word, not one per letter', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    const input = view.find('input[type="search"]');
    const before = asked.length;
    for (const typed of ['p', 'pi', 'pil', 'pill']) {
      await input.setValue(typed);
      await pause(60);
    }
    await pause(450);
    await settle(10);
    expect(query()).toEqual({ q: 'pill' });
    expect(asked.slice(before)).toEqual([{ q: 'pill' }]);
  });

  it('keeps the search and a chip clicked before the pause ends, and sends them together', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    await view.find('input[type="search"]').setValue('pillards');
    // The chip is clicked while the search still waits for its pause.
    await chipOf(view, 'Global').trigger('click');
    await pause(450);
    await settle(10);
    expect(query()).toEqual({ q: 'pillards', feeds: 'global' });
    expect(asked.at(-1)).toEqual({ q: 'pillards', feeds: 'global' });
  });

  it('keeps a chip clicked after the search was typed, then another before it is sent', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    await chipOf(view, 'Replies').trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ replies: 'true' });
    });
    await view.find('input[type="search"]').setValue('spawn');
    await chipOf(view, 'Anonymous').trigger('click');
    await pause(450);
    await settle(10);
    expect(query()).toEqual({ q: 'spawn', replies: 'true', anonymous: 'true' });
  });

  it('goes back to the first page, and drops nothing else, when the search is sent', async () => {
    serveList(() => list([row()]));
    const view = await mountTab('/admin/moderation/feed?cursor=older&feeds=global');
    await view.find('input[type="search"]').setValue('pillards');
    await pause(450);
    await vi.waitFor(() => {
      expect(query()).toEqual({ q: 'pillards', feeds: 'global' });
    });
  });

  it('clears the search from the URL when the field is emptied', async () => {
    serveList(() => list([row()]));
    const view = await mountTab('/admin/moderation/feed?q=pillards&deleted=true');
    await view.find('input[type="search"]').setValue('');
    await pause(450);
    await vi.waitFor(() => {
      expect(query()).toEqual({ deleted: 'true' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ deleted: 'true' });
  });

  it('does not change the URL for spaces around the same word', async () => {
    serveList(() => list([row()]));
    const view = await mountTab('/admin/moderation/feed?q=pillards');
    const calls = asked.length;
    await view.find('input[type="search"]').setValue('pillards  ');
    await pause(450);
    await settle(5);
    expect(query()).toEqual({ q: 'pillards' });
    expect(asked.length).toBe(calls);
  });

  it('puts a one-character search in the URL, and sends nothing for it', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    await view.find('input[type="search"]').setValue('p');
    await pause(450);
    await vi.waitFor(() => {
      expect(query()).toEqual({ q: 'p' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({});
  });

  it('takes a search the browser’s back button brings, and shows it in the field', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    const router = useRouter();
    await router.push({ query: { q: 'ancien' } });
    await router.push({ query: { q: 'nouveau' } });
    await settle(10);
    expect((view.find('input[type="search"]').element as HTMLInputElement).value).toBe('nouveau');
    router.back();
    await vi.waitFor(() => {
      expect((view.find('input[type="search"]').element as HTMLInputElement).value).toBe('ancien');
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ q: 'ancien' });
  });

  it('does not send a search typed and then abandoned by leaving the page', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    await view.find('input[type="search"]').setValue('abandon');
    view.unmount();
    mounted.pop();
    await pause(450);
    expect(query().q).toBeUndefined();
  });
});

describe('the person filter', () => {
  const selectText = (view: Awaited<ReturnType<typeof mountTab>>) =>
    words(view.find('[aria-label="Person"]').text());

  it('says Everyone with no person chosen', async () => {
    serveList(() => list([row()]));
    const view = await mountTab();
    expect(selectText(view)).toContain('Everyone');
  });

  it('names a person from the URL by their rows, hidden real name included', async () => {
    serveList(() =>
      list([
        row({ id: id(1), author: shy, authorUserId: 'u-shy' }),
        row({ id: id(2), authorUserId: 'u-alex' }),
      ]),
    );
    const view = await mountTab('/admin/moderation/feed?user=u-shy');
    expect(selectText(view)).toContain('ShyOne');
    expect(asked.at(-1)).toEqual({ user: 'u-shy' });
    view.unmount();
    mounted.pop();
    clearNuxtData();
    const other = await mountTab('/admin/moderation/feed?user=u-alex');
    expect(selectText(other)).toContain('Alexandre M.');
  });

  it('says One person for a stale ?user= no row names, and still filters by it', async () => {
    serveList(() => list([]));
    const view = await mountTab('/admin/moderation/feed?user=u-gone');
    expect(selectText(view)).toContain('One person');
    expect(asked.at(-1)).toEqual({ user: 'u-gone' });
    expect(view.text()).toContain('Nothing matches');
  });

  it('says One person when the rows are of another author than the one in the URL', async () => {
    serveList(() => list([row({ authorUserId: 'u-alex' })]));
    const view = await mountTab('/admin/moderation/feed?user=u-nobody');
    expect(selectText(view)).toContain('One person');
  });

  it('searches people only from 2 characters, after a pause, and keeps the filters it set', async () => {
    serveList(() => list([row()]));
    const search = vi
      .spyOn(feedAdminActions, 'searchPeople')
      .mockResolvedValue([
        { userId: 'u-mika', name: 'Mika Laurent', email: 'mika@epitech.eu' } as never,
      ]);
    const view = await mountTab();
    await view.find('[aria-label="Person"]').trigger('click');
    await settle(10);
    const input = inDocument('input[placeholder="Search a name or an email"]') as HTMLInputElement;
    expect(input).toBeDefined();
    input.value = 'm';
    input.dispatchEvent(new Event('input'));
    await pause(400);
    expect(search).not.toHaveBeenCalled();
    input.value = 'mi';
    input.dispatchEvent(new Event('input'));
    await pause(400);
    await settle(5);
    expect(search.mock.calls).toEqual([['mi']]);
  });
});

describe('the pages', () => {
  it('goes to the next page with its cursor in the URL, and back to the first', async () => {
    serveList((q) => list([row()], { nextCursor: q.cursor ? null : 'page-2' }));
    const view = await mountTab('/admin/moderation/feed?feeds=global');
    expect(view.findAll('button').some((button) => button.text() === 'First page')).toBe(false);
    await chipOf(view, 'Next page').trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ feeds: 'global', cursor: 'page-2' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ feeds: 'global', cursor: 'page-2' });
    expect(view.findAll('button').some((button) => button.text() === 'Next page')).toBe(false);
    await chipOf(view, 'First page').trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ feeds: 'global' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ feeds: 'global' });
  });

  it('closes an open row when it changes page, and Back brings the page and the row back', async () => {
    serveList((q) => list([row()], { nextCursor: q.cursor ? null : 'page-2' }));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => ({
      post: row(),
      thread: { post: row(), replies: [] },
    }));
    const view = await mountTab(`/admin/moderation/feed?post=${id(1)}`);
    await chipOf(view, 'Next page').trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ cursor: 'page-2' });
    });
    useRouter().back();
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(1) });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({});
  });

  it('opens a page from a pasted URL with only a cursor, and offers the first page', async () => {
    serveList(() => list([row()]));
    const view = await mountTab('/admin/moderation/feed?cursor=abc');
    expect(asked.at(-1)).toEqual({ cursor: 'abc' });
    expect(view.findAll('button').some((button) => button.text() === 'First page')).toBe(true);
  });

  it('ignores a cursor longer than the server takes', async () => {
    serveList(() => list([row()]));
    await mountTab(`/admin/moderation/feed?cursor=${'c'.repeat(129)}`);
    expect(asked.at(-1)).toEqual({});
  });

  it('shows Next page only while the server says there is more', async () => {
    serveList(() => list([row()], { nextCursor: null }));
    const none = await mountTab();
    expect(none.findAll('button').some((button) => button.text() === 'Next page')).toBe(false);
    none.unmount();
    mounted.pop();
    clearNuxtData();
    serveList(() => list([row()], { nextCursor: 'more' }));
    const more = await mountTab();
    expect(more.findAll('button').some((button) => button.text() === 'Next page')).toBe(true);
  });
});

describe('back and forward', () => {
  it('opens a row as a history step, so Back closes the drawer and Forward reopens it', async () => {
    serveList(() => list([row()]));
    registerEndpoint(`/api/feed/admin/posts/${id(1)}`, () => ({
      post: row(),
      thread: { post: row(), replies: [] },
    }));
    const view = await mountTab();
    await view.findAll('tbody tr')[0]!.trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(1) });
    });
    await settle(10);
    expect(inDocument('[role="dialog"]')).toBeDefined();
    useRouter().back();
    await vi.waitFor(() => {
      expect(query()).toEqual({});
    });
    await settle(10);
    expect(view.findAll('tbody tr')[0]!.classes()).not.toContain('bg-secondary/10');
    useRouter().forward();
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(1) });
    });
  });

  it('does not ask the server for the table again when only the open row changes', async () => {
    serveList(() => list([row({ id: id(1) }), row({ id: id(2) })]));
    for (const n of [1, 2]) {
      registerEndpoint(`/api/feed/admin/posts/${id(n)}`, () => ({
        post: row({ id: id(n) }),
        thread: { post: row({ id: id(n) }), replies: [] },
      }));
    }
    const view = await mountTab();
    const calls = asked.length;
    await view.findAll('tbody tr')[0]!.trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(1) });
    });
    await view.findAll('tbody tr')[1]!.trigger('click');
    await vi.waitFor(() => {
      expect(query()).toEqual({ post: id(2) });
    });
    await settle(10);
    expect(asked.length).toBe(calls);
  });
});
