import { describe, expect, it } from 'vitest';

import {
  createFeedSseReader,
  feedLiveRetryDelay,
  mergeFeedFirstPage,
  mergeFeedThread,
} from '../../app/utils/feed-live.ts';
import type { FeedLiveMessage } from '../../app/utils/feed-live.ts';
import { feedByNewest } from '../../app/utils/feed.ts';
import type { FeedPostView } from '../../shared/schemas/feed.ts';

// More of the live updates' pure helpers (app/utils/feed-live.ts) than test/unit/feed-live-utils
// covers: the edges of the Server-Sent Events reader, the boundaries of a reset's merges (the gap,
// the cursor, ties on the date) and a seeded fuzz of the merge's invariants.

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

describe('the Server-Sent Events reader, edges', () => {
  function read(...chunks: string[]) {
    const messages: FeedLiveMessage[] = [];
    const reader = createFeedSseReader((message) => messages.push(message));
    for (const chunk of chunks) reader.push(chunk);
    return messages;
  }

  // DEFECT (low, app/utils/feed-live.ts, `push`): a CR LF line ending split between two chunks is
  // read as a line end (the CR) and then an empty line (the LF), and an empty line closes the
  // message: the fields read so far are thrown away, the `id` first. The site's own server writes
  // plain LF, so only a proxy that rewrites line endings would meet it; the format allows CR LF, and
  // the reader claims to read it.
  it.fails('keeps a message whose CR LF is split between two chunks', () => {
    expect(read('id: 5\r', '\nevent: ping\r\ndata: {}\r\n\r\n')).toEqual([
      { id: '5', event: 'ping', data: '{}' },
    ]);
  });

  it('does not close a message at the LF of a CR LF that arrives alone after a complete line', () => {
    expect(read('event: ping\r\ndata: {}\r', '\n\r\n')).toEqual([{ event: 'ping', data: '{}' }]);
  });

  it('never dispatches a message that has not ended with its blank line', () => {
    expect(read('event: post\ndata: {}\n')).toEqual([]);
    expect(read('event: post\ndata: {}')).toEqual([]);
  });

  it('reads a message byte by byte as it reads it whole', () => {
    const wire = 'id: 7\nevent: counts\ndata: {"items":[]}\n\nevent: ping\ndata: {}\n\n';
    const whole = read(wire);
    expect(whole).toHaveLength(2);
    expect(read(...wire.split(''))).toEqual(whole);
  });

  it('keeps an empty data value, a field with no colon, and an id that is empty', () => {
    expect(read('event: x\ndata:\n\n')).toEqual([{ event: 'x', data: '' }]);
    expect(read('data\n\n')).toEqual([{ event: 'message', data: '' }]);
    expect(read('id:\nevent: x\ndata: 1\n\n')).toEqual([{ id: '', event: 'x', data: '1' }]);
  });

  it('forgets the id and event of one message before the next', () => {
    expect(read('id: 1\nevent: a\ndata: 1\n\ndata: 2\n\n')).toEqual([
      { id: '1', event: 'a', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('keeps colons inside values and ignores unknown fields', () => {
    expect(read('event: post\nfoo: bar\ndata: {"a":"b:c"}\n\n')).toEqual([
      { event: 'post', data: '{"a":"b:c"}' },
    ]);
  });

  it('takes the last of two ids or events in one message', () => {
    expect(read('id: 1\nid: 2\nevent: a\nevent: b\ndata: x\n\n')).toEqual([
      { id: '2', event: 'b', data: 'x' },
    ]);
  });
});

describe('the reconnection delay, edges', () => {
  it('stays within 1 to 30 seconds for any attempt and any random value', () => {
    for (const attempt of [0, 1, 2, 3, 4, 5, 6, 10, 100, 1e6]) {
      for (const random of [0, 0.25, 0.5, 0.999, 1]) {
        const delay = feedLiveRetryDelay(attempt, () => random);
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(30_000);
        expect(Number.isInteger(delay)).toBe(true);
      }
    }
  });

  it('never goes down as the attempts go up, for a given random value', () => {
    for (const random of [0, 0.5, 1]) {
      let last = 0;
      for (let attempt = 0; attempt < 12; attempt++) {
        const delay = feedLiveRetryDelay(attempt, () => random);
        expect(delay).toBeGreaterThanOrEqual(last);
        last = delay;
      }
    }
  });
});

describe('merging a feed’s first page, boundaries', () => {
  it('has no gap when the page reaches inside what is held, and one when it stops short of it', () => {
    const held = (n: number) => ({ pinned: [], posts: [post(n)], next: null });
    const fresh = { pinned: [], posts: [post(9), post(8), post(7)], next: 'c' };
    expect(mergeFeedFirstPage(held(8), fresh).gap).toBeNull();
    expect(texts(mergeFeedFirstPage(held(8), fresh).newer)).toEqual(['Post 9']);
    expect(mergeFeedFirstPage(held(6), fresh).gap).toBe('c');
    expect(texts(mergeFeedFirstPage(held(6), fresh).newer)).toEqual(['Post 9', 'Post 8', 'Post 7']);
  });

  // A page that ends exactly on the newest post held reaches it: no gap.
  it('has no gap when the page ends exactly on the newest post held', () => {
    const merged = mergeFeedFirstPage(
      { pinned: [], posts: [post(7)], next: null },
      { pinned: [], posts: [post(9), post(8), post(7)], next: 'c' },
    );
    expect(merged.gap).toBeNull();
    expect(texts(merged.newer)).toEqual(['Post 9', 'Post 8']);
  });

  it('orders posts of the same second by id, as the site does, when deciding on a gap', () => {
    const at = new Date(Date.UTC(2026, 10, 23, 12, 5)).toISOString();
    const a = post(1, { createdAt: at });
    const b = post(2, { createdAt: at });
    const c = post(3, { createdAt: at });
    // Same date: the larger id sorts first, so the page [c, b] stops above a held [a] (a gap), and
    // goes below a held [c].
    const page = { pinned: [], posts: [c, b], next: 'x' };
    expect(mergeFeedFirstPage({ pinned: [], posts: [a], next: null }, page).gap).toBe('x');
    expect(mergeFeedFirstPage({ pinned: [], posts: [c], next: null }, page).newer).toEqual([]);
    expect(mergeFeedFirstPage({ pinned: [], posts: [c], next: null }, page).gap).toBeNull();
  });

  it('removes a held post deleted within the page’s span and keeps the one beyond it', () => {
    const merged = mergeFeedFirstPage(
      { pinned: [], posts: [post(5), post(4), post(3), post(2)], next: 'held' },
      { pinned: [], posts: [post(5), post(3)], next: 'fresh' },
    );
    expect(texts(merged.posts)).toEqual(['Post 5', 'Post 3', 'Post 2']);
    expect(merged.next).toBe('held');
    expect(merged.gap).toBeNull();
  });

  it('empties a list whose every post was deleted, and leaves nothing as newer', () => {
    const merged = mergeFeedFirstPage(
      { pinned: [], posts: [post(2), post(1)], next: null },
      { pinned: [], posts: [], next: null },
    );
    expect(merged.posts).toEqual([]);
    expect(merged.newer).toEqual([]);
    expect(merged.gap).toBeNull();
    expect(merged.next).toBeNull();
  });

  it('gives the pinned group of the page whatever was held, and no post twice', () => {
    const p1 = post(1, { feed: 'announcements', pinnedAt: '2026-11-23T10:00:00.000Z' });
    const merged = mergeFeedFirstPage(
      { pinned: [p1], posts: [post(5)], next: null },
      {
        pinned: [post(5, { pinnedAt: '2026-11-23T11:00:00.000Z' })],
        posts: [post(6), post(1)],
        next: null,
      },
    );
    expect(texts(merged.pinned)).toEqual(['Post 5']);
    expect(texts(merged.posts)).toEqual(['Post 1']);
    expect(texts(merged.newer)).toEqual(['Post 6']);
  });

  it('does not report a gap, and keeps the page’s cursor, when nothing is held', () => {
    const merged = mergeFeedFirstPage(
      { pinned: [], posts: [], next: null },
      { pinned: [], posts: [post(3), post(2)], next: 'c' },
    );
    expect(merged.gap).toBeNull();
    expect(merged.next).toBe('c');
  });

  it('does not change the held posts it was given', () => {
    const held = { pinned: [post(9)], posts: [post(5), post(4)], next: 'h' };
    const copy = structuredClone(held);
    mergeFeedFirstPage(held, { pinned: [], posts: [post(8), post(5, { likes: 3 })], next: 'f' });
    expect(held).toEqual(copy);
  });
});

describe('merging a thread, boundaries', () => {
  const reply = (n: number, over: Partial<FeedPostView> = {}) =>
    post(n, { threadId: 'main', text: `Reply ${String(n)}`, ...over });

  it('empties a thread whose replies were all deleted', () => {
    expect(
      mergeFeedThread({ replies: [reply(1), reply(2)], next: null }, { replies: [], next: null }),
    ).toEqual({ replies: [], next: null });
  });

  it('keeps a reply the stream added beyond the page, and the page’s new ones in order', () => {
    const merged = mergeFeedThread(
      { replies: [reply(1), reply(2), reply(4)], next: null },
      { replies: [reply(1), reply(2), reply(3)], next: 'x' },
    );
    expect(texts(merged.replies)).toEqual(['Reply 1', 'Reply 2', 'Reply 3', 'Reply 4']);
    expect(merged.next).toBeNull();
  });

  it('removes a held reply inside the page’s span that the page no longer has', () => {
    const merged = mergeFeedThread(
      { replies: [reply(1), reply(2), reply(3)], next: 'h' },
      { replies: [reply(1), reply(3), reply(4)], next: 'f' },
    );
    expect(texts(merged.replies)).toEqual(['Reply 1', 'Reply 3', 'Reply 4']);
    expect(merged.next).toBe('f');
  });

  // Held replies that are exactly the first page take the page's cursor.
  it('takes the page’s cursor when the replies held are exactly the page', () => {
    const merged = mergeFeedThread(
      { replies: [reply(1), reply(2), reply(3)], next: null },
      { replies: [reply(1), reply(2), reply(3)], next: 'more' },
    );
    expect(merged.next).toBe('more');
  });

  it('does not change what it was given', () => {
    const held = { replies: [reply(1), reply(2)], next: 'h' };
    const copy = structuredClone(held);
    mergeFeedThread(held, { replies: [reply(1, { likes: 2 })], next: 'f' });
    expect(held).toEqual(copy);
  });
});

// A small seeded generator, so a failure can be replayed.
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

/** Runs the merge on 3000 random feeds, checking what must hold whatever the feeds are. */
function fuzz(extra: (found: { gapOnHeldPost: string | null }) => void) {
  const found = { gapOnHeldPost: null as string | null };
  for (let seed = 1; seed <= 3000; seed++) {
    const random = rng(seed);
    const universe = Array.from({ length: 14 }, (_, n) => post(n + 1));
    // What the site holds now: some posts live, up to three pinned.
    const live = universe.filter(() => random() < 0.7);
    const pinnedNow = live.filter(() => random() < 0.15).slice(0, 3);
    const pinnedIds = new Set(pinnedNow.map((one) => one.id));
    const listNow = live.filter((one) => !pinnedIds.has(one.id)).sort(feedByNewest);
    const size = 1 + Math.floor(random() * 6);
    const freshPosts = listNow.slice(0, size);
    const fresh = {
      pinned: pinnedNow.map((one) => ({ ...one, pinnedAt: '2026-11-23T11:00:00.000Z' })),
      posts: freshPosts,
      next: listNow.length > size ? `after-${freshPosts.at(-1)!.id}` : null,
    };
    // What the page held from before: an older view of some of them, loaded in pages from the top.
    const before = universe.filter(() => random() < 0.6);
    const heldPinned = before.filter(() => random() < 0.15).slice(0, 3);
    const heldPinnedIds = new Set(heldPinned.map((one) => one.id));
    const heldList = before.filter((one) => !heldPinnedIds.has(one.id)).sort(feedByNewest);
    const held = {
      pinned: heldPinned.map((one) => ({ ...one, pinnedAt: '2026-11-23T10:00:00.000Z' })),
      posts: heldList.slice(0, Math.floor(random() * (heldList.length + 1))),
      next: random() < 0.5 ? 'held-next' : null,
    };

    const merged = mergeFeedFirstPage(held, fresh);
    const label = `seed ${String(seed)}`;
    const ids = [...merged.pinned, ...merged.posts, ...merged.newer].map((one) => one.id);
    expect(new Set(ids).size, `${label}: a post twice`).toBe(ids.length);
    expect(
      merged.posts.map((one) => one.id),
      `${label}: order`,
    ).toEqual([...merged.posts].sort(feedByNewest).map((one) => one.id));
    expect(
      merged.pinned.map((one) => one.id),
      label,
    ).toEqual(fresh.pinned.map((one) => one.id));
    // Every post the page shows is shown, as a post of the list or as a new one.
    const shown = new Set([...merged.posts, ...merged.newer].map((one) => one.id));
    for (const one of fresh.posts) expect(shown.has(one.id), `${label}: lost ${one.id}`).toBe(true);
    // No post that is deleted, within what the page reaches, survives.
    const liveIds = new Set(live.map((one) => one.id));
    const oldest = fresh.posts.at(-1);
    for (const one of merged.posts) {
      const within = fresh.next === null || !oldest || feedByNewest(one, oldest) <= 0;
      if (within) expect(liveIds.has(one.id), `${label}: deleted ${one.id} kept`).toBe(true);
    }
    // Posts that are new are newer than everything held in the list.
    const newest = held.posts.reduce<FeedPostView | null>(
      (top, one) => (top === null || feedByNewest(one, top) < 0 ? one : top),
      null,
    );
    for (const one of merged.newer) {
      if (newest) expect(feedByNewest(one, newest), `${label}: newer`).toBeLessThan(0);
    }
    // A gap is reported only with a cursor to go on from, and only when the page really stops
    // short of the newest held post: not when it contains it.
    if (merged.gap !== null) {
      expect(merged.gap).toBe(fresh.next);
      if (newest && fresh.posts.some((one) => one.id === newest.id)) {
        found.gapOnHeldPost ??= label;
      }
    }
  }
  extra(found);
}

describe('a reset’s merge of a feed, on random feeds', () => {
  it('never shows a post twice, keeps the list newest first, and shows every post of the page', () => {
    fuzz(() => {});
  });

  // Found by the fuzz at seed 2 before feedByNewest compared a post with itself as equal.
  it('reports a gap only when the page stops short of the newest post held', () => {
    fuzz((found) => {
      expect(found.gapOnHeldPost).toBeNull();
    });
  });
});
