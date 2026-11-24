import { createHash } from 'node:crypto';

import type { FeedName, FeedRights } from '../../../shared/schemas/feed.ts';
import { cleanFeedText } from '../../../shared/utils/feed-text.ts';
import { isFeedAnnouncer, isFeedModerator } from '../../../shared/utils/roles.ts';
import { shortName } from '../warden/rules.ts';

// Feed's pure rules (docs/feed.md): rights, fingerprints, cursors and names. No database or Nuxt
// imports, so plain unit tests can load them.

/** A feed page: 20 posts by default, 50 at most. */
export const PAGE_DEFAULT = 20;
/** A thread page: 50 replies by default and at most. */
export const THREAD_DEFAULT = 50;
/** Pinned announcements at most. */
export const PIN_LIMIT = 3;
/** Deleted posts and waiting notifications are kept this long. */
export const KEEP_DAYS = 30;
export const DAY_MS = 86_400_000;
/** Notifications per `GET /notifications`. */
export const NOTIFICATIONS_PER_CALL = 100;
/** An admin table page. */
export const ADMIN_PAGE = 50;
/** `realName` is cut to this many code points, between graphemes. */
export const REAL_NAME_MAX = 64;

export const NO_RIGHTS: FeedRights = { write: false, announce: false, moderate: false };

/**
 * What a person may do (docs/feed.md, Rights). Writing needs a linked Minecraft account and no
 * ban; announcing needs writing and the role; moderating needs the role and no ban.
 */
export function rightsOf(person: {
  linked: boolean;
  banned: boolean;
  role: string | null;
}): FeedRights {
  const write = person.linked && !person.banned;
  return {
    write,
    announce: write && isFeedAnnouncer(person.role),
    moderate: !person.banned && isFeedModerator(person.role),
  };
}

/** Who sends a creation: a player through the Minecraft server, or a person in the browser. */
export type FeedRequester =
  { source: 'server'; player: string } | { source: 'site'; userId: string };

/** What a creation targets: a feed, or a thread and the reply it answers. */
export type FeedTarget =
  { kind: 'post'; feed: FeedName } | { kind: 'reply'; threadId: string; replyTo: string | null };

/**
 * The SHA-256 of a creation request, as the quests' `hashRequest`: the same key with any other
 * requester, target, cleaned text or anonymous flag is another request.
 */
export function fingerprint(
  requester: FeedRequester,
  target: FeedTarget,
  text: string,
  anonymous: boolean,
): string {
  const canonical = {
    requester:
      requester.source === 'server'
        ? { source: 'server', player: requester.player.toLowerCase() }
        : { source: 'site', userId: requester.userId },
    target:
      target.kind === 'post'
        ? { kind: 'post', feed: target.feed }
        : {
            kind: 'reply',
            threadId: target.threadId.toLowerCase(),
            replyTo: target.replyTo?.toLowerCase() ?? null,
          },
    text: cleanFeedText(text),
    anonymous,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export interface FeedCursor {
  at: Date;
  id: string;
}

/**
 * The latest time a cursor may name: the end of the year 9999. A JavaScript Date holds more (up to
 * the year 275760), but PostgreSQL refuses a timestamp past 9999 written as `+YYYYYY-...`, which
 * would turn a forged cursor into a 500.
 */
const MAX_CURSOR_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** A keyset cursor on `(createdAt, id)`: opaque, under 128 characters. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.getTime(), id])).toString('base64url');
}

/** The cursor's position, or null when it isn't one of ours. */
export function decodeCursor(cursor: string): FeedCursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      Number.isSafeInteger(value[0]) &&
      (value[0] as number) >= 0 &&
      // Past it the query would fail with a 500.
      (value[0] as number) <= MAX_CURSOR_MS &&
      typeof value[1] === 'string' &&
      UUID.test(value[1])
    ) {
      return { at: new Date(value[0] as number), id: value[1] };
    }
  } catch {
    // Falls through.
  }
  return null;
}

/** The text cut to `max` code points, between graphemes. */
export function cutCodePoints(text: string, max: number): string {
  let out = '';
  let count = 0;
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    const size = Array.from(segment).length;
    if (count + size > max) break;
    out += segment;
    count += size;
  }
  return out;
}

/** "Charles M.", or null when the player hides their name in Warden (no row: shown). */
export function realNameOf(name: string, showRealName: boolean | null | undefined): string | null {
  if (showRealName === false) return null;
  const short = cutCodePoints(shortName(name), REAL_NAME_MAX);
  return short || null;
}

/** What clients print: the real name when shown, else the username. */
export function displayName(realName: string | null, username: string): string {
  return realName ?? username;
}
