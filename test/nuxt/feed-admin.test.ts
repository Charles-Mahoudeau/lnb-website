import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AnnouncerPill from '~/components/admin/feed/AnnouncerPill.vue';
import AnnouncerRow from '~/components/admin/feed/AnnouncerRow.vue';
import { FeedError, useFeedNow } from '~/composables/useFeed';
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
  toastTitles,
  words,
} from './feed-fixtures';

import type {
  FeedAdminDetail,
  FeedAdminList,
  FeedAdminPost,
  FeedAnnouncerState,
} from '#shared/schemas/feed';

// The admin's side of Feed (docs/feed.md, "Moderation"; mock M1): the Feed tab of Moderation with
// its filters in the URL, the drawer and deleting, and the Person page's announcer switch.

vi.setConfig({ testTimeout: 30_000 });

const T = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 23, 12, 0) - minutes * 60_000).toISOString();

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

const main = row();
const anonymousReply = row({
  id: id(2),
  threadId: main.id,
  text: 'Prends un bouclier et beaucoup de flèches.',
  anonymous: true,
  author: { uuid: id(901), username: 'MikaPvP', realName: 'Mika L.', announcer: false },
  authorUserId: 'u-mika',
  likes: 2,
  replies: 0,
  createdAt: T(8),
});
const deleted = row({
  id: id(3),
  text: 'Franchement la base de Jules ressemble à un carton.',
  deletedAt: T(5),
  deletedBy: { userId: 'u-ines', name: 'Inès R.' },
  deletedCause: 'moderator',
  deletedReason: 'Moquerie',
  purgeAt: new Date(Date.parse(T(5)) + 30 * 86_400_000).toISOString(),
  likes: 0,
  replies: 0,
});

const list = (over: Partial<FeedAdminList> = {}): FeedAdminList => ({
  items: [anonymousReply, main, deleted],
  nextCursor: null,
  summary: { last30Days: 3, deleted: 1 },
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
});

let asked: Record<string, string>[] = [];
function serveList(answer: (query: Record<string, string>) => FeedAdminList = () => list()) {
  asked = [];
  registerEndpoint('/api/feed/admin/posts', (event) => {
    const query = queryOf(event);
    asked.push(query);
    return answer(query);
  });
}

function serveRow(detail: FeedAdminDetail) {
  registerEndpoint(`/api/feed/admin/posts/${detail.post.id}`, () => detail);
}

async function mountTab(route = '/admin/moderation/feed') {
  signIn('warden-admin');
  const view = await mountSuspended(inApp(FeedTab), { route });
  mounted.push(view);
  await settle(10);
  return view;
}

const currentQuery = () => useRouter().currentRoute.value.query;

