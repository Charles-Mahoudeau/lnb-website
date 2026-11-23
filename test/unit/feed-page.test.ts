import { describe, expect, it } from 'vitest';

import {
  appendFeedPosts,
  applyFeedPins,
  feedDisplayName,
  feedDraftKey,
  feedFromQuery,
  feedHandle,
  formatFeedAge,
  mergeFeedPinned,
  newestFeedCreatedAt,
} from '../../app/utils/feed.ts';
import type { FeedPostView } from '../../shared/schemas/feed.ts';

// The Feed page's pure helpers (app/utils/feed.ts): names, ages, the pinned group after a pin,
// "Load more" and the composer's idempotency key.

function post(id: string, createdAt: string, pinnedAt: string | null = null): FeedPostView {
  return {
    id,
    feed: 'announcements',
    threadId: null,
    replyTo: null,
    text: id,
    createdAt,
    anonymous: false,
    author: null,
    likes: 0,
    replies: 0,
    pinnedAt,
    liked: false,
    mine: false,
    canDelete: false,
    canPin: true,
    unseenReplies: 0,
    answersMe: false,
  };
}

describe('names', () => {
  it('prints the real name with the handle, or the username alone', () => {
    const shown = { realName: 'Léa B.', username: 'LeaBuilds' };
    const hidden = { realName: null, username: 'SteveBuilds' };
    expect([feedDisplayName(shown), feedHandle(shown)]).toEqual(['Léa B.', '@LeaBuilds']);
    expect([feedDisplayName(hidden), feedHandle(hidden)]).toEqual(['SteveBuilds', null]);
  });
});

describe('ages', () => {
  const now = Date.parse('2026-11-23T14:00:00.000Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('says nothing under a minute, then minutes, hours and days', () => {
    expect(formatFeedAge(ago(30), 'en', now)).toBeNull();
    expect(formatFeedAge(ago(12 * 60), 'en', now)).toMatch(/^12\smin$/);
    expect(formatFeedAge(ago(3 * 3600), 'fr', now)).toMatch(/^3\sh$/);
    expect(formatFeedAge(ago(2 * 86_400), 'fr', now)).toMatch(/^2\sj$/);
  });

  it('gives the day after a week, and the year when it is another one', () => {
    expect(formatFeedAge('2026-11-02T10:00:00.000Z', 'en', now)).toMatch(/^Nov\s2$/);
    expect(formatFeedAge('2025-11-02T10:00:00.000Z', 'en', now)).toMatch(/^Nov\s2,\s2025$/);
  });

  it('never shows a future time as negative', () => {
    expect(formatFeedAge(ago(-300), 'en', now)).toBeNull();
  });
});

describe('the newest post shown', () => {
  it('looks at the pinned group and the posts', () => {
    expect(newestFeedCreatedAt({ pinned: [], posts: [] })).toBeNull();
    expect(
      newestFeedCreatedAt({
        pinned: [post('p', '2026-11-23T12:00:00.000Z')],
        posts: [post('a', '2026-11-23T10:00:00.000Z'), post('b', '2026-11-23T11:00:00.000Z')],
      }),
    ).toBe('2026-11-23T12:00:00.000Z');
  });
});

describe('pins', () => {
  const a = post('a', '2026-11-23T10:00:00.000Z', '2026-11-23T13:00:00.000Z');
  const b = post('b', '2026-11-23T11:00:00.000Z');
  const c = post('c', '2026-11-23T09:00:00.000Z');

  it('moves a newly pinned post into the group, in the group’s order', () => {
    const page = applyFeedPins({ pinned: [a], posts: [b, c] }, [
      { id: 'c', pinnedAt: '2026-11-23T14:00:00.000Z' },
      { id: 'a', pinnedAt: '2026-11-23T13:00:00.000Z' },
    ]);
    expect(page?.pinned.map((known) => known.id)).toEqual(['c', 'a']);
    expect(page?.pinned[0]?.pinnedAt).toBe('2026-11-23T14:00:00.000Z');
    expect(page?.posts.map((known) => known.id)).toEqual(['b']);
  });

  it('puts an unpinned post back in its place, newest first', () => {
    const page = applyFeedPins({ pinned: [a], posts: [b, c] }, []);
    expect(page?.pinned).toEqual([]);
    expect(page?.posts.map((known) => known.id)).toEqual(['b', 'a', 'c']);
    expect(page?.posts[1]?.pinnedAt).toBeNull();
  });

  it('asks for a reload when the group names a post the page lacks', () => {
    expect(
      applyFeedPins({ pinned: [], posts: [b] }, [
        { id: 'z', pinnedAt: '2026-11-23T14:00:00.000Z' },
      ]),
    ).toBeNull();
  });
});

describe('load more', () => {
  it('appends older posts without repeating one the page shows', () => {
    const b = post('b', '2026-11-23T11:00:00.000Z');
    const c = post('c', '2026-11-23T09:00:00.000Z');
    expect(appendFeedPosts([b], [b, c]).map((known) => known.id)).toEqual(['b', 'c']);
  });
});

describe('the idempotency key of a draft', () => {
  let n = 0;
  const newKey = () => `key-${String(++n)}`;
  const request = { target: 'global', text: 'Salut', anonymous: false };

  it('keeps the key for the same request, so a retry cannot post twice', () => {
    const first = feedDraftKey(null, request, newKey);
    expect(feedDraftKey(first, { ...request }, newKey).key).toBe(first.key);
  });

  it('takes a new key when the text, the target or the anonymity changes', () => {
    const first = feedDraftKey(null, request, newKey);
    for (const change of [{ text: 'Salut !' }, { target: 'announcements' }, { anonymous: true }]) {
      expect(feedDraftKey(first, { ...request, ...change }, newKey).key).not.toBe(first.key);
    }
  });
});

describe('the tab', () => {
  it('opens Announcements unless the query asks for Global', () => {
    expect(feedFromQuery('global')).toBe('global');
    for (const value of [undefined, 'announcements', 'news', ['global']]) {
      expect(feedFromQuery(value)).toBe('announcements');
    }
  });
});

describe('the pinned group read again', () => {
  it('keeps the loaded posts, moves the newly pinned out and the unpinned back in place', () => {
    const a = post('a', '2026-11-23T10:00:00.000Z', '2026-11-23T13:00:00.000Z');
    const b = post('b', '2026-11-23T11:00:00.000Z');
    const c = post('c', '2026-11-23T09:00:00.000Z');
    const z = post('z', '2026-11-20T09:00:00.000Z', '2026-11-23T14:00:00.000Z');
    const fresh = [z, { ...b, pinnedAt: '2026-11-23T12:00:00.000Z' }];
    const merged = mergeFeedPinned({ pinned: [a], posts: [b, c] }, fresh);
    expect(merged.pinned.map((known) => known.id)).toEqual(['z', 'b']);
    expect(merged.posts.map((known) => known.id)).toEqual(['a', 'c']);
    expect(merged.posts[0]?.pinnedAt).toBeNull();
  });
});
