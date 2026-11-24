import { describe, expect, it } from 'vitest';

import {
  createFeedSseReader,
  feedLiveLongDelay,
  feedLiveRefusal,
  feedLiveRetryDelay,
  mergeFeedFirstPage,
  mergeFeedThread,
} from '../../app/utils/feed-live.ts';
import type { FeedLiveMessage } from '../../app/utils/feed-live.ts';
import type { FeedPostView } from '../../shared/schemas/feed.ts';

// The live updates' pure helpers (app/utils/feed-live.ts): the Server-Sent Events reader, the
// reconnection delay, and the merges a `reset` makes of a feed's first page and of a thread.

function post(n: number, over: Partial<FeedPostView> = {}): FeedPostView {
  return {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    feed: 'global',
    threadId: null,
    replyTo: null,
    text: `Post ${String(n)}`,
    // A higher number is newer.
    createdAt: new Date(Date.UTC(2026, 10, 23, 12, n)).toISOString(),
    anonymous: false,
    author: null,
    likes: 0,
    replies: 0,
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

const texts = (posts: FeedPostView[]) => posts.map((one) => one.text);

describe('the Server-Sent Events reader', () => {
  function read(...chunks: string[]) {
    const messages: FeedLiveMessage[] = [];
    const reader = createFeedSseReader((message) => messages.push(message));
    for (const chunk of chunks) reader.push(chunk);
    return messages;
  }

  it('reads id, event and data, one message per blank line', () => {
    expect(read('id: 12\nevent: post\ndata: {"id":"a"}\n\nevent: ping\ndata: {}\n\n')).toEqual([
      { id: '12', event: 'post', data: '{"id":"a"}' },
      { event: 'ping', data: '{}' },
    ]);
  });

  it('waits for the end of a message split across chunks, and any line ending', () => {
    expect(read('id: 1', '3\r\nevent: cou', 'nts\r\ndata: {}\r', '\n\r\n')).toEqual([
      { id: '13', event: 'counts', data: '{}' },
    ]);
    expect(read('data: a\r\rdata: b\n')).toEqual([{ event: 'message', data: 'a' }]);
    // A CR that ends a chunk waits for the next one, which may bring its LF.
    expect(read('data: c\r', '\r')).toEqual([]);
    expect(read('data: c\r', '\r', 'x')).toEqual([{ event: 'message', data: 'c' }]);
  });

  it('joins data lines, keeps a value without its leading space only, skips comments', () => {
    expect(read(': keep-alive\n', 'data:x\ndata:  y\nretry: 3000\n\n')).toEqual([
      { event: 'message', data: 'x\n y' },
    ]);
  });

  it('dispatches nothing for an empty block', () => {
    expect(read('\n\n\n')).toEqual([]);
  });
});

describe('the reconnection delay', () => {
  it('spreads the first retry over a whole second, then doubles up to 30, each from half to all', () => {
    const top = () => 1;
    expect([0, 1, 2, 3, 4, 5, 6, 50].map((n) => feedLiveRetryDelay(n, top))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
    // Full jitter on the first: tabs dropped together don't come back at one moment.
    expect([0, 0.25, 0.5, 0.75].map((r) => feedLiveRetryDelay(0, () => r))).toEqual([
      100, 250, 500, 750,
    ]);
    expect(feedLiveRetryDelay(1, () => 0)).toBe(1000);
    expect(feedLiveRetryDelay(9, () => 0)).toBe(15_000);
    expect(feedLiveRetryDelay(-3, () => 0.5)).toBe(500);
  });
});

describe('a refusal of the stream request', () => {
  it('stops only on the site’s own answers: signed out, 403, and 503 disabled', () => {
    const body = (problem: string) => ({ statusCode: 0, data: { problem } });
    expect(feedLiveRefusal(401, null)).toBe('stop');
    expect(feedLiveRefusal(403, 'Forbidden')).toBe('stop');
    expect(feedLiveRefusal(503, body('disabled'))).toBe('stop');
    expect(feedLiveRefusal(429, body('tooManyStreams'))).toBe('later');
    // A proxy's answer during a deploy, the per-IP rule, a server error: try again.
    expect(feedLiveRefusal(503, null)).toBe('retry');
    expect(feedLiveRefusal(503, '<html>Bad gateway</html>')).toBe('retry');
    expect(feedLiveRefusal(503, body('notFound'))).toBe('retry');
    expect(feedLiveRefusal(429, body('rateLimited'))).toBe('retry');
    expect(feedLiveRefusal(429, null)).toBe('retry');
    expect(feedLiveRefusal(502, null)).toBe('retry');
    expect(feedLiveRefusal(500, { data: null })).toBe('retry');
  });

  it('waits 1, 2, 4, then 10 minutes after too many streams, each from half to all', () => {
    expect([0, 1, 2, 3, 4, 20].map((n) => feedLiveLongDelay(n, () => 1))).toEqual([
      60_000, 120_000, 240_000, 480_000, 600_000, 600_000,
    ]);
    expect(feedLiveLongDelay(0, () => 0)).toBe(30_000);
  });
});

describe('merging a feed’s first page after a reset', () => {
  it('updates held posts, drops the ones deleted meanwhile, and gives the newer ones apart', () => {
    const held = { pinned: [], posts: [post(5), post(4), post(3)], next: null };
    const fresh = {
      pinned: [],
      posts: [post(7), post(6), post(5, { likes: 9 }), post(3)],
      next: null,
    };
    const merged = mergeFeedFirstPage(held, fresh);
    expect(texts(merged.newer)).toEqual(['Post 7', 'Post 6']);
    expect(texts(merged.posts)).toEqual(['Post 5', 'Post 3']);
    expect(merged.posts[0]!.likes).toBe(9);
    expect(merged.gap).toBeNull();
    expect(merged.next).toBeNull();
  });

  it('keeps the posts "Load more" brought beyond the page, and their cursor', () => {
    const held = { pinned: [], posts: [post(5), post(4), post(2), post(1)], next: 'held-cursor' };
    const fresh = { pinned: [], posts: [post(5), post(4)], next: 'fresh-cursor' };
    const merged = mergeFeedFirstPage(held, fresh);
    expect(texts(merged.posts)).toEqual(['Post 5', 'Post 4', 'Post 2', 'Post 1']);
    expect(merged.next).toBe('held-cursor');
  });

  it('takes the page’s cursor when nothing held goes beyond it', () => {
    const held = { pinned: [], posts: [post(5)], next: null };
    const fresh = { pinned: [], posts: [post(5), post(4)], next: 'fresh-cursor' };
    expect(mergeFeedFirstPage(held, fresh).next).toBe('fresh-cursor');
  });

  it('says there is a gap when more than a page was posted meanwhile', () => {
    const held = { pinned: [], posts: [post(2), post(1)], next: null };
    const fresh = { pinned: [], posts: [post(9), post(8)], next: 'after-8' };
    const merged = mergeFeedFirstPage(held, fresh);
    expect(texts(merged.newer)).toEqual(['Post 9', 'Post 8']);
    expect(merged.gap).toBe('after-8');
    expect(texts(merged.posts)).toEqual(['Post 2', 'Post 1']);
  });

  it('follows the pinned group: pinned posts leave the list, unpinned ones come back', () => {
    const was = post(3, { feed: 'announcements', pinnedAt: '2026-11-23T13:00:00.000Z' });
    const held = { pinned: [was], posts: [post(5), post(4)], next: null };
    const nowPinned = post(4, { pinnedAt: '2026-11-23T14:00:00.000Z' });
    const fresh = { pinned: [nowPinned], posts: [post(5), post(3)], next: null };
    const merged = mergeFeedFirstPage(held, fresh);
    expect(texts(merged.pinned)).toEqual(['Post 4']);
    expect(texts(merged.posts)).toEqual(['Post 5', 'Post 3']);
    expect(merged.posts[1]!.pinnedAt).toBeNull();
    expect(merged.newer).toEqual([]);
  });

  it('gives everything as newer to an empty list', () => {
    const merged = mergeFeedFirstPage(
      { pinned: [], posts: [], next: null },
      { pinned: [], posts: [post(2), post(1)], next: 'c' },
    );
    expect(texts(merged.newer)).toEqual(['Post 2', 'Post 1']);
    expect(merged.gap).toBeNull();
  });
});

describe('merging a thread after a reset', () => {
  const reply = (n: number, over: Partial<FeedPostView> = {}) =>
    post(n, { threadId: 'main', text: `Reply ${String(n)}`, ...over });

  it('drops replies deleted meanwhile, adds new ones in order, updates the rest', () => {
    const merged = mergeFeedThread(
      { replies: [reply(1), reply(2), reply(3)], next: null },
      { replies: [reply(1, { likes: 4 }), reply(3), reply(4)], next: null },
    );
    expect(texts(merged.replies)).toEqual(['Reply 1', 'Reply 3', 'Reply 4']);
    expect(merged.replies[0]!.likes).toBe(4);
    expect(merged.next).toBeNull();
  });

  it('keeps the replies loaded beyond the first page, and their cursor', () => {
    const merged = mergeFeedThread(
      { replies: [reply(1), reply(2), reply(3), reply(4)], next: 'held' },
      { replies: [reply(1), reply(2)], next: 'fresh' },
    );
    expect(texts(merged.replies)).toEqual(['Reply 1', 'Reply 2', 'Reply 3', 'Reply 4']);
    expect(merged.next).toBe('held');
  });

  it('takes the fresh cursor when nothing held goes beyond the page', () => {
    const merged = mergeFeedThread(
      { replies: [reply(1)], next: null },
      { replies: [reply(1), reply(2)], next: 'fresh' },
    );
    expect(merged.next).toBe('fresh');
  });
});
