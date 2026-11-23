import { z } from 'zod';

import { minecraftUsername, minecraftUuid, wardenIssuer } from './warden.ts';
import { FEED_TEXT_RAW_MAX } from '../utils/feed-text.ts';

// Feed contracts, shared by the routes and the pages. See docs/feed.md (the feature) and
// docs/feed-mod.md (every route of the Minecraft server, field by field). Responses are schemas
// too, so the API reference is built from the same definitions as the types; the server doesn't
// check its own responses with them.

export const FEED_PROBLEMS = [
  'notFound',
  'notLinked',
  'banned',
  'notAllowed',
  'issuerNotAllowed',
  'emptyText',
  'tooLong',
  'idempotencyMismatch',
  'pinLimit',
  'notPinnable',
  'impliedByRole',
  'isGhost',
  'rateLimited',
  'disabled',
  'tooManyStreams',
] as const;
export type FeedProblem = (typeof FEED_PROBLEMS)[number];

export const FEED_NAMES = ['announcements', 'global'] as const;
export const feedName = z.enum(FEED_NAMES);
export type FeedName = z.infer<typeof feedName>;

/** A date in responses: an ISO 8601 string in UTC, with milliseconds. */
const isoDate = z.string().meta({ format: 'date-time' });

/** An opaque page cursor, passed back unchanged. */
const cursor = z.string().min(1).max(128);

const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

export const feedIdParams = z.object({ id: z.uuid() });
export const feedPlayerParams = z.object({ uuid: minecraftUuid });

// --- Views -----------------------------------------------------------------------------------

/** How every route shows an author: the Minecraft account a post came from and the name now. */
export const feedAuthor = z.object({
  uuid: z.uuid().describe('The Minecraft account the post was posted from.'),
  username: z.string().describe('That account’s username, for the face and the handle.'),
  realName: z
    .string()
    .nullable()
    .describe(
      'First name and initial, at most 64 code points, or null when the author hides it in Warden. The display name is `realName ?? username`; the handle is `@username` only when `realName` is not null.',
    ),
  announcer: z.boolean().describe('The author has the announce right now: the badge.'),
});
export type FeedAuthor = z.infer<typeof feedAuthor>;

export const feedReplyTo = z
  .object({
    id: z.uuid().nullable().describe('The reply answered, null once it was purged.'),
    anonymous: z.boolean(),
    name: z.string().nullable().describe('The display name of who wrote it, null when anonymous.'),
  })
  .describe(
    'On a reply that answers another reply. Null on a main post, on a reply to the main post, and when the account that wrote the target was deleted.',
  );
export type FeedReplyTo = z.infer<typeof feedReplyTo>;

/** A main post or a reply, computed for one viewer. */
export const feedPostView = z.object({
  id: z.uuid(),
  feed: feedName,
  threadId: z.uuid().nullable().describe('Null on a main post; the main post on a reply.'),
  replyTo: feedReplyTo.nullable(),
  text: z.string().describe('1 to 280 code points, NFC, cleaned by the site.'),
  createdAt: isoDate,
  anonymous: z.boolean(),
  author: feedAuthor
    .nullable()
    .describe('Null when `anonymous`, unless the viewer is a moderator or the author.'),
  likes: z.int(),
  replies: z
    .int()
    .describe('On a main post, the replies in its thread; on a reply, the replies answering it.'),
  pinnedAt: isoDate.nullable(),
  liked: z.boolean().describe('The viewer’s LNB account liked it. False for a guest.'),
  mine: z.boolean().describe('The viewer’s LNB account wrote it.'),
  canDelete: z
    .boolean()
    .describe('`mine`, or in game the viewer moderates. In the browser, `mine` only.'),
  canPin: z.boolean().describe('An announcement’s main post, and the viewer announces.'),
  unseenReplies: z
    .int()
    .describe(
      'Replies to the viewer’s post (on a main post, anywhere in its thread to the viewer), not by the viewer, since the viewer last opened the thread. Always 0 on someone else’s post.',
    ),
  answersMe: z.boolean().describe('On a reply: it answers a post or reply of the viewer.'),
});
export type FeedPostView = z.infer<typeof feedPostView>;