describe('the Feed table', () => {
  it('shows the rows, the real author of an anonymous one, and who deleted one', async () => {
    serveList();
    const view = await mountTab();
    const text = words(view.text());
    expect(text).toContain('3 posts in the last 30 days, 1 deleted');
    const rows = view.findAll('tbody tr');
    expect(rows).toHaveLength(3);
    // The anonymous reply: "Anonymous", then its real author behind the lock.
    expect(words(rows[0]!.text())).toContain('Anonymous');
    expect(words(rows[0]!.text())).toContain('Mika L. @MikaPvP');
    expect(words(rows[0]!.text())).toContain('Reply to the post');
    expect(rows[1]!.text()).toContain('Alexandre M.');
    expect(rows[1]!.text()).toContain('@Alex_Craft');
    // The deleted row stays, dimmed, with who, when and the purge date.
    const gone = words(rows[2]!.text());
    expect(gone).toContain('Deleted');
    expect(gone).toContain('By Inès R.');
    expect(gone).toMatch(/Erased on Dec 2[23]/);
    expect(rows[2]!.find('td').classes()).toContain('opacity-60');
    expect(rows[1]!.find('td').classes()).not.toContain('opacity-60');
  });

  it('reads its filters from the URL and sends them, without the open row', async () => {
    serveList();
    serveRow({ post: main, thread: { post: main, replies: [anonymousReply] } });
    await mountTab(
      `/admin/moderation/feed?feeds=global&deleted=true&anonymous=true&user=u-mika&q=pi&post=${main.id}`,
    );
    expect(asked.at(-1)).toEqual({
      feeds: 'global',
      deleted: 'true',
      anonymous: 'true',
      user: 'u-mika',
      q: 'pi',
    });
  });

  it('puts a chip in the URL, goes back to the first page, and asks the server again', async () => {
    serveList((query) => list({ nextCursor: query.cursor ? null : 'next-page' }));
    const view = await mountTab('/admin/moderation/feed?cursor=older');
    const chip = view.findAll('button').find((button) => button.text() === 'Deleted')!;
    expect(chip.attributes('aria-pressed')).toBe('false');
    await chip.trigger('click');
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({ deleted: 'true' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ deleted: 'true' });
    expect(
      view
        .findAll('button')
        .find((button) => button.text() === 'Deleted')!
        .attributes('aria-pressed'),
    ).toBe('true');
    expect(words(view.text())).toContain('1 deleted post from the last 30 days');
  });

  it('adds up two chip clicks made faster than the navigation', async () => {
    serveList();
    const view = await mountTab();
    const chip = (label: string) =>
      view.findAll('button').find((button) => button.text() === label)!
        .element as HTMLButtonElement;
    // No wait between the clicks: the first navigation hasn't landed when the second click comes.
    chip('Deleted').click();
    chip('Anonymous').click();
    chip('Global').click();
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({ feeds: 'global', anonymous: 'true', deleted: 'true' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ feeds: 'global', anonymous: 'true', deleted: 'true' });
  });

  it('starts the clock its dates read, so today moves on with the page open', async () => {
    serveList();
    const now = useFeedNow();
    now.value = Date.parse('2026-01-01T00:00:00.000Z');
    const before = Date.now();
    await mountTab();
    expect(now.value).toBeGreaterThanOrEqual(before);
  });

  it('sends the search after a pause, and only from 2 characters', async () => {
    serveList();
    const view = await mountTab();
    const input = view.find('input[type="search"]');
    await input.setValue('p');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({ q: 'p' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({});
    await input.setValue('pillards');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({ q: 'pillards' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ q: 'pillards' });
  });

  it('pages with the cursor in the URL', async () => {
    serveList((query) => list({ nextCursor: query.cursor ? null : 'next-page' }));
    const view = await mountTab();
    await view
      .findAll('button')
      .find((button) => button.text() === 'Next page')!
      .trigger('click');
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({ cursor: 'next-page' });
    });
    await settle(10);
    expect(asked.at(-1)).toEqual({ cursor: 'next-page' });
    expect(view.findAll('button').some((button) => button.text() === 'Next page')).toBe(false);
    expect(view.findAll('button').some((button) => button.text() === 'First page')).toBe(true);
  });

  it('opens a row in the URL, and tints it', async () => {
    serveList();
    serveRow({ post: anonymousReply, thread: { post: main, replies: [anonymousReply] } });
    const view = await mountTab();
    await view.findAll('tbody tr')[0]!.trigger('click');
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({ post: anonymousReply.id });
    });
    await settle(10);
    expect(view.findAll('tbody tr')[0]!.classes()).toContain('bg-secondary/10');
  });

  it('says when nothing matches the filters, and clears them', async () => {
    serveList(() => list({ items: [], summary: { last30Days: 0, deleted: 0 } }));
    const view = await mountTab('/admin/moderation/feed?anonymous=true');
    expect(view.text()).toContain('Nothing matches');
    await view
      .findAll('button')
      .find((button) => button.text() === 'Clear the filters')!
      .trigger('click');
    await vi.waitFor(() => {
      expect(currentQuery()).toEqual({});
    });
    await settle(10);
    expect(view.text()).toContain('No posts yet');
  });
});

