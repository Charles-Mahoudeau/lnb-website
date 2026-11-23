import type { FeedAdminPost, FeedName } from '../../shared/schemas/feed.ts';

// The Feed tab of Moderation (docs/feed.md, "Moderation"): its state in the URL, the API query it
// reads, and the dates and lines its rows show. Pure, so plain unit tests load it.

export const FEED_ADMIN_CHIPS = [
  'announcements',
  'global',
  'replies',
  'anonymous',
  'deleted',
] as const;
export type FeedAdminChip = (typeof FEED_ADMIN_CHIPS)[number];

const FEEDS: readonly FeedName[] = ['announcements', 'global'];
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** What the URL holds: the filters, the page (a cursor) and the row open in the drawer. */
export interface FeedAdminState {
  q: string;
  chips: FeedAdminChip[];
  user: string | null;
  cursor: string | null;
  post: string | null;
}

/** The table's API query: every filter the API takes, nothing it would refuse. */
export interface FeedAdminApiQuery {
  q?: string;
  feeds?: string;
  replies?: 'true';
  anonymous?: 'true';
  deleted?: 'true';
  user?: string;
  cursor?: string;
}

function one(value: unknown): string {
  const first = Array.isArray(value) ? (value[0] as unknown) : value;
  return typeof first === 'string' ? first : '';
}

/** The state from the route's query, ignoring what isn't one of ours. */
export function feedAdminStateFromQuery(query: Record<string, unknown>): FeedAdminState {
  const feeds = one(query.feeds).split(',');
  const chips = FEED_ADMIN_CHIPS.filter((chip) =>
    chip === 'announcements' || chip === 'global'
      ? feeds.includes(chip)
      : one(query[chip]) === 'true',
  );
  const user = one(query.user).trim();
  const cursor = one(query.cursor);
  const post = one(query.post);
  return {
    q: one(query.q).slice(0, 100),
    chips,
    user: user && user.length <= 100 ? user : null,
    cursor: cursor && cursor.length <= 128 ? cursor : null,
    post: UUID.test(post) ? post.toLowerCase() : null,
  };
}

/** The route's query for a state: only what differs from the default, so a plain URL is clean. */
export function feedAdminUrlQuery(state: FeedAdminState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.q.trim()) query.q = state.q.trim();
  const feeds = FEEDS.filter((feed) => state.chips.includes(feed));
  if (feeds.length) query.feeds = feeds.join(',');
  for (const chip of ['replies', 'anonymous', 'deleted'] as const) {
    if (state.chips.includes(chip)) query[chip] = 'true';
  }
  if (state.user) query.user = state.user;
  if (state.cursor) query.cursor = state.cursor;
  if (state.post) query.post = state.post;
  return query;
}

/** The API query for a state. A search shorter than 2 characters isn't sent (the API needs 2). */
export function feedAdminApiQuery(state: FeedAdminState): FeedAdminApiQuery {
  const query: FeedAdminApiQuery = {};
  const q = state.q.trim();
  if (q.length >= 2) query.q = q;
  const feeds = FEEDS.filter((feed) => state.chips.includes(feed));
  if (feeds.length) query.feeds = feeds.join(',');
  if (state.chips.includes('replies')) query.replies = 'true';
  if (state.chips.includes('anonymous')) query.anonymous = 'true';
  if (state.chips.includes('deleted')) query.deleted = 'true';
  if (state.user) query.user = state.user;
  if (state.cursor) query.cursor = state.cursor;
  return query;
}

const PARIS = 'Europe/Paris';

function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, dateStyle: 'short' }).format(date);
}

function parisYear(date: Date): string {
  return new Intl.DateTimeFormat('en', { timeZone: PARIS, year: 'numeric' }).format(date);
}

/**
 * A row's date in the table, in Paris time: the time alone today, the day and the time this year,
 * and the full date before.
 */
export function formatFeedAdminDate(iso: string, locale: string, now = Date.now()): string {
  const date = new Date(iso);
  const today = new Date(now);
  if (parisDay(date) === parisDay(today)) {
    return new Intl.DateTimeFormat(locale, { timeZone: PARIS, timeStyle: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: PARIS,
    day: 'numeric',
    month: 'short',
    ...(parisYear(date) === parisYear(today) ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** A day, in Paris time, with the year only when it isn't this year's: the purge date. */
export function formatFeedAdminDay(iso: string, locale: string, now = Date.now()): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    timeZone: PARIS,
    day: 'numeric',
    month: 'short',
    ...(parisYear(date) === parisYear(new Date(now)) ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Who deleted a row, for its State line: a moderator by name, its author, or its thread. */
export function feedAdminDeleter(
  row: Pick<FeedAdminPost, 'deletedCause' | 'deletedBy'>,
): { kind: 'moderator'; name: string } | { kind: 'author' } | { kind: 'thread' } | null {
  if (row.deletedCause === 'moderator') {
    return { kind: 'moderator', name: row.deletedBy?.name ?? '' };
  }
  if (row.deletedCause === 'author') return { kind: 'author' };
  if (row.deletedCause === 'thread') return { kind: 'thread' };
  return null;
}

/**
 * The part of a thread the drawer shows around a row: the replies just before and after it, and
 * how many it leaves out on each side. A main post shows its first replies.
 */
export function feedAdminAround<T extends { id: string }>(
  replies: readonly T[],
  rowId: string,
  reach = 2,
): { before: number; shown: T[]; after: number } {
  const at = replies.findIndex((reply) => reply.id === rowId);
  const from = at < 0 ? 0 : Math.max(0, at - reach);
  const to =
    at < 0 ? Math.min(replies.length, reach * 2 + 1) : Math.min(replies.length, at + reach + 1);
  return { before: from, shown: replies.slice(from, to), after: replies.length - to };
}