export const feedRights = z.object({
  write: z.boolean(),
  announce: z.boolean(),
  moderate: z.boolean(),
});
export type FeedRights = z.infer<typeof feedRights>;

export const feedUnread = z.object({ announcements: z.boolean(), global: z.boolean() });
export type FeedUnread = z.infer<typeof feedUnread>;

export const feedPage = z.object({
  feed: feedName,
  pinned: z
    .array(feedPostView)
    .describe('The pinned announcements, most recent pin first, on the first page only.'),
  posts: z.array(feedPostView).describe('Newest first, never a pinned post.'),
  next: cursor.nullable().describe('Pass it as `before` for the next page; null at the end.'),
});
export type FeedPage = z.infer<typeof feedPage>;

export const feedThread = z.object({
  post: feedPostView,
  replies: z.array(feedPostView).describe('Oldest first.'),
  next: cursor.nullable().describe('Pass it as `after` for the next replies; null at the end.'),
});
export type FeedThread = z.infer<typeof feedThread>;

export const feedCreated = z.object({
  replayed: z.boolean().describe('True when the key was already used for this same request.'),
  post: feedPostView,
});
export type FeedCreated = z.infer<typeof feedCreated>;

export const feedLikeResult = z.object({ id: z.uuid(), likes: z.int(), liked: z.boolean() });
export type FeedLikeResult = z.infer<typeof feedLikeResult>;

export const feedPin = z.object({ id: z.uuid(), pinnedAt: isoDate });
export const feedPinsResult = z.object({
  pinned: z.array(feedPin).describe('The pinned group after the call, most recent pin first.'),
  unpinned: z.uuid().nullable().describe('The post unpinned to make room, if any.'),
});
export type FeedPinsResult = z.infer<typeof feedPinsResult>;

// --- The Minecraft server ----------------------------------------------------------------------

const text = z
  .string()
  .max(FEED_TEXT_RAW_MAX)
  .describe('As typed. The site cleans and checks it: 1 to 280 code points after cleaning.');

export const feedServerPlayer = z.object({
  linked: z.boolean(),
  banned: z.boolean().describe('A Warden ban or a site ban is in force.'),
  writing: z.boolean().describe('The `feed.writing` flag.'),
  me: feedAuthor.nullable().describe('The author block the player would post as.'),
  rights: feedRights,
  unread: feedUnread,
});
export type FeedServerPlayer = z.infer<typeof feedServerPlayer>;

export const feedServerPageQuery = z.object({
  feed: feedName,
  viewer: minecraftUuid,
  limit: z.coerce.number().int().min(1).max(50).optional().describe('20 by default.'),
  before: cursor.optional().describe('The `next` of the previous page.'),
});

export const feedServerThreadQuery = z.object({
  viewer: minecraftUuid,
  limit: z.coerce.number().int().min(1).max(50).optional().describe('50 by default.'),
  after: cursor.optional().describe('The `next` of the previous page of replies.'),
});

export const feedViewsBody = z.object({
  viewers: z.array(minecraftUuid).min(1).max(200).refine(distinct, 'Distinct viewers'),
  ids: z.array(z.uuid()).min(1).max(20).refine(distinct, 'Distinct IDs'),
});
export type FeedViewsBody = z.infer<typeof feedViewsBody>;

export const feedViewsResult = z.object({
  views: z.array(
    z.object({
      viewer: z.string(),
      posts: z.array(feedPostView).describe('In the order of `ids`, deleted or unknown ones out.'),
    }),
  ),
});
export type FeedViewsResult = z.infer<typeof feedViewsResult>;