describe('the drawer', () => {
  const drawerText = () => words(inDocument('[role="dialog"]')?.textContent ?? '');

  it('shows the real author of an anonymous reply, the facts, the discussion and Delete', async () => {
    serveList();
    serveRow({ post: anonymousReply, thread: { post: main, replies: [anonymousReply] } });
    await mountTab(`/admin/moderation/feed?post=${anonymousReply.id}`);
    const text = drawerText();
    expect(text).toContain('Anonymous reply');
    expect(text).toContain('Mika L. @MikaPvP');
    expect(text).toContain('Real author, hidden from players');
    expect(text).toContain('Replying to');
    expect(text).toContain('Alexandre M., “Quelqu’un a vu des pillards près du spawn ?”');
    expect(text).toContain('MikaPvP');
    expect(text).toContain('The discussion');
    const profile = inDocument('[role="dialog"] a', 'Open the profile');
    expect(profile?.getAttribute('href')).toBe('/admin/people/u-mika/summary');
    const remove = inDocument('[role="dialog"] button', 'Delete the reply');
    expect(remove).toBeDefined();
    // Outline, never solid.
    expect(remove!.className).toContain('ring');
    expect(remove!.className).not.toMatch(/(^| )bg-error( |$)/);
  });

  it('shows a deleted row with who, when and why, and no Delete', async () => {
    serveList();
    serveRow({ post: deleted, thread: { post: deleted, replies: [] } });
    await mountTab(`/admin/moderation/feed?post=${deleted.id}`);
    const text = drawerText();
    expect(text).toContain('By Inès R.');
    expect(text).toContain('Moquerie');
    expect(text).not.toContain('Delete the post');
  });

  it('says a purged row is no longer kept', async () => {
    serveList();
    const purged = id(77);
    registerEndpoint(`/api/feed/admin/posts/${purged}`, () => {
      throw createErrorWith(404);
    });
    await mountTab(`/admin/moderation/feed?post=${purged}`);
    expect(drawerText()).toContain('This post is no longer kept');
  });

  it('deletes with the reason typed, after a confirmation that says what it does', async () => {
    serveList();
    serveRow({ post: main, thread: { post: main, replies: [anonymousReply] } });
    const remove = vi.spyOn(feedAdminActions, 'remove').mockResolvedValue(null);
    await mountTab(`/admin/moderation/feed?post=${main.id}`);
    inDocument('[role="dialog"] button', 'Delete the post')!.click();
    await settle(10);
    expect(document.body.textContent).toContain('Delete this post?');
    expect(document.body.textContent).toContain('with its reply');
    const reason = inDocument('textarea') as HTMLTextAreaElement;
    reason.value = '  Hors sujet  ';
    reason.dispatchEvent(new Event('input'));
    await settle(5);
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].at(
      -1,
    )!;
    expect(confirm.textContent.trim()).toBe('Delete');
    expect(confirm.className).toContain('ring');
    confirm.click();
    await vi.waitFor(() => {
      expect(remove.mock.calls).toEqual([[main.id, 'Hors sujet']]);
    });
    await settle(10);
    expect(toastTitles()).toContain('Post deleted');
  });

  it('sends no reason when none is typed, and says why a refusal happened', async () => {
    serveList();
    serveRow({ post: anonymousReply, thread: { post: main, replies: [anonymousReply] } });
    const remove = vi
      .spyOn(feedAdminActions, 'remove')
      .mockRejectedValue(new FeedError('notAllowed'));
    await mountTab(`/admin/moderation/feed?post=${anonymousReply.id}`);
    inDocument('[role="dialog"] button', 'Delete the reply')!.click();
    await settle(10);
    expect(document.body.textContent).toContain('Delete this reply?');
    [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].at(-1)!.click();
    await vi.waitFor(() => {
      expect(remove.mock.calls).toEqual([[anonymousReply.id, '']]);
    });
    await settle(10);
    expect(toastTitles()).toContain(
      'You can’t delete posts while a ban is in force on your account.',
    );
  });

  it('asks no reason for the viewer’s own post, and says it is deleted as its author', async () => {
    const mine = row({ id: id(40), authorUserId: 'me', text: 'Mon propre post' });
    serveList(() => list({ items: [mine] }));
    serveRow({ post: mine, thread: { post: mine, replies: [] } });
    const remove = vi.spyOn(feedAdminActions, 'remove').mockResolvedValue(null);
    await mountTab(`/admin/moderation/feed?post=${mine.id}`);
    inDocument('[role="dialog"] button', 'Delete the post')!.click();
    await settle(10);
    expect(document.body.textContent).toContain('It is your own, so it is deleted as its author');
    expect(document.querySelector('[role="dialog"] textarea')).toBeNull();
    [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].at(-1)!.click();
    await vi.waitFor(() => {
      expect(remove.mock.calls).toEqual([[mine.id, '']]);
    });
  });

  it('says a reply answers a reply whose author is gone, not the main post', async () => {
    const orphan = row({
      id: id(41),
      threadId: main.id,
      text: 'Je confirme',
      replyToGone: true,
      createdAt: T(4),
    });
    serveList(() => list({ items: [orphan] }));
    serveRow({ post: orphan, thread: { post: main, replies: [orphan] } });
    const view = await mountTab(`/admin/moderation/feed?post=${orphan.id}`);
    expect(words(view.find('tbody tr').text())).toContain('Reply to a reply whose author is gone');
    expect(view.find('tbody tr').text()).not.toContain('Reply to the post');
    expect(drawerText()).toContain('A reply whose author is gone');
    expect(drawerText()).not.toContain('Alexandre M., “');
  });
});

