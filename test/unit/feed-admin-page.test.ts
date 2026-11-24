import { describe, expect, it } from 'vitest';

import {
  feedAdminApiQuery,
  feedAdminAround,
  feedAdminDeleter,
  feedAdminStateFromQuery,
  feedAdminUrlQuery,
  formatFeedAdminDate,
  formatFeedAdminDay,
} from '../../app/utils/feed-admin.ts';

// The Feed tab of Moderation's pure helpers (app/utils/feed-admin.ts): its state in the URL, the
// API query it reads, the dates of its rows and the part of a thread the drawer shows.

const POST = '0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70';

describe('the state in the URL', () => {
  it('reads every filter, the page and the open row', () => {
    expect(
      feedAdminStateFromQuery({
        q: 'pillards',
        feeds: 'announcements',
        replies: 'true',
        anonymous: 'true',
        deleted: 'true',
        user: 'w2-mika',
        cursor: 'abc',
        post: POST.toUpperCase(),
      }),
    ).toEqual({
      q: 'pillards',
      chips: ['announcements', 'replies', 'anonymous', 'deleted'],
      user: 'w2-mika',
      cursor: 'abc',
      post: POST,
    });
  });

  it('leaves out what is not one of ours, and takes the first of a repeated value', () => {
    expect(
      feedAdminStateFromQuery({
        feeds: 'nope,global',
        replies: 'yes',
        deleted: ['true', 'false'],
        user: 'x'.repeat(101),
        cursor: 'c'.repeat(129),
        post: 'not-a-uuid',
        q: 42,
      }),
    ).toEqual({ q: '', chips: ['global', 'deleted'], user: null, cursor: null, post: null });
    expect(feedAdminStateFromQuery({})).toEqual({
      q: '',
      chips: [],
      user: null,
      cursor: null,
      post: null,
    });
  });

  it('writes back only what differs from the default, and reads it the same', () => {
    const state = {
      q: '  pillards ',
      chips: ['deleted', 'global'] as const,
      user: 'w2-mika',
      cursor: null,
      post: POST,
    };
    const query = feedAdminUrlQuery({ ...state, chips: [...state.chips] });
    expect(query).toEqual({
      q: 'pillards',
      feeds: 'global',
      deleted: 'true',
      user: 'w2-mika',
      post: POST,
    });
    expect(feedAdminStateFromQuery(query)).toEqual({
      q: 'pillards',
      chips: ['global', 'deleted'],
      user: 'w2-mika',
      cursor: null,
      post: POST,
    });
    expect(feedAdminUrlQuery({ q: ' ', chips: [], user: null, cursor: null, post: null })).toEqual(
      {},
    );
  });
});

describe('the API query', () => {
  it('sends a search of 2 characters or more only, and never the open row', () => {
    const base = { chips: [], user: null, cursor: null, post: POST };
    expect(feedAdminApiQuery({ ...base, q: 'a' })).toEqual({});
    expect(feedAdminApiQuery({ ...base, q: ' a ' })).toEqual({});
    expect(feedAdminApiQuery({ ...base, q: ' ab ' })).toEqual({ q: 'ab' });
  });

  it('sends both feeds when both chips are on, and each filter as the API reads it', () => {
    expect(
      feedAdminApiQuery({
        q: '',
        chips: ['global', 'announcements', 'replies', 'anonymous', 'deleted'],
        user: 'u1',
        cursor: 'next',
        post: null,
      }),
    ).toEqual({
      feeds: 'announcements,global',
      replies: 'true',
      anonymous: 'true',
      deleted: 'true',
      user: 'u1',
      cursor: 'next',
    });
  });
});

describe('dates, in Paris time', () => {
  const now = Date.parse('2026-11-23T15:00:00.000Z');

  it('shows the time alone today, the day this year, and the year before', () => {
    expect(formatFeedAdminDate('2026-11-23T13:28:00.000Z', 'fr', now)).toBe('14:28');
    expect(formatFeedAdminDate('2026-11-22T19:51:00.000Z', 'fr', now)).toMatch(/22 nov\..*20:51/);
    expect(formatFeedAdminDate('2025-12-31T10:00:00.000Z', 'en', now)).toMatch(/2025/);
    // Midnight in Paris is still the day before in UTC.
    expect(formatFeedAdminDate('2026-11-22T23:30:00.000Z', 'fr', now)).toBe('00:30');
  });

  it('gives the purge day without a time, with the year only when it is another year', () => {
    expect(formatFeedAdminDay('2026-12-22T10:00:00.000Z', 'fr', now)).toBe('22 déc.');
    expect(formatFeedAdminDay('2027-01-05T10:00:00.000Z', 'en', now)).toMatch(/2027/);
  });
});

describe('who deleted a row', () => {
  it('names a moderator, and tells the author and the thread apart', () => {
    expect(
      feedAdminDeleter({ deletedCause: 'moderator', deletedBy: { userId: 'u', name: 'Inès R.' } }),
    ).toEqual({ kind: 'moderator', name: 'Inès R.' });
    expect(feedAdminDeleter({ deletedCause: 'author', deletedBy: null })).toEqual({
      kind: 'author',
    });
    expect(feedAdminDeleter({ deletedCause: 'thread', deletedBy: null })).toEqual({
      kind: 'thread',
    });
    expect(feedAdminDeleter({ deletedCause: null, deletedBy: null })).toBeNull();
  });
});

describe('the discussion around a row', () => {
  const replies = Array.from({ length: 9 }, (_, i) => ({ id: `r${String(i)}` }));

  it('shows two replies on each side of the row, and counts the rest', () => {
    expect(feedAdminAround(replies, 'r4')).toEqual({
      before: 2,
      shown: replies.slice(2, 7),
      after: 2,
    });
    expect(feedAdminAround(replies, 'r0')).toEqual({
      before: 0,
      shown: replies.slice(0, 3),
      after: 6,
    });
    expect(feedAdminAround(replies, 'r8')).toEqual({
      before: 6,
      shown: replies.slice(6),
      after: 0,
    });
  });

  it('shows the first replies for a main post, and nothing more than there is', () => {
    expect(feedAdminAround(replies, 'main')).toEqual({
      before: 0,
      shown: replies.slice(0, 5),
      after: 4,
    });
    expect(feedAdminAround([], 'main')).toEqual({ before: 0, shown: [], after: 0 });
  });
});
