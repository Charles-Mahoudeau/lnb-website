import { describe, expect, it } from 'vitest';

import {
  FEED_TABS,
  appendFeedPosts,
  appendFeedReplies,
  applyFeedPins,
  feedByNewest,
  feedDisplayName,
  feedDraftKey,
  feedFromQuery,
  feedHandle,
  formatFeedAge,
  formatFeedDate,
  mergeFeedPinned,
  newestFeedCreatedAt,
} from '../../app/utils/feed.ts';
import type { FeedPostView } from '../../shared/schemas/feed.ts';

// The Feed page's pure helpers at their edges (app/utils/feed.ts), from docs/feed.md ("The Feed
// page"): ages at each boundary in both locales, names, the pinned group when it names a post the
// page does not hold, Load more without duplicates, and the composer's idempotency key.

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

const ids = (posts: { id: string }[] | undefined) => posts?.map((known) => known.id);

describe('names', () => {
  it('prints a real name with the handle, and the username alone without', () => {
    expect(feedDisplayName({ realName: 'Léa B.', username: 'LeaBuilds' })).toBe('Léa B.');
    expect(feedHandle({ realName: 'Léa B.', username: 'LeaBuilds' })).toBe('@LeaBuilds');
    expect(feedDisplayName({ realName: null, username: 'Steve_99' })).toBe('Steve_99');
    expect(feedHandle({ realName: null, username: 'Steve_99' })).toBeNull();
  });

  it('never prints the same word twice', () => {
    for (const realName of ['Léa B.', null]) {
      const author = { realName, username: 'Alex_Craft' };
      const printed = [feedDisplayName(author), feedHandle(author)].filter(Boolean).join(' ');
      expect(printed.match(/Alex_Craft/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('keeps accents, emoji and a 64-character name whole', () => {
    const realName = `Éloïse ${'é'.repeat(56)}`;
    expect(feedDisplayName({ realName, username: 'Eloise' })).toBe(realName);
    expect(feedHandle({ realName: '😀 B.', username: 'Smile' })).toBe('@Smile');
  });
});

describe('ages at each boundary', () => {
  const now = Date.parse('2026-11-23T14:00:00.000Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('says nothing under a minute, and "1 min" from the 60th second', () => {
    expect(formatFeedAge(ago(0), 'en', now)).toBeNull();
    expect(formatFeedAge(ago(59), 'en', now)).toBeNull();
    expect(formatFeedAge(ago(60), 'en', now)).toMatch(/^1\smin$/);
    expect(formatFeedAge(ago(119), 'en', now)).toMatch(/^1\smin$/);
    expect(formatFeedAge(ago(120), 'en', now)).toMatch(/^2\smin$/);
  });

  it('rounds the age to the second before comparing', () => {
    expect(formatFeedAge(new Date(now - 59_400).toISOString(), 'en', now)).toBeNull();
    expect(formatFeedAge(new Date(now - 59_600).toISOString(), 'en', now)).toMatch(/^1\smin$/);
  });

  it('turns minutes into hours at 60 minutes, and hours into days at 24 hours', () => {
    expect(formatFeedAge(ago(3599), 'en', now)).toMatch(/^59\smin$/);
    expect(formatFeedAge(ago(3600), 'en', now)).toMatch(/^1\shr$/);
    expect(formatFeedAge(ago(86_399), 'en', now)).toMatch(/^23\shr$/);
    expect(formatFeedAge(ago(86_400), 'en', now)).toMatch(/^1\sday$/);
  });

  it('keeps days up to the 7th, then gives the date', () => {
    expect(formatFeedAge(ago(7 * 86_400 - 1), 'en', now)).toMatch(/^6\sdays$/);
    expect(formatFeedAge(ago(7 * 86_400), 'en', now)).toBe('Nov 16');
    expect(formatFeedAge(ago(7 * 86_400), 'fr', now)).toBe('16 nov.');
  });

  it('uses French units in French: min, h and j', () => {
    expect(formatFeedAge(ago(5 * 60), 'fr', now)).toMatch(/^5\smin$/);
    expect(formatFeedAge(ago(5 * 3600), 'fr', now)).toMatch(/^5\sh$/);
    expect(formatFeedAge(ago(3 * 86_400), 'fr', now)).toMatch(/^3\sj$/);
  });

  it('shows the year once the post is from another year in Paris, whatever the UTC date', () => {
    const newYearUtc = Date.parse('2025-12-31T23:30:00.000Z');
    // 00:30 on 1 January in Paris already: a post from 20 December is last year's.
    expect(formatFeedAge('2025-12-20T10:00:00.000Z', 'en', newYearUtc)).toBe('Dec 20, 2025');
    // And a post made at 00:30 Paris time on 1 January is this year's, on the 2026 side.
    expect(
      formatFeedAge('2025-12-31T23:30:00.000Z', 'en', Date.parse('2026-01-15T12:00:00Z')),
    ).toBe('Jan 1');
    expect(
      formatFeedAge('2025-12-31T23:30:00.000Z', 'fr', Date.parse('2026-01-15T12:00:00Z')),
    ).toBe('1 janv.');
  });

  it('gives the Paris day for a post late in the evening in UTC', () => {
    // 23:30 UTC on 8 July is 01:30 on 9 July in Paris (summer time).
    expect(
      formatFeedAge('2026-07-08T23:30:00.000Z', 'en', Date.parse('2026-08-20T12:00:00Z')),
    ).toBe('Jul 9');
  });

  it('puts the year in French as well', () => {
    expect(formatFeedAge('2024-03-05T10:00:00.000Z', 'fr', now)).toBe('5 mars 2024');
  });

  it('never gives a negative age, even a day ahead', () => {
    expect(formatFeedAge(ago(-300), 'en', now)).toBeNull();
    expect(formatFeedAge(ago(-86_400 * 3), 'fr', now)).toBeNull();
  });
});

describe('the full date', () => {
  // Recent ICU puts a narrow no-break space before AM and PM.
  const spaced = (text: string) => text.replace(/\s/g, ' ');

  it('is in Paris time, in winter and in summer, in both locales', () => {
    expect(spaced(formatFeedDate('2026-11-23T20:14:05.000Z', 'en'))).toBe('Nov 23, 2026, 9:14 PM');
    expect(spaced(formatFeedDate('2026-07-01T10:00:00.000Z', 'en'))).toBe('Jul 1, 2026, 12:00 PM');
    expect(formatFeedDate('2026-11-23T20:14:05.000Z', 'fr')).toMatch(/^23 nov\. 2026(,| à) 21:14$/);
  });

  it('does not use the viewer’s own zone at the day boundary', () => {
    expect(spaced(formatFeedDate('2026-11-23T23:30:00.000Z', 'en'))).toBe('Nov 24, 2026, 12:30 AM');
  });
});

describe('the newest post shown', () => {
  it('is null for an empty page, and looks at the pinned group too', () => {
    expect(newestFeedCreatedAt({ pinned: [], posts: [] })).toBeNull();
    expect(
      newestFeedCreatedAt({
        pinned: [post('p', '2026-11-23T12:00:00.000Z')],
        posts: [post('a', '2026-11-23T10:00:00.000Z')],
      }),
    ).toBe('2026-11-23T12:00:00.000Z');
  });

  it('compares times, not strings, and keeps the first of equal times', () => {
    expect(
      newestFeedCreatedAt({
        pinned: [],
        posts: [
          post('a', '2026-11-23T10:00:00.5Z'),
          post('b', '2026-11-23T10:00:00.000Z'),
          post('c', '2026-11-23T10:00:00.500Z'),
        ],
      }),
    ).toBe('2026-11-23T10:00:00.5Z');
  });
});

describe('the order of a feed', () => {
  it('is newest first, then the larger ID first', () => {
    const a = post('a', '2026-11-23T10:00:00.000Z');
    const b = post('b', '2026-11-23T10:00:00.000Z');
    const c = post('c', '2026-11-23T11:00:00.000Z');
    expect(ids([a, b, c].sort(feedByNewest))).toEqual(['c', 'b', 'a']);
    expect(ids([c, b, a].sort(feedByNewest))).toEqual(['c', 'b', 'a']);
  });
});

describe('the pinned group after a pin or an unpin', () => {
  const T = (hour: number) => `2026-11-23T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const a = post('a', T(10), T(13));
  const b = post('b', T(11));
  const c = post('c', T(9));

  it('changes nothing for the same group', () => {
    const page = applyFeedPins({ pinned: [a], posts: [b, c] }, [{ id: 'a', pinnedAt: T(13) }]);
    expect(ids(page?.pinned)).toEqual(['a']);
    expect(ids(page?.posts)).toEqual(['b', 'c']);
  });

  it('empties the group and the list when both are empty', () => {
    expect(applyFeedPins({ pinned: [], posts: [] }, [])).toEqual({ pinned: [], posts: [] });
  });

  it('takes the group’s order and its new times, not the page’s', () => {
    const d = post('d', T(8), T(12));
    const page = applyFeedPins({ pinned: [a, d], posts: [b] }, [
      { id: 'b', pinnedAt: T(15) },
      { id: 'd', pinnedAt: T(14) },
      { id: 'a', pinnedAt: T(13) },
    ]);
    expect(page?.pinned.map((known) => [known.id, known.pinnedAt])).toEqual([
      ['b', T(15)],
      ['d', T(14)],
      ['a', T(13)],
    ]);
    expect(page?.posts).toEqual([]);
  });

  it('sends every unpinned post back to the list with no pin time, in its place', () => {
    const d = post('d', T(12), T(14));
    const page = applyFeedPins({ pinned: [a, d], posts: [b, c] }, []);
    expect(page?.pinned).toEqual([]);
    expect(ids(page?.posts)).toEqual(['d', 'b', 'a', 'c']);
    expect(page?.posts.every((known) => known.pinnedAt === null)).toBe(true);
  });

  it('replaces one pin by another in a single answer (a pin with replace)', () => {
    const old = post('old', T(1), T(2));
    const page = applyFeedPins({ pinned: [old, a], posts: [b] }, [
      { id: 'b', pinnedAt: T(16) },
      { id: 'a', pinnedAt: T(13) },
    ]);
    expect(ids(page?.pinned)).toEqual(['b', 'a']);
    expect(ids(page?.posts)).toEqual(['old']);
    expect(page?.posts[0]?.pinnedAt).toBeNull();
  });

  it('asks for a reload when the group names a post outside the loaded pages, all or nothing', () => {
    expect(applyFeedPins({ pinned: [a], posts: [b] }, [{ id: 'far', pinnedAt: T(14) }])).toBeNull();
    expect(
      applyFeedPins({ pinned: [a], posts: [b] }, [
        { id: 'b', pinnedAt: T(15) },
        { id: 'far', pinnedAt: T(14) },
      ]),
    ).toBeNull();
  });

  it('does not change the page it was given', () => {
    const page = { pinned: [a], posts: [b, c] };
    const before = JSON.stringify(page);
    applyFeedPins(page, [{ id: 'b', pinnedAt: T(15) }]);
    expect(JSON.stringify(page)).toBe(before);
  });

  it('keeps the other fields of a post that moves', () => {
    const liked = { ...b, liked: true, likes: 4, mine: true };
    const page = applyFeedPins({ pinned: [], posts: [liked] }, [{ id: 'b', pinnedAt: T(15) }]);
    expect(page?.pinned[0]).toMatchObject({ liked: true, likes: 4, mine: true });
  });
});

describe('the pinned group read again', () => {
  const T = (hour: number) => `2026-11-23T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const a = post('a', T(10), T(13));
  const b = post('b', T(11));
  const c = post('c', T(9));

  it('puts all the posts back when the group is empty', () => {
    const merged = mergeFeedPinned({ pinned: [a], posts: [b, c] }, []);
    expect(merged.pinned).toEqual([]);
    expect(ids(merged.posts)).toEqual(['b', 'a', 'c']);
    expect(merged.posts[1]?.pinnedAt).toBeNull();
  });

  it('takes a group made only of posts the page lacks, and keeps the loaded list whole', () => {
    const far = post('far', T(1), T(14));
    const merged = mergeFeedPinned({ pinned: [], posts: [b, c] }, [far]);
    expect(ids(merged.pinned)).toEqual(['far']);
    expect(ids(merged.posts)).toEqual(['b', 'c']);
  });

  it('uses the fresh views for the group, and moves a loaded post that is now pinned out of the list', () => {
    const fresh = { ...b, pinnedAt: T(15), likes: 9 };
    const merged = mergeFeedPinned({ pinned: [a], posts: [b, c] }, [fresh]);
    expect(merged.pinned).toEqual([fresh]);
    expect(ids(merged.posts)).toEqual(['a', 'c']);
  });

  it('does not change what it was given', () => {
    const page = { pinned: [a], posts: [b, c] };
    const before = JSON.stringify(page);
    mergeFeedPinned(page, []);
    expect(JSON.stringify(page)).toBe(before);
  });
});

describe('Load more', () => {
  const T = (hour: number) => `2026-11-23T${String(hour).padStart(2, '0')}:00:00.000Z`;

  it('appends older posts, leaves out one the page already shows, and keeps order', () => {
    const b = post('b', T(11));
    const c = post('c', T(9));
    const d = post('d', T(8));
    expect(ids(appendFeedPosts([b], [b, c, d]))).toEqual(['b', 'c', 'd']);
    expect(ids(appendFeedPosts([b, c, d], []))).toEqual(['b', 'c', 'd']);
    expect(ids(appendFeedPosts([], [c, d]))).toEqual(['c', 'd']);
  });

  it('does not repeat a post unpinned from beyond the loaded range when Load more brings it', () => {
    const b = post('b', T(11));
    const c = post('c', T(9));
    const old = post('old', T(1), T(2));
    const unpinned = applyFeedPins({ pinned: [old], posts: [b, c] }, []);
    const next = appendFeedPosts(unpinned!.posts, [post('d', T(8)), post('old', T(1))]);
    expect(next.filter((known) => known.id === 'old')).toHaveLength(1);
  });

  // A post unpinned from beyond the loaded range goes to the end of the loaded list; the pages Load
  // more brings next are newer than it, so they go before it, and the list stays newest first.
  it('keeps the list newest first when Load more follows an unpin of an old pin', () => {
    const b = post('b', T(11));
    const c = post('c', T(9));
    const old = post('old', T(1), T(2));
    const unpinned = applyFeedPins({ pinned: [old], posts: [b, c] }, []);
    expect(ids(unpinned!.posts)).toEqual(['b', 'c', 'old']);
    const next = appendFeedPosts(unpinned!.posts, [post('d', T(8)), post('e', T(7))]);
    expect(ids(next)).toEqual(['b', 'c', 'd', 'e', 'old']);
    expect(ids(appendFeedPosts(next, [post('f', T(5)), post('old', T(1))]))).toEqual([
      'b',
      'c',
      'd',
      'e',
      'f',
      'old',
    ]);
  });

  it('appends the replies of a thread oldest first, without repeating one', () => {
    const r1 = post('r1', T(8));
    const r2 = post('r2', T(9));
    const r3 = post('r3', T(10));
    expect(ids(appendFeedReplies([r1, r2], [r2, r3]))).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('the idempotency key of a draft', () => {
  const request = { target: 'global', text: 'Salut', anonymous: false };
  const keys = () => {
    let n = 0;
    return () => `key-${String(++n)}`;
  };

  it('starts with a new key', () => {
    expect(feedDraftKey(null, request, keys()).key).toBe('key-1');
  });

  it('keeps the very same attempt for the same request', () => {
    const newKey = keys();
    const first = feedDraftKey(null, request, newKey);
    expect(feedDraftKey(first, { ...request }, newKey)).toBe(first);
    expect(feedDraftKey(first, { ...request }, newKey)).toBe(first);
  });

  it('takes a new key after any edit: text (a space too), target or anonymity', () => {
    const newKey = keys();
    const first = feedDraftKey(null, request, newKey);
    const changed = [
      { text: 'Salut !' },
      { text: 'Salut ' },
      { text: 'salut' },
      { text: '' },
      { target: 'announcements' },
      { anonymous: true },
    ].map((change) => feedDraftKey(first, { ...request, ...change }, newKey).key);
    expect(changed).not.toContain(first.key);
    expect(new Set(changed).size).toBe(changed.length);
  });

  it('remembers the request it was made for, so the next retry compares with it', () => {
    const newKey = keys();
    const first = feedDraftKey(null, request, newKey);
    const edited = feedDraftKey(first, { ...request, text: 'Autre' }, newKey);
    expect(edited.request.text).toBe('Autre');
    expect(feedDraftKey(edited, { ...request, text: 'Autre' }, newKey)).toBe(edited);
  });

  it('is told apart by a reply’s thread and target', () => {
    const newKey = keys();
    const first = feedDraftKey(null, { ...request, target: 't1:' }, newKey);
    expect(feedDraftKey(first, { ...request, target: 't1:r1' }, newKey).key).not.toBe(first.key);
    expect(feedDraftKey(first, { ...request, target: 't2:' }, newKey).key).not.toBe(first.key);
  });

  it('draws real UUIDs by default', () => {
    expect(feedDraftKey(null, request).key).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  });
});

describe('the tab from the query', () => {
  it('knows the two tabs, Announcements first', () => {
    expect(FEED_TABS).toEqual(['announcements', 'global']);
  });

  it('opens Announcements for anything but global, in lower case', () => {
    expect(feedFromQuery('global')).toBe('global');
    for (const value of [
      undefined,
      null,
      '',
      'Global',
      'GLOBAL',
      ' global',
      'announcements',
      'news',
      ['global'],
      ['global', 'announcements'],
      {},
      1,
    ]) {
      expect(feedFromQuery(value)).toBe('announcements');
    }
  });
});