export const feedServerPostBody = z.object({
  idempotencyKey: z.uuid(),
  player: minecraftUuid,
  feed: feedName,
  text,
  anonymous: z.boolean(),
});
export type FeedServerPostBody = z.infer<typeof feedServerPostBody>;

export const feedServerReplyBody = z.object({
  idempotencyKey: z.uuid(),
  player: minecraftUuid,
  replyTo: z.uuid().nullable().describe('A reply of the same thread, or null for the main post.'),
  text,
  anonymous: z.boolean(),
});
export type FeedServerReplyBody = z.infer<typeof feedServerReplyBody>;

export const feedPlayerBody = z.object({ player: minecraftUuid });
export const feedPlayerQuery = z.object({ player: minecraftUuid });

export const feedServerPinBody = z.object({
  player: minecraftUuid,
  replace: z.boolean().optional().describe('Unpin the oldest pin to make room. False by default.'),
});

export const feedServerSeenBody = z.object({
  player: minecraftUuid,
  feed: feedName,
  upTo: z.iso.datetime().describe('The `createdAt` of the newest post shown in that feed.'),
});

export const feedNotificationPost = z.object({
  id: z.uuid(),
  feed: feedName,
  threadId: z.uuid().nullable(),
  text: z.string(),
  anonymous: z.boolean(),
  author: feedAuthor.nullable().describe('Null when anonymous, for everyone.'),
});

export const feedNotification = z.object({
  id: z.uuid(),
  kind: z.enum(['announcement', 'reply']),
  createdAt: isoDate,
  players: z
    .array(z.string())
    .nullable()
    .describe('A reply: every Minecraft account of the recipient now. An announcement: null.'),
  except: z
    .array(z.string())
    .describe('An announcement: its author’s Minecraft accounts, never shown. A reply: [].'),
  post: feedNotificationPost,
});
export type FeedNotification = z.infer<typeof feedNotification>;

export const feedNotifications = z.object({
  items: z.array(feedNotification).describe('Oldest first, at most 100.'),
  more: z.boolean().describe('More are waiting: acknowledge these, then call again.'),
});
export type FeedNotifications = z.infer<typeof feedNotifications>;

export const feedAckBody = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

export const feedServerAnnouncerBody = z.object({
  announcer: z.boolean(),
  issuer: wardenIssuer.optional(),
});
export type FeedServerAnnouncerBody = z.infer<typeof feedServerAnnouncerBody>;

export const feedServerAnnouncer = z.object({
  uuid: z.string(),
  username: z.string(),
  announcer: z.boolean().describe('The target’s announce right after the call.'),
  viaRole: z.boolean().describe('They announce as a moderator; the role itself changes nothing.'),
});
export type FeedServerAnnouncer = z.infer<typeof feedServerAnnouncer>;

export const feedAnnouncerList = z.object({
  items: z.array(
    z.object({
      realName: z.string().nullable(),
      accounts: z.array(z.object({ uuid: z.string(), username: minecraftUsername })),
    }),
  ),
});
export type FeedAnnouncerList = z.infer<typeof feedAnnouncerList>;

/** The events of `GET /api/feed/server/events`: `data` by `type`, for the API reference. */
export const feedServerEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('post'),
    data: z
      .object({ id: z.uuid(), feed: feedName, threadId: z.uuid().nullable(), createdAt: isoDate })
      .describe('A post or reply was created: ask `POST /views` for each watcher’s view.'),
  }),
  z.object({
    type: z.literal('deleted'),
    data: z
      .object({
        items: z.array(z.object({ id: z.uuid(), feed: feedName, threadId: z.uuid().nullable() })),
      })
      .describe('These posts and replies went, a main post with its replies.'),
  }),
  z.object({
    type: z.literal('counts'),
    data: z.object({
      items: z.array(z.object({ id: z.uuid(), likes: z.int(), replies: z.int() })),
    }),
  }),
  z.object({
    type: z.literal('pins'),
    data: z
      .object({ pinned: z.array(feedPin) })
      .describe('The whole pinned group after a change, most recent pin first.'),
  }),
  z.object({
    type: z.literal('rights'),
    data: z
      .object({ uuids: z.array(z.string()) })
      .describe('Read these players’ state again (`GET /players/{uuid}`).'),
  }),
  z.object({
    type: z.literal('notification'),
    data: z.object({}).describe('Notifications were queued: drain the queue.'),
  }),
]);
export type FeedServerEvent = z.infer<typeof feedServerEvent>;

