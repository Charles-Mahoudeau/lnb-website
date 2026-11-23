import type { FeedAuthor, FeedName, FeedPage, FeedPostView } from '../../shared/schemas/feed.ts';

// Small pure helpers of the Feed page (docs/feed.md, "The Feed page"): names, times, the pinned
// group and the composer's idempotency key. Dates come from Intl in Europe/Paris.

const TIME_ZONE = 'Europe/Paris';

/** The name a post prints: the real name when shown, otherwise the username. */
export function feedDisplayName(author: Pick<FeedAuthor, 'realName' | 'username'>): string {
  return author.realName ?? author.username;
}

/** `@username`, only beside a real name, so the same word is never printed twice. */
export function feedHandle(author: Pick<FeedAuthor, 'realName' | 'username'>): string | null {
  return author.realName === null ? null : `@${author.username}`;
}

/**
 * A post's age, short: "now", "12 min", "3 h", "2 d" (the locale's units), then the day ("23
 * Nov") after a week, and the year once it is another year.
 */
export function formatFeedAge(iso: string, locale: string, now = Date.now()): string | null {
  const then = Date.parse(iso);
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const unit = (value: number, name: 'minute' | 'hour' | 'day') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(
      value,
    );
  if (seconds < 60) return null;
  if (seconds < 3600) return unit(Math.floor(seconds / 60), 'minute');
  if (seconds < 86_400) return unit(Math.floor(seconds / 3600), 'hour');
  if (seconds < 7 * 86_400) return unit(Math.floor(seconds / 86_400), 'day');
  const sameYear =
    new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric' }).format(then) ===
    new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric' }).format(now);
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(then);
}

/** The full date and time of a post: "23 Nov 2026, 14:20". */
export function formatFeedDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** The `createdAt` of the newest post a page shows, pinned ones included, for `POST /seen`. */
export function newestFeedCreatedAt(page: Pick<FeedPage, 'pinned' | 'posts'>): string | null {
  let newest: string | null = null;
  for (const post of [...page.pinned, ...page.posts]) {
    if (newest === null || Date.parse(post.createdAt) > Date.parse(newest)) newest = post.createdAt;
  }
  return newest;
}

/** Posts newest first, as a feed lists them (keyset order: `createdAt`, then `id`). 0 for one post. */
export function feedByNewest(a: FeedPostView, b: FeedPostView): number {
  return (
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1)
  );
}

/**
 * The page after a pin or unpin answered the pinned group: posts pinned now leave the list and
 * join the group in its order, posts unpinned go back to the list in their place. Null when the
 * group names a post the page doesn't hold (pinned elsewhere since): reload it then.
 */
export function applyFeedPins(
  page: { pinned: FeedPostView[]; posts: FeedPostView[] },
  group: { id: string; pinnedAt: string }[],
): { pinned: FeedPostView[]; posts: FeedPostView[] } | null {
  const known = new Map([...page.pinned, ...page.posts].map((post) => [post.id, post]));
  const pinnedIds = new Set(group.map((pin) => pin.id));
  const pinned: FeedPostView[] = [];
  for (const pin of group) {
    const post = known.get(pin.id);
    if (!post) return null;
    pinned.push({ ...post, pinnedAt: pin.pinnedAt });
  }
  const posts = [
    ...page.posts.filter((post) => !pinnedIds.has(post.id)),
    ...page.pinned
      .filter((post) => !pinnedIds.has(post.id))
      .map((post) => ({ ...post, pinnedAt: null })),
  ].sort(feedByNewest);
  return { pinned, posts };
}

/**
 * The page with a pinned group read again from the site (its views fresh): posts pinned now leave
 * the list, posts no longer pinned go back to it in their place, and the rest of the list stays.
 */
export function mergeFeedPinned(
  page: { pinned: FeedPostView[]; posts: FeedPostView[] },
  fresh: FeedPostView[],
): { pinned: FeedPostView[]; posts: FeedPostView[] } {
  const pinnedIds = new Set(fresh.map((post) => post.id));
  const posts = [
    ...page.posts.filter((post) => !pinnedIds.has(post.id)),
    ...page.pinned
      .filter((post) => !pinnedIds.has(post.id))
      .map((post) => ({ ...post, pinnedAt: null })),
  ].sort(feedByNewest);
  return { pinned: fresh, posts };
}

function appendUnseen(current: FeedPostView[], more: FeedPostView[]): FeedPostView[] {
  const seen = new Set(current.map((post) => post.id));
  return [...current, ...more.filter((post) => !seen.has(post.id))];
}

/**
 * Appends a page of older posts to a feed, leaving out any the page already shows, and keeps the
 * list newest first: a post unpinned from beyond the loaded range sits at the end of the list
 * until Load more brings the newer posts that go before it.
 */
export function appendFeedPosts(current: FeedPostView[], more: FeedPostView[]): FeedPostView[] {
  return appendUnseen(current, more).sort(feedByNewest);
}

/** Appends a page of newer replies to a thread (oldest first), leaving out any already shown. */
export function appendFeedReplies(current: FeedPostView[], more: FeedPostView[]): FeedPostView[] {
  return appendUnseen(current, more);
}

/** What a draft would send. The same request must carry the same key, and only it. */
export interface FeedDraftRequest {
  target: string;
  text: string;
  anonymous: boolean;
}

/**
 * The idempotency key for sending a draft: the key of the last attempt when the request is the
 * same (a retry after a failure, which then can't post twice), a new one when anything changed.
 */
export function feedDraftKey(
  last: { key: string; request: FeedDraftRequest } | null,
  request: FeedDraftRequest,
  newKey: () => string = () => crypto.randomUUID(),
): { key: string; request: FeedDraftRequest } {
  const same =
    last !== null &&
    last.request.target === request.target &&
    last.request.text === request.text &&
    last.request.anonymous === request.anonymous;
  return same ? last : { key: newKey(), request };
}

export const FEED_TABS: readonly FeedName[] = ['announcements', 'global'];

/** The tab from the query: Announcements unless `?feed=global`. */
export function feedFromQuery(value: unknown): FeedName {
  return value === 'global' ? 'global' : 'announcements';
}