describe('the announcer switch', () => {
  async function mountRow(
    state: FeedAnnouncerState,
    put?: (announcer: boolean) => FeedAnnouncerState,
  ) {
    signIn('warden-admin');
    registerEndpoint(`/api/feed/admin/announcers/${state.userId}`, {
      method: 'GET',
      handler: () => state,
    });
    const set = vi
      .spyOn(feedAdminActions, 'setAnnouncer')
      .mockImplementation((_userId, announcer) =>
        put ? Promise.resolve(put(announcer)) : Promise.reject(new FeedError('impliedByRole')),
      );
    const view = await mountSuspended(
      inApp(AnnouncerRow, { userId: state.userId, name: 'Léa B.' }),
    );
    mounted.push(view);
    await settle(5);
    return { view, set };
  }

  it('gives the role to a plain player and says so', async () => {
    const { view, set } = await mountRow(
      { userId: 'u-lea', announcer: false, viaRole: false },
      () => ({ userId: 'u-lea', announcer: true, viaRole: false }),
    );
    const toggle = view.find('[role="switch"]');
    expect(toggle.attributes('data-state')).toBe('unchecked');
    expect(toggle.attributes('disabled')).toBeUndefined();
    await toggle.trigger('click');
    await vi.waitFor(() => {
      expect(set.mock.calls).toEqual([['u-lea', true]]);
    });
    await settle(5);
    expect(view.find('[role="switch"]').attributes('data-state')).toBe('checked');
    expect(toastTitles()).toContain('Léa B. is now a Feed announcer');
  });

  it('stays on and disabled for a moderator, and says why', async () => {
    const { view } = await mountRow({ userId: 'u-ines', announcer: true, viaRole: true });
    const toggle = view.find('[role="switch"]');
    expect(toggle.attributes('data-state')).toBe('checked');
    expect(toggle.attributes('disabled')).toBeDefined();
    expect(view.text()).toContain('An announcer by role, as a moderator');
  });
});

describe('the announcer pill', () => {
  it('shows for an announcer, by role too, and not for anyone else', async () => {
    signIn('warden-admin');
    const states: FeedAnnouncerState[] = [
      { userId: 'p-theo', announcer: true, viaRole: false },
      { userId: 'p-ines', announcer: true, viaRole: true },
      { userId: 'p-lea', announcer: false, viaRole: false },
    ];
    const shown: boolean[] = [];
    for (const state of states) {
      registerEndpoint(`/api/feed/admin/announcers/${state.userId}`, () => state);
      const view = await mountSuspended(AnnouncerPill, { props: { userId: state.userId } });
      mounted.push(view);
      shown.push(view.text().includes('Announcer'));
    }
    expect(shown).toEqual([true, true, false]);
  });
});

/** A refusal as the API sends it, with its problem code. */
function createErrorWith(status: number, problem?: string) {
  return createError({ status, data: problem ? { problem } : undefined });
}