// --- The browser (/api/feed/, for the signed-in account) ------------------------------------------

export const feedPageQuery = feedServerPageQuery.omit({ viewer: true });
export const feedThreadQuery = feedServerThreadQuery.omit({ viewer: true });

export const feedPostBody = feedServerPostBody.omit({ player: true });
export type FeedPostBody = z.infer<typeof feedPostBody>;

export const feedReplyBody = feedServerReplyBody.omit({ player: true });
export type FeedReplyBody = z.infer<typeof feedReplyBody>;

/** The body itself is optional: none pins without replacing. */
export const feedPinBody = feedServerPinBody.omit({ player: true });
export const feedPinBodyOrNone = feedPinBody.optional();

export const feedSeenBody = feedServerSeenBody.omit({ player: true });

/** `GET /api/feed/views?ids=`: 1 to 20 distinct post or reply IDs, comma-separated. */
export const feedViewsQuery = z.object({
  ids: z
    .string()
    .max(800)
    // Lowercased, as the site writes them and answers them, so a repeat in capitals isn't distinct.
    .transform((value) => value.toLowerCase().split(','))
    .pipe(z.array(z.uuid()).min(1).max(20).refine(distinct, 'Distinct IDs'))
    .describe('1 to 20 distinct post or reply IDs, comma-separated.'),
});

export const feedViewsOf = z.object({
  posts: z.array(feedPostView).describe('In the order of `ids`, deleted or unknown ones out.'),
});
export type FeedViewsOf = z.infer<typeof feedViewsOf>;

/**
 * The events of `GET /api/feed/events`: the four public ones of the server's stream, with the same
 * data, then `ping` and `reset`. Never `rights` or `notification`.
 */
const [livePost, liveDeleted, liveCounts, livePins] = feedServerEvent.options;
export const feedLiveEvent = z.discriminatedUnion('type', [
  livePost,
  liveDeleted,
  liveCounts,
  livePins,
  z.object({
    type: z.literal('ping'),
    data: z
      .object({})
      .describe(
        'Nothing to say: sent at opening and after 25 quiet seconds, its `id` the last event read.',
      ),
  }),
  z.object({
    type: z.literal('reset'),
    data: z
      .object({})
      .describe(
        'Events were missed (`Last-Event-ID` older than the replay buffer, or unknown): reload what the page shows and merge it.',
      ),
  }),
  z.object({
    type: z.literal('closed'),
    data: z
      .object({ problem: z.literal('tooManyStreams') })
      .describe(
        'The last message of a stream closed for a newer one of the same account (5 at most): come back later, not at once.',
      ),
  }),
]);
export type FeedLiveEvent = z.infer<typeof feedLiveEvent>;

export const feedMePatchBody = z.object({
  postingAccount: minecraftUuid.describe('One of the caller’s linked Minecraft accounts.'),
});
export type FeedMePatchBody = z.infer<typeof feedMePatchBody>;

// --- The browser and the admin ---------------------------------------------------------------------

export const feedMe = z.object({
  linked: z.boolean(),
  banned: z.boolean(),
  banExpiresAt: isoDate
    .nullable()
    .describe('The end of the Warden ban in force; null when permanent or not banned.'),
  writing: z.boolean(),
  rights: feedRights,
  me: feedAuthor.nullable().describe('The author block of the effective posting account.'),
  unread: feedUnread,
  accounts: z.array(z.object({ uuid: z.string(), username: z.string() })),
  postingAccount: z.string().nullable().describe('The effective posting account’s UUID.'),
});
export type FeedMe = z.infer<typeof feedMe>;

