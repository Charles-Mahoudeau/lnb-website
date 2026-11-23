# Feed

A short-post feed for the LNB Minecraft server, read and written in game on the LNB Phone (the `lnbphone_feed` mod) and in the browser. Two feeds: **Announcements**, written by announcers, and **Global**, written by every player with a linked Minecraft account. Posts are plain text of at most 280 characters; anyone who can write may reply (one level deep) and like. The site stores everything and decides who may do what; the Minecraft server only asks and relays. This page is the feature on the site: rules, data, rights, routes, flags, limits, audit and privacy. The contract with the mod (every route under `/api/feed/server/`, the stream, test vectors) is [feed-mod.md](feed-mod.md); the mod's own design is `docs/feed-app.md` in the LNB-phone-mod repository. The three agree field for field.

Status: specified, not built. The pages (the browser feed, the admin's Feed tab and the announcer switch) wait for a mock the owner picks, as `CLAUDE.md` asks.

## Decisions

Taken with the owner on 2026-11-23, and the choices this page adds where those were silent (marked "chosen").

- **Who reads.** In the browser, signed-in LNB accounts only. In game, every player on the server, guests included (players without an LNB account, possible when Warden runs in `optional` mode).
- **Who writes.** Posting, replying and liking need a linked Minecraft account (`minecraft_account` with `unlinked_at` null), in game and in the browser, and no Warden ban or site ban in force. Guests and banned accounts read only.
- **Moderators** are the site's `admin` and `warden-admin` roles, never the Minecraft op level. They delete any post or reply, and see who wrote an anonymous one, in game and in the admin.
- **Announcers** are a new site role, `feed-announcer`, given from the admin and by an in-game command that calls the site. Moderators are announcers too. Announcers post in Announcements and pin announcements.
- **Deleting** hides a post from everyone at once. Deleting a main post deletes its replies. The rows stay 30 days for moderators, then the nightly purge removes them. Nothing is restored, from the app or the admin (chosen: no restore button in version 1, so "deleted" means the same thing to the author and to moderators).
- **Names.** A post shows its author's current name setting, never the one at posting time: the first name and initial (`Charles M.`) when the player shows their real name in Warden, otherwise the Minecraft username alone.
- **Account deletion** deletes the account's posts, replies and likes.
- **Notifications** are in game only: a new announcement notifies every player, a reply notifies the author of what it answers, nobody is notified of their own action. No browser notifications, no push.
- **Plain text.** No editing, links, mentions, hashtags or media. No report button.
- **Several Minecraft accounts.** In the browser, the person chooses on the site which linked account they post from. In game, a post carries the account the player is playing on (chosen: a player on their second account would otherwise post under a face nobody sees them with; see "Decisions to validate" in the report).
- **The badge follows the role** (chosen). The announcer badge shows on posts and replies whose author is an announcer now, like the name follows the current setting. An announcement by someone who is no longer an announcer loses its badge.
- **The site works out every recipient** (chosen). Notifications wait in a queue on the site until the Minecraft server takes them, so a reply made in the browser while the server is down still reaches the player when it comes back.
- **Read state lives on the site** (chosen), per LNB account: which posts of each feed were seen and which threads were opened. The unread dots and the unseen-replies markers are then right after a restart, and the same in the browser and in game.
- **Flag.** `feed`, shipped **off** (seeded as a disabled row by the migration, as the Market's flags are), with parts `feed.serverApi` and `feed.writing`, and `jobs.feedPurge` for the nightly purge.

## Identity

A post belongs to an LNB account (`author_user_id`) and carries the Minecraft account it was posted from (`minecraft_uuid` and `minecraft_username`): the one the player was on in game, or the person's chosen posting account in the browser. Every route shows an author the same way:

```json
{
  "uuid": "5c2a7a3e-6b1d-3c8e-9f4a-2d7b8c9e0f11",
  "username": "Alex_Craft",
  "realName": "Alexandre M.",
  "announcer": false
}
```

| Field              | Meaning                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`, `username` | The Minecraft account the post was posted from, for the face and the handle. In offline mode a UUID's username never changes, so the stored username stays right.                                                                        |
| `realName`         | `shortName(user.name)` (`server/services/warden/rules.ts`) when the author's `warden_player.show_real_name` is true or there is no row, otherwise `null`. At most 64 code points (cut between graphemes if longer). Read at answer time. |
| `announcer`        | Whether the author has the announce right now (see Rights).                                                                                                                                                                              |

Clients derive what to print: the display name is `realName` when it is not null, otherwise `username`; the handle is `@` plus `username` when `realName` is not null, and there is none otherwise. So the same word is never printed twice.

A post's Minecraft account is history: when it is later unlinked, or taken over by another player (see `docs/warden.md`, "Account takeovers"), the post keeps showing it.

### Anonymous posts and replies

A main post in Global and any reply can be anonymous. An announcement cannot (`anonymousAnnouncement`). An anonymous post is shown with `anonymous: true` and `author: null` to everyone except two viewers, who get the `author` object:

- its author (the same LNB account, from any of its Minecraft accounts or the browser), with `mine: true`;
- moderators.

No route, stream event, payload or log line carries the author of an anonymous post to anyone else. The `replyTo` of a reply that answers an anonymous one carries `anonymous: true` and no name, for moderators too (the private line on the anonymous post itself is where they read its author). Two places necessarily know more, and both are trusted: the site itself, and the Minecraft server, which holds `WARDEN_SERVER_SECRET`. The server learns the author of an anonymous post or reply in two cases only: a reply notification names the players to notify, who are the author of what was answered; and a per-viewer answer for a moderator or for the author carries the author. The mod forwards those to that viewer's client only and never logs them ([feed-mod.md](feed-mod.md), "Privacy").

## Rights

The site decides every right on every request. Clients and the mod only use rights to choose what to show.

| Right      | Who                                                               | Covers                                                                                                  |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| read       | everyone, while the `feed` flag is on (signed in, in the browser) | both feeds, threads                                                                                     |
| write      | a linked Minecraft account, no Warden ban or site ban in force    | posting in Global, replying anywhere, liking                                                            |
| announce   | write, and the `feed-announcer`, `warden-admin` or `admin` role   | posting in Announcements, pinning and unpinning announcements                                           |
| moderate   | the `warden-admin` or `admin` role, no ban in force               | deleting any post or reply, seeing anonymous authors, the admin's Feed tab, granting the announcer role |
| delete own | the author, whatever their ban                                    | deleting their own posts and replies, anonymous ones included                                           |

- A Warden ban (`warden_ban` in force) or a site ban (`user.banned` with no end, or an end in the future) removes write, announce and moderate. In game a Warden-banned player can't be online; in the browser a site-banned person can't sign in, so in practice this is a Warden ban seen in the browser.
- The `feed.writing` flag off makes posting, replying and liking answer 503 `disabled`, for everyone. Deleting and pinning still work, so moderation never stops.
- Roles live in `user.role`, as for the other roles. `shared/utils/roles.ts` gets `FEED_ANNOUNCER_ROLE = 'feed-announcer'`, `isFeedModerator(role)` (`isWardenAdmin`) and `isFeedAnnouncer(role)` (`isFeedModerator(role) || hasRole(role, FEED_ANNOUNCER_ROLE)`). `server/lib/auth.ts` lists the role with no Better Auth rights, like `economy-admin`. The People list's `hasRole` filter and `role` choices include it. `setRoles` (`PUT /api/admin/users/:userId/roles`) keeps it, as it keeps any role it does not set.

### Granting the announcer role

- **From the admin:** moderators (admin and Warden admins) switch "Announcer" on a person's Minecraft tab (`/admin/people/:userId/minecraft`), or on the Feed tab's Announcers list. `PUT /api/feed/admin/announcers/:userId` with `{ "announcer": true }`.
- **From the game:** `/feed announcer add <username>` and `remove`, run by a moderator in game or from the server console. The mod calls `PUT /api/feed/server/announcers/:uuid` with an `issuer`, as Warden's bans do: the site refuses the change (403 `issuerNotAllowed`) unless the issuer is a linked Minecraft account whose LNB account has the moderate right. Without an `issuer` the change comes from the console, which the mod only allows for a permission level of 4 (the console, not command blocks).
- Giving the role to a moderator changes nothing (it is implied); taking it from one is refused (409 `impliedByRole`). A ghost account can't get it (409 `isGhost`). Each real change is audited as `minecraft.feed.announcer` and sends a `rights` event.

## Feeds, threads and posts

- **Announcements**: main posts by announcers, newest first, after the **pinned** group: at most 3 pinned announcements, the most recently pinned first. Pinned posts are not repeated in the list below them.
- **Global**: main posts by every writer, newest first. Global posts can't be pinned.
- **A thread** is a main post and its replies, oldest first, one level deep. A reply answers the main post or another reply of the same thread (`replyTo`). Replying to a reply adds it to the same thread, with a reply-to line naming whom it answers.
- **Counts.** `likes` is the number of likes. `replies` is, on a main post, the replies in its thread, and on a reply, the replies that answer it directly. Deleted replies don't count.
- **Liked.** `liked` says whether the viewer's LNB account liked the post. One like per account and post, whatever Minecraft account it was given from. A player may like their own post.

### Pinning

Announcers pin and unpin any announcement, from the feed or from its thread. Pinning sets `pinned_at`; the pinned group is ordered by it.

- Pinning when fewer than 3 are pinned: the post joins the group.
- Pinning when 3 are pinned: refused with 409 `pinLimit`, naming the oldest pin (`data.oldest`), unless the request says `replace: true`; then the oldest pin is unpinned and the post pinned, in one transaction. This is the art direction's "Replace a pin?" dialog.
- Pinning a pinned post, or unpinning a post that isn't pinned, changes nothing and answers the current pins.
- A reply, or a Global post, is `notPinnable` (409).
- Deleting a pinned post unpins it.

Each pin and unpin is audited (`minecraft.feed.pin`, `.unpin`) and sends a `pins` event with the whole group.

### Deleting

| Who                              | What                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| The author                       | their own posts and replies, anonymous ones included, even while banned |
| Moderators                       | any post or reply                                                       |
| Announcers who aren't moderators | their own only, like any player                                         |

- Deleting sets `deleted_at` on the row. Deleting a main post sets it on every reply of its thread too (`deleted_cause = 'thread'`), and unpins it. Replies that answered a deleted reply stay; their reply-to line keeps naming whom they answered.
- A deleted post or reply is **absent** for players, in game and in the browser: it leaves every list and count, and reading it, its thread, or acting on it answers 404 `notFound`. Moderators see the same thing in game and in the browser; only the admin's Deleted list shows deleted rows, with who deleted them, why, and when they will be purged.
- Pending notifications about a deleted post or reply are dropped in the same transaction, and the mod takes back the ones already sent (`deleted` event).
- Deleting what is already deleted answers 204 again, if the caller could have deleted it, so a retry after a timeout is harmless.
- A moderator deleting someone else's post is audited as `minecraft.feed.delete` (target: the author; `data`: the post ID, its thread, its feed, whether it was a reply and anonymous, and the reason given in the admin). An author deleting their own post is not audited: it is the player's own content, not a change admins watch, and the row itself stays 30 days.

## Writing

### Text

One rule, applied by the site to every post and reply, whatever sends it, and matching the phone's `TextLimits` and `TextState`:

1. **Clean**: CR LF and a lone CR become LF; a tab becomes a space; code points the phone can't type are dropped: U+0000 to U+001F except LF, U+007F to U+009F, U+00A7 (the section sign) and unpaired surrogates (this is `TextState.isAllowed`).
2. **Normalise** to NFC.
3. **Trim** leading and trailing whitespace as Kotlin's `String.trim()` does, which after step 1 means LF, the Unicode space separators (category Zs, U+00A0 included), U+2028 and U+2029. Not `String.prototype.trim()`, which also strips U+FEFF.
4. **Fold blank lines**: a run of three or more LF becomes two, so a post has at most one empty line in a row.
5. **Count** code points: 0 is refused with 400 `emptyText`, more than 280 with 400 `tooLong`.

Every step only removes or shortens, so a text the phone's counter allowed (at most 280 code points of NFC, sent trimmed) always passes. The cleaned text is what is stored and returned. The Zod schema caps the raw `text` at 4,000 characters (longer is a plain 400). The pure function lives in `shared/utils/feed-text.ts`, so the browser's composer counts as the site does, and its tests use the vectors of [feed-mod.md](feed-mod.md), "Test vectors".

### Idempotency

Creating a post or a reply takes an `idempotencyKey` (a UUID), in game and in the browser. The same key with the same request returns the first post with `replayed: true` and creates nothing; the same key with any other request (another player, account, feed, thread, target, text or anonymous flag) is 409 `idempotencyMismatch`. The key is checked before anything else but the flags. A key whose post has since been deleted answers 404 `notFound`: the post existed, so the client stops retrying. Likes, pins and deletes need no key: doing them twice leaves the same state.

### Rate limits

Per LNB account, counted together in the browser and in game, in the service with `createLimiter` (`server/lib/rate-limit.ts`), so in memory like the site's other limits:

| Action                  | Limit                     |
| ----------------------- | ------------------------- |
| Main post (either feed) | 3 a minute and 15 an hour |
| Reply                   | 6 a minute and 60 an hour |
| Like or unlike          | 60 a minute               |

Over a limit: 429 `rateLimited` with `Retry-After` in seconds, as the middleware answers. These fit a server of a few dozen players: a normal player never meets them, and one account can't flood a feed. The Minecraft server's own calls get a rule of their own in `rate-limit-rules.ts`, `feed-server` (1,200 a minute per IP on `/api/feed/server/*`, like `warden-server`), instead of the per-account `write` rule, which would otherwise count every player's writes against the server's single IP. Browser writes keep `api` and `write`. `/api/feed/admin/` joins `ADMIN_PREFIXES`.

## Read state and notifications

### Unread dots

Each LNB account keeps, per feed, the time of the newest post it saw when it last viewed that feed (`feed_member.announcements_seen_at`, `global_seen_at`). A feed is **unread** for an account when it holds a main post, not deleted and not by that account, created after that time (or any such post when it has never been viewed). The game and the browser read it at start (`unread`) and set it when a feed is viewed (`POST .../seen` with `upTo`, the `createdAt` of the newest post shown; the site keeps the later of the stored and sent times, never past now). While a feed is open, posts that arrive live set the other tab's dot on the client. Guests have no stored state: `unread` is false for them and marking seen does nothing.

### Unseen replies

Each LNB account keeps, per thread it opened, when it last opened it (`feed_thread_seen`). A post or reply of the viewer has `unseenReplies: true` when a reply in its thread answers it, is not deleted, is not by the viewer, and is newer than the viewer's last opening of that thread. On a main post in a feed, that covers replies to the post and to the viewer's replies inside its thread: the marker shows on the card until the thread is opened. A thread's answer computes the markers first; the client then marks the thread seen (`POST .../posts/:id/seen`). A reply also carries `answersMe`, true when it answers a post or reply of the viewer's account, so a client can raise the marker when such a reply arrives live.

### Notifications

The site creates one row in `feed_notification` per notification, in the transaction that creates the post:

- a new **announcement**: one row for everyone (`recipient_user_id` null), with the author's accounts excluded at delivery;
- a new **reply**: one row for the author of what it answers (the main post, or the reply named in `replyTo`), unless that is the replier's own account.

The Minecraft server takes the rows (`GET /api/feed/server/notifications`), delivers them with `PhoneNotifications` (every linked Minecraft account of the recipient for a reply; every player of the world except the author's accounts for an announcement), and acknowledges them, which deletes them. It drains the queue at start, at each reconnection of the stream, on each `notification` event and every 5 minutes. A reply made in the browser while the server is down waits in the queue. Rows deleted with their post are never delivered; rows older than 30 days (the phone's own lifetime) are purged unsent. Likes and new Global posts notify nobody.

## Data

In `server/db/schema/feed.ts`. Every timestamp is `timestamp` without time zone, in UTC, like the rest of the schema.

### `feed_post`

Main posts and replies.

| Column                        | Type                                               | Notes                                                                                                     |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`                          | `uuid` PK, random                                  |                                                                                                           |
| `feed`                        | `text` not null                                    | `announcements` or `global`. A reply has its thread's feed.                                               |
| `thread_id`                   | `uuid` null, FK `feed_post.id`, on delete cascade  | Null for a main post; the main post for a reply.                                                          |
| `reply_to_id`                 | `uuid` null, FK `feed_post.id`, on delete set null | The reply this reply answers. Null when it answers the main post.                                         |
| `reply_to_user_id`            | `text` null, FK `user.id`, on delete set null      | The author of what it answers (main post or reply), for notifications and markers. Never sent to clients. |
| `reply_to_anonymous`          | `boolean` not null, default false                  | Whether what it answers was anonymous.                                                                    |
| `reply_to_minecraft_username` | `text` null                                        | The username of what it answers, for the reply-to line once that row is purged.                           |
| `author_user_id`              | `text` not null, FK `user.id`, on delete cascade   |                                                                                                           |
| `minecraft_uuid`              | `uuid` not null                                    | The Minecraft account it was posted from. No foreign key: unlinking or a takeover keep it.                |
| `minecraft_username`          | `text` not null                                    | That account's username.                                                                                  |
| `source`                      | `text` not null                                    | `server` (the game) or `site` (the browser).                                                              |
| `text`                        | `text` not null                                    | Cleaned, 1 to 280 code points.                                                                            |
| `anonymous`                   | `boolean` not null, default false                  |                                                                                                           |
| `like_count`                  | `integer` not null, default 0                      | Kept in the transaction that likes or unlikes.                                                            |
| `reply_count`                 | `integer` not null, default 0                      | Kept in the transactions that reply and delete (see Counts).                                              |
| `pinned_at`                   | `timestamp` null                                   | Announcements' main posts only.                                                                           |
| `pinned_by_user_id`           | `text` null, FK `user.id`, on delete set null      |                                                                                                           |
| `created_at`                  | `timestamp` not null, default now                  |                                                                                                           |
| `deleted_at`                  | `timestamp` null                                   |                                                                                                           |
| `deleted_by_user_id`          | `text` null, FK `user.id`, on delete set null      |                                                                                                           |
| `deleted_cause`               | `text` null                                        | `author`, `moderator` or `thread` (its main post was deleted).                                            |
| `deleted_reason`              | `text` null                                        | A moderator's reason from the admin, at most 500 characters.                                              |
| `idempotency_key`             | `uuid` not null, unique                            |                                                                                                           |
| `fingerprint`                 | `text` not null                                    | SHA-256 of the request, as the quests' `hashRequest`.                                                     |

Checks: `char_length(text) between 1 and 280` (PostgreSQL counts code points in UTF-8); `feed in ('announcements', 'global')`; not anonymous for an announcement's main post (`thread_id is not null or feed = 'global' or not anonymous`); `pinned_at` only on an announcement's main post (`pinned_at is null or (thread_id is null and feed = 'announcements')`); `reply_to_id` only on a reply.

Indexes: the feeds, `(feed, created_at desc, id desc) where thread_id is null and deleted_at is null and pinned_at is null`; threads, `(thread_id, created_at, id) where deleted_at is null`; `(pinned_at) where pinned_at is not null`; `(author_user_id, created_at)`; markers, `(reply_to_user_id, thread_id) where deleted_at is null`; replies to a reply, `(reply_to_id)`; the purge, `(deleted_at) where deleted_at is not null`.

### `feed_like`

| Column       | Type                                         | Notes |
| ------------ | -------------------------------------------- | ----- |
| `post_id`    | `uuid`, FK `feed_post.id`, on delete cascade |       |
| `user_id`    | `text`, FK `user.id`, on delete cascade      |       |
| `created_at` | `timestamp` not null, default now            |       |

Primary key `(post_id, user_id)`; index `(user_id)`.

### `feed_member`

One row per LNB account that used Feed, created on first need.

| Column                                    | Type                                                         | Notes                          |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `user_id`                                 | `text` PK, FK `user.id`, on delete cascade                   |                                |
| `posting_minecraft_uuid`                  | `uuid` null, FK `minecraft_account.uuid`, on delete set null | The browser's posting account. |
| `announcements_seen_at`, `global_seen_at` | `timestamp` null                                             | See "Unread dots".             |
| `updated_at`                              | `timestamp` not null, default now                            |                                |

The **effective posting account** is `posting_minecraft_uuid` while it is linked to this account, otherwise the account's earliest-linked account that is still linked, otherwise none (the person can't write).

### `feed_thread_seen`

| Column      | Type                                         | Notes |
| ----------- | -------------------------------------------- | ----- |
| `user_id`   | `text`, FK `user.id`, on delete cascade      |       |
| `thread_id` | `uuid`, FK `feed_post.id`, on delete cascade |       |
| `seen_at`   | `timestamp` not null                         |       |

Primary key `(user_id, thread_id)`.

### `feed_notification`

| Column              | Type                                                  | Notes                                |
| ------------------- | ----------------------------------------------------- | ------------------------------------ |
| `id`                | `uuid` PK, random                                     |                                      |
| `kind`              | `text` not null                                       | `announcement` or `reply`.           |
| `post_id`           | `uuid` not null, FK `feed_post.id`, on delete cascade | The announcement, or the reply.      |
| `recipient_user_id` | `text` null, FK `user.id`, on delete cascade          | Null for an announcement (everyone). |
| `created_at`        | `timestamp` not null, default now                     |                                      |

Index `(created_at)`. Acknowledged rows are deleted.

### Stream topic

`MinecraftTopic` (`server/services/minecraft-events.ts`) and the `topic` column type of `minecraft_server_event` get `'feed'`. Events are recorded after the transaction commits and never fail the change, as for the other topics; `minecraft:prune-events` already deletes them after 24 hours. None carries an anonymous author or a per-viewer field; their data is in [feed-mod.md](feed-mod.md), section 8.

| Event          | Data                                  | Sent by                                                                                    |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `post`         | `{ id, feed, threadId, createdAt }`   | creating a post or a reply                                                                 |
| `deleted`      | `{ items: [{ id, feed, threadId }] }` | deleting, and `forgetUsers`                                                                |
| `counts`       | `{ items: [{ id, likes, replies }] }` | liking, unliking, replying, deleting a reply                                               |
| `pins`         | `{ pinned: [{ id, pinnedAt }] }`      | pinning, unpinning, deleting a pinned post                                                 |
| `rights`       | `{ uuids }`                           | the announcer role, a moderator role, a Warden or site ban, unban or end change, an unlink |
| `notification` | `{}`                                  | queueing a notification                                                                    |

## Routes

Bodies and answers are JSON, checked by Zod schemas in `shared/schemas/feed.ts`, each route with its `server/lib/openapi.ts` entry (tags "Feed", "Feed: Minecraft server", "Feed: admin"). Errors carry a `data.problem` code. Lists use opaque cursors (at most 128 characters): `next` is null on the last page. A malformed body or query is a plain 400 and an ID that is not a UUID a plain 404, as `parseBody` and `parseParams` answer.

The post view, the same in every route but the admin's (the mod's contract lists it field by field):

```json
{
  "id": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70",
  "feed": "global",
  "threadId": null,
  "replyTo": null,
  "text": "Qui est chaud pour une virée dans le Nether ce soir ?",
  "createdAt": "2026-11-23T20:14:05.000Z",
  "anonymous": false,
  "author": {
    "uuid": "...",
    "username": "Alex_Craft",
    "realName": "Alexandre M.",
    "announcer": false
  },
  "likes": 12,
  "replies": 3,
  "pinnedAt": null,
  "liked": false,
  "mine": false,
  "canDelete": false,
  "canPin": false,
  "unseenReplies": false,
  "answersMe": false
}
```

`replyTo`, on a reply that answers another reply, is `{ "id": "<reply or null once purged>", "anonymous": false, "name": "Mika L." }`, `name` being the display name of whoever wrote it (null when anonymous). It is null on a main post, on a reply to the main post, and when the account that wrote the target is gone.

### For the Minecraft server

Under `/api/feed/server/`, `Authorization: Bearer <WARDEN_SERVER_SECRET>` (`requireWardenServer`), behind `feed` and `feed.serverApi`. `player` (or `viewer`) is always a Minecraft UUID. Every shape, problem and example is in [feed-mod.md](feed-mod.md).

| Route                                                   | What it does                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /players/:uuid`                                    | The player's rights, whether linked or banned, `writing`, their author block (`me`) and unread dots. Any UUID: a guest is `linked: false`. |
| `GET /posts?feed=&viewer=&limit=&before=`               | A page of a feed for one viewer, with the pinned group on the first page of Announcements.                                                 |
| `GET /posts/:id?viewer=&limit=&after=`                  | A thread for one viewer: the main post and a page of replies, oldest first.                                                                |
| `POST /views`                                           | Per-viewer views of a few posts for many viewers at once, for what the stream announces.                                                   |
| `POST /posts`                                           | Creates a main post. Idempotent by key.                                                                                                    |
| `POST /posts/:id/replies`                               | Creates a reply in a thread. Idempotent by key.                                                                                            |
| `PUT /posts/:id/like`, `DELETE /posts/:id/like?player=` | Likes, unlikes.                                                                                                                            |
| `PUT /posts/:id/pin`, `DELETE /posts/:id/pin?player=`   | Pins (with `replace`), unpins.                                                                                                             |
| `DELETE /posts/:id?player=`                             | Deletes a post or reply.                                                                                                                   |
| `POST /seen`, `POST /posts/:id/seen`                    | Marks a feed, or a thread, seen.                                                                                                           |
| `GET /notifications`, `POST /notifications/ack`         | The notification queue.                                                                                                                    |
| `PUT /announcers/:uuid`, `GET /announcers`              | The in-game command.                                                                                                                       |
| `GET /events`                                           | The `feed` topic as Server-Sent Events.                                                                                                    |

### For the browser

Under `/api/feed/`, signed in (`requireUser`), behind `feed`. Writes also need `feed.writing`. The answers are the server's, for the signed-in account: the post view, pages and threads have the same shapes, without `player` or `viewer` parameters.

| Route                                           | What it does                                                                                                                                                                                                                                                                       | Problems                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /me`                                       | `{ linked, banned, writing, rights, me, unread, accounts: [{ uuid, username }], postingAccount }`: `me` is the author block of the effective posting account (null without one), `accounts` the linked accounts to choose from, `postingAccount` the effective one's UUID or null. |                                                              |
| `PATCH /me`                                     | `{ "postingAccount": "<uuid>" }`: one of the caller's linked accounts.                                                                                                                                                                                                             | `notLinked` (404, not one of theirs)                         |
| `GET /posts?feed=&limit=&before=`               | A page of a feed: `{ feed, pinned, posts, next }`.                                                                                                                                                                                                                                 |                                                              |
| `GET /posts/:id?limit=&after=`                  | A thread.                                                                                                                                                                                                                                                                          | `notFound` (404)                                             |
| `POST /posts`                                   | `{ idempotencyKey, feed, text, anonymous }`, from the effective posting account. 201 `{ replayed, post }`.                                                                                                                                                                         | as the server's, `notLinked` (404) without a posting account |
| `POST /posts/:id/replies`                       | `{ idempotencyKey, replyTo, text, anonymous }`. 201 `{ replayed, post }`.                                                                                                                                                                                                          | as the server's                                              |
| `PUT /posts/:id/like`, `DELETE /posts/:id/like` | `{ id, likes, liked }`.                                                                                                                                                                                                                                                            | `notFound`, `notLinked`, `banned`, `rateLimited`, `disabled` |
| `DELETE /posts/:id`                             | Deletes the caller's own post or reply. 204. Moderators delete others' from the admin.                                                                                                                                                                                             | `notFound`, `notAllowed` (403, not theirs)                   |
| `POST /seen`                                    | `{ feed, upTo }`. 204.                                                                                                                                                                                                                                                             |                                                              |
| `POST /posts/:id/seen`                          | 204.                                                                                                                                                                                                                                                                               | `notFound`                                                   |

Pinning is in game only: announcers who aren't moderators can't open the admin, and the browser feed has no pin button in version 1. The browser has no live updates in version 1: a page shows what `GET /posts` returned when it loaded, and the reader reloads it to see newer posts.

### For the admin

Under `/api/feed/admin/`, moderators (`requireWardenAdmin`), never behind a flag. Every write records one audit action in its transaction.

| Route                                            | What it does                                                                                                                                                                                                                                                                                                                               | Audit                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `GET /posts?view=live\|deleted&feed=&q=&cursor=` | Main posts and replies, newest first, 50 per page, authors always shown (anonymous ones too). `view=deleted` lists deleted rows still kept, with `deletedAt`, `deletedBy` (`{ userId, name }` or null for the author), `deletedCause`, `deletedReason` and `purgeAt`. `q` searches the text, the author's name and the Minecraft username. |                                                    |
| `GET /posts/:id`                                 | A thread with every reply, deleted ones included and marked.                                                                                                                                                                                                                                                                               |                                                    |
| `POST /posts/:id/delete`                         | `{ "reason": "optional, at most 500" }`. Deletes as a moderator. 204, again for one already deleted.                                                                                                                                                                                                                                       | `minecraft.feed.delete`                            |
| `GET /announcers`                                | People with the `feed-announcer` role: `{ items: [{ userId, name, accounts: [{ uuid, username }] }] }`. Moderators are announcers by role and aren't listed.                                                                                                                                                                               |                                                    |
| `PUT /announcers/:userId`                        | `{ "announcer": true }`. `{ userId, announcer, viaRole }`. Problems: `notFound` (404), `impliedByRole`, `isGhost` (409).                                                                                                                                                                                                                   | `minecraft.feed.announcer` (only on a real change) |

The admin post shape is the post view without the viewer fields (`liked`, `mine`, `canDelete`, `canPin`, `unseenReplies`, `answersMe`), plus `author` always filled, `source`, `deletedAt`, `deletedBy`, `deletedCause`, `deletedReason` and `purgeAt`.

## Admin pages

Built after a mock is picked. The Moderation entry (Minecraft group) gets a **Feed** tab, `/admin/moderation/feed`, with a segmented switch, each part its own URL: Posts (`/admin/moderation/feed`), Deleted (`/admin/moderation/feed/deleted`) and Announcers (`/admin/moderation/feed/announcers`). A row opens its thread in a drawer, with Delete (a reason, optional) on each live post and reply. The Person page's Minecraft tab gets an "Announcer" switch for moderators. Ctrl K lists the three parts. The Home inbox gets nothing: deleting is the only moderation, and it needs no queue without a report button.

## Flags

| Flag             | Off means                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feed`           | Every Feed route but the admin's answers 503 `disabled`, the stream included; the browser page shows the 503 page and its menu entry hides. Nothing is deleted. Shipped off.                   |
| `feed.serverApi` | Only the Minecraft server's routes answer 503 (the game shows "Feed unavailable"); the browser keeps working.                                                                                  |
| `feed.writing`   | Posting, replying and liking answer 503, in game and in the browser (read-only mode for an incident). Deleting and pinning still work. `writing: false` in `GET /players/:uuid` and `GET /me`. |
| `jobs.feedPurge` | The nightly purge skips its run.                                                                                                                                                               |

Labels and descriptions go under `admin.flags.items` in both locales.

## Nightly purge

`feed:purge`, at 03:00 with the other prunes, behind `jobs.feedPurge`:

- deletes every post and reply whose `deleted_at` is older than 30 days (their likes, seen rows and notifications go with them by cascade; a reply that answered a purged one keeps its line through `reply_to_minecraft_username`);
- deletes `feed_notification` rows older than 30 days.

It records `minecraft.feed.purge` through `auditService.recordJob`, with the counts, only when something was removed.

## Account deletion, unlink and ban

- **Deleting an account** (by an admin, or `users:delete-inactive`) deletes its posts, replies and likes by cascade, so the threads of its main posts go too, with everyone's replies in them, as when an author deletes a post. Its seen state, posting account and notifications go as well. `feedService.forgetUsers(tx, userIds)`, called beside `changelogService.forgetUsers`, lists the posts and replies about to go before the delete, and after the commit sends `deleted`, `counts` and, if a pinned post went, `pins`. Replies by others that answered the deleted account keep no reply-to line (`reply_to_user_id` is set null, and `replyTo` is then null).
- **Unlinking** a Minecraft account keeps the posts made from it, which keep showing it. If it was the browser's posting account, the next linked one takes over; with none left, the person reads only. A `rights` event goes out for the unlinked account (Warden kicks it anyway when it is online).
- **A Warden or site ban** removes write, announce and moderate while it is in force; the person still reads in the browser (Warden ban) and still deletes their own posts. Banning, unbanning, changing a ban's end, a role change that touches `admin` or `warden-admin`, and the announcer role send a `rights` event with the person's Minecraft accounts, from `wardenBanService`, `usersService.setRoles`, `usersService.ban`/`unban` and `feedService`. A ban that ends on its own sends nothing; the mod re-reads a player's rights each time they open Feed, and before using a copy older than 5 minutes.

## Audit actions

In the `minecraft` area, so site admins and Warden admins read them. Added to `AuditAction`, to `docs/activity-log.md` and to both locales (`admin.activity.actions.minecraftFeedDelete`, and so on), and to the map of `test/unit/audit-coverage.test.ts`.

| Action                     | When                                                                          | Target            | `data`                                                         |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| `minecraft.feed.delete`    | A moderator deletes someone else's post or reply, from the admin or the game. | the author        | `postId`, `threadId`, `feed`, `reply`, `anonymous`, `reason`   |
| `minecraft.feed.pin`       | An announcer pins an announcement.                                            | the post's author | `postId`, `replaced` (the post unpinned to make room, or null) |
| `minecraft.feed.unpin`     | An announcer unpins one.                                                      | the post's author | `postId`                                                       |
| `minecraft.feed.announcer` | The announcer role is given or taken, from the admin or the game.             | the person        | `announcer`                                                    |
| `minecraft.feed.purge`     | The nightly purge removed something.                                          | none              | `posts`, `notifications`                                       |

Posting, replying, liking, reading and an author's own delete record nothing.

## Privacy

- What is stored about a player: their posts and replies with the Minecraft account they came from, their likes, which threads they opened and when they last viewed each feed, their browser posting account, and notifications waiting for them. Nothing about who read what besides that.
- All of it is deleted with the LNB account. Deleted posts are kept 30 days, readable by moderators only, then purged.
- The authors of anonymous posts are seen by moderators only, in game and in the admin (see "Anonymous posts and replies"). Moderators reading them leaves no trace; deleting one is audited.
- No analytics or tracking: no view counts, no read receipts.

## Code layout

Following `docs/architecture.md`: `server/db/schema/feed.ts`; `server/services/feed/` with `posts.ts` (create, reply, delete), `views.ts` (per-viewer views, pages, threads, cursors), `likes.ts`, `pins.ts`, `rights.ts`, `read-state.ts`, `notifications.ts`, `announcers.ts`, `admin.ts`, `events.ts` (the `feed` topic), `purge.ts` and `rules.ts` (pure: text, fingerprints, cursors); handlers under `server/api/feed/`, `server/api/feed/server/` and `server/api/feed/admin/`; `server/tasks/feed/purge.ts`; `shared/schemas/feed.ts` and `shared/utils/feed-text.ts`. Tests: the text vectors (unit), the services against PostgreSQL (rights, anonymity per viewer, pins, idempotency, deletion cascade, purge, read state, notifications), the OpenAPI and audit coverage tests.
