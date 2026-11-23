import { feedByNewest } from './feed.ts';
import type { FeedPage, FeedPostView, FeedThread } from '../../shared/schemas/feed.ts';

// Pure helpers of the Feed page's live updates (docs/feed.md, "Live updates in the browser"): the
// Server-Sent Events reader, the reconnection delay, and the merges a `reset` makes.

export interface FeedLiveMessage {
  id?: string;
  event: string;
  data: string;
}

/**
 * A Server-Sent Events reader: feed it the text as it arrives, it calls `onMessage` once per
 * complete event. Comments and `retry` lines are skipped; an event without `event:` is `message`.
 */
export function createFeedSseReader(onMessage: (message: FeedLiveMessage) => void) {
  let buffer = '';
  let id: string | undefined;
  let event = '';
  let data: string[] = [];

  function line(text: string) {
    if (text === '') {
      if (data.length || event) {
        onMessage({
          ...(id === undefined ? {} : { id }),
          event: event || 'message',
          data: data.join('\n'),
        });
      }
      id = undefined;
      event = '';
      data = [];
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      let end: number;
      while ((end = buffer.search(/\r\n|\r|\n/)) >= 0) {
        const newline = buffer.startsWith('\r\n', end) ? 2 : 1;
        line(buffer.slice(0, end));
        buffer = buffer.slice(end + newline);
      }
    },
  };
}

/**
 * The wait before reconnection number `attempt` (0 first): 1, 2, 4, 8, 16, then 30 seconds, each
 * shaken by up to a fifth so that tabs dropped together don't all come back at once.
 */
export function feedLiveRetryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  const shaken = base * (0.8 + 0.4 * random());
  return Math.round(Math.min(30_000, Math.max(1000, shaken)));
}

/** What a feed's first page, read again after a `reset`, changes on the page. */
export interface FeedTimelineMerge {
  pinned: FeedPostView[];
  /** The posts held, updated, without those deleted meanwhile. */
  posts: FeedPostView[];
  /** The cursor for "Load more": the held one when the list went beyond the page. */
  next: string | null;
  /** Posts newer than everything held: shown as live posts are. */
  newer: FeedPostView[];
  /**
   * When the page doesn't reach what is held (more than a page was posted meanwhile): the cursor
   * the list starts again from once the newer posts are let in, the held posts then dropped.
   */
  gap: string | null;
}

/**
 * Merges a feed's first page, read again, into what the page holds: posts newer than the newest
 * held come out as `newer`; held posts the page should show but doesn't (within its span) were
 * deleted and leave; the others take their fresh view. Posts beyond the page's span stay.
 */
export function mergeFeedFirstPage(
  held: { pinned: FeedPostView[]; posts: FeedPostView[]; next: string | null },
  fresh: Pick<FeedPage, 'pinned' | 'posts' | 'next'>,
): FeedTimelineMerge {
  const freshById = new Map(fresh.posts.map((post) => [post.id, post]));
  const heldIds = new Set([...held.pinned, ...held.posts].map((post) => post.id));
  const newestHeld = held.posts.reduce<FeedPostView | null>(
    (newest, post) => (newest === null || feedByNewest(post, newest) < 0 ? post : newest),
    null,
  );
  const oldestFresh = fresh.posts.at(-1);
  const inSpan = (post: FeedPostView) =>
    fresh.next === null || !oldestFresh || feedByNewest(post, oldestFresh) <= 0;
  const pinnedIds = new Set(fresh.pinned.map((post) => post.id));
  const posts = held.posts
    .filter((post) => !pinnedIds.has(post.id) && (freshById.has(post.id) || !inSpan(post)))
    .map((post) => freshById.get(post.id) ?? post);
  // Posts unpinned meanwhile, held in the pinned group, go back to the list when the page has them.
  for (const post of held.pinned) {
    const back = freshById.get(post.id);
    if (back && !pinnedIds.has(post.id)) posts.push(back);
  }
  const newer = fresh.posts.filter(
    (post) => !heldIds.has(post.id) && (newestHeld === null || feedByNewest(post, newestHeld) < 0),
  );
  // Older posts the page has but the page didn't hold (unpinned elsewhere): in their place.
  for (const post of fresh.posts) {
    if (!heldIds.has(post.id) && !newer.includes(post)) posts.push(post);
  }
  // The page reaches what is held when its oldest post is no newer than the newest held.
  const reaches =
    fresh.next === null ||
    !oldestFresh ||
    newestHeld === null ||
    feedByNewest(oldestFresh, newestHeld) >= 0;
  const beyond = held.posts.some((post) => !inSpan(post));
  return {
    pinned: fresh.pinned,
    posts: [...new Map(posts.map((post) => [post.id, post])).values()].sort(feedByNewest),
    next: beyond ? held.next : fresh.next,
    newer,
    gap: reaches ? null : fresh.next,
  };
}

/**
 * Merges a thread's first page, read again after a `reset`, into the replies held: replies the
 * page should show but doesn't (within its span) were deleted and leave, new ones join in order,
 * the others take their fresh view. Replies beyond the span (loaded with "Load more") stay.
 */
export function mergeFeedThread(
  held: { replies: FeedPostView[]; next: string | null },
  fresh: Pick<FeedThread, 'replies' | 'next'>,
): { replies: FeedPostView[]; next: string | null } {
  const freshById = new Map(fresh.replies.map((reply) => [reply.id, reply]));
  const last = fresh.replies.at(-1);
  const inSpan = (reply: FeedPostView) =>
    fresh.next === null || !last || feedByNewest(reply, last) >= 0;
  const kept = held.replies
    .filter((reply) => freshById.has(reply.id) || !inSpan(reply))
    .map((reply) => freshById.get(reply.id) ?? reply);
  const heldIds = new Set(held.replies.map((reply) => reply.id));
  const replies = [...kept, ...fresh.replies.filter((reply) => !heldIds.has(reply.id))].sort(
    (a, b) => -feedByNewest(a, b),
  );
  const beyond = held.replies.some((reply) => !inSpan(reply));
  return { replies, next: beyond ? held.next : fresh.next };
}