export const feedAnnouncerState = z.object({
  userId: z.string(),
  announcer: z
    .boolean()
    .describe(
      'The person holds the `feed-announcer` role, or a moderator role that implies it. The role, not the right: a ban or no linked account leaves it.',
    ),
  viaRole: z
    .boolean()
    .describe(
      'They announce as a moderator (`admin` or `warden-admin`): the switch can’t turn it off.',
    ),
});
export type FeedAnnouncerState = z.infer<typeof feedAnnouncerState>;

// --- The admin (/api/feed/admin/, for moderators) ---------------------------------------------------

export const feedAnnouncerParams = z.object({ userId: z.string().min(1).max(64) });

export const feedAnnouncerBody = z.object({
  announcer: z.boolean().describe('Give (true) or take (false) the `feed-announcer` role.'),
});
export type FeedAnnouncerBody = z.infer<typeof feedAnnouncerBody>;

export const feedAdminDeleteBody = z.object({
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe(
      'Why, for the activity log and the Deleted rows. At most 500 characters; empty is none.',
    ),
});
export type FeedAdminDeleteBody = z.infer<typeof feedAdminDeleteBody>;
/** The body itself is optional: none deletes without a reason. */
export const feedAdminDeleteBodyOrNone = feedAdminDeleteBody.optional();

export const feedAdminPost = feedPostView
  .omit({
    liked: true,
    mine: true,
    canDelete: true,
    canPin: true,
    unseenReplies: true,
    answersMe: true,
  })
  .extend({
    author: feedAuthor.describe('Always filled, anonymous posts too.'),
    authorUserId: z.string(),
    replyToGone: z
      .boolean()
      .describe(
        'A reply to another reply whose author’s account was deleted since: `replyTo` is then null, as on a reply to the main post, which this tells apart.',
      ),
    source: z.enum(['server', 'site']),
    deletedAt: isoDate.nullable(),
    deletedBy: z
      .object({ userId: z.string(), name: z.string() })
      .nullable()
      .describe('Null when the author deleted it or it went with its thread.'),
    deletedCause: z.enum(['author', 'moderator', 'thread']).nullable(),
    deletedReason: z.string().nullable(),
    purgeAt: isoDate.nullable().describe('`deletedAt` plus 30 days.'),
  });
export type FeedAdminPost = z.infer<typeof feedAdminPost>;

export const feedAdminListQuery = z.object({
  q: z.string().trim().min(2).max(100).optional(),
  feeds: z
    .string()
    .max(40)
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : [...FEED_NAMES]))
    .pipe(z.array(feedName).min(1))
    .describe('`announcements`, `global` or both, comma-separated. Both by default.'),
  replies: z.literal('true').optional().describe('Only replies.'),
  anonymous: z.literal('true').optional().describe('Only anonymous rows.'),
  deleted: z.literal('true').optional().describe('Only deleted rows.'),
  user: z.string().min(1).max(100).optional().describe('One author’s LNB account.'),
  cursor: cursor.optional(),
});
export type FeedAdminListQuery = z.output<typeof feedAdminListQuery>;

export const feedAdminList = z.object({
  items: z.array(feedAdminPost),
  nextCursor: cursor.nullable(),
  summary: z.object({
    last30Days: z.int().describe('Rows matching the filters in the last 30 days.'),
    deleted: z.int().describe('How many of those are deleted.'),
  }),
});
export type FeedAdminList = z.infer<typeof feedAdminList>;

export const feedAdminDetail = z.object({
  post: feedAdminPost,
  thread: z.object({
    post: feedAdminPost,
    replies: z.array(feedAdminPost).describe('Every reply, deleted ones included, oldest first.'),
  }),
});
export type FeedAdminDetail = z.infer<typeof feedAdminDetail>;
