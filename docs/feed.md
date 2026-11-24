# Feed

A short-post feed for the LNB Minecraft server, read and written in game on the LNB Phone (the `lnbphone_feed` mod) and in the browser. Two feeds: **Announcements**, written by announcers, and **Global**, written by every player with a linked Minecraft account. Posts are plain text of at most 280 characters; anyone who can write may reply (one level deep) and like. The site stores everything and decides who may do what; the Minecraft server only asks and relays. This page is the feature on the site: rules, data, rights, routes, flags, limits, audit and privacy. The contract with the mod (every route under `/api/feed/server/`, the stream, test vectors) is [feed-mod.md](feed-mod.md); the mod's own design is `docs/feed-app.md` in the LNB-phone-mod repository. The three agree field for field.

Status: specified and validated by the owner. The server side is built: the tables, the text rule, the services (the browser's and the admin's included), every route of the Minecraft server under `/api/feed/server/` with its stream, the flags, limits, role, audit actions, nightly purge, and the hooks in account deletion, bans, roles and unlinks. The browser's routes under `/api/feed/` and the Feed page (`/minecraft/feed` and `/minecraft/feed/:id`) are built too, and were checked in headless Chromium against a dev server, not by a person. So are the admin's routes under `/api/feed/admin/`, the Feed tab of Moderation (`/admin/moderation/feed`) and the announcer switch of the Person page, checked the same way (dark and light, French and English, a Warden admin and a site admin, refused to a player and an events manager). The browser's live updates are built too (`feed.live`, `GET /views`, `GET /events`, the hub in `server/services/feed/live.ts` and `useFeedLive`), and were checked the same way with two people signed in at once (see "Live updates in the browser", which also lists where the build differs from the first text). The mocks are picked (proposition A for the Feed page, M1 for moderation, in `feed-web-mocks.html`): see "Pages".

## Decisions

Taken with the owner on 2026-11-23, including the choices this page proposed where those were silent, which the owner then accepted (marked "chosen").

- **Who reads.** In the browser, signed-in LNB accounts only. In game, every player on the server, guests included (players without an LNB account, possible when Warden runs in `optional` mode).
- **Who writes.** Posting, replying and liking need a linked Minecraft account (`minecraft_account` with `unlinked_at` null), in game and in the browser, and no Warden ban or site ban in force. Guests and banned accounts read only.
- **Moderators** are the site's `admin` and `warden-admin` roles, never the Minecraft op level. They delete any post or reply, and see who wrote an anonymous one, in game and in the admin.
- **Announcers** are a new site role, `feed-announcer`, given or taken by any moderator, from the admin or by an in-game command that calls the site. Moderators are announcers too. Announcers post in Announcements and pin announcements, in game and in the browser.
- **Anonymous posts** are allowed everywhere: a Global post, an announcement, any reply. An anonymous announcement shows "Anonymous" with no handle and no badge, like any anonymous post, and its notification reads "Anonymous: …".
- **Deleting** hides a post from everyone at once. Deleting a main post deletes its replies. The rows stay 30 days for moderators, then the nightly purge removes them. Nothing is restored, from the app or the admin (chosen: no restore button in version 1, so "deleted" means the same thing to the author and to moderators).
- **Names.** A post shows its author's current name setting, never the one at posting time: the first name and initial (`Charles M.`) when the player shows their real name in Warden, otherwise the Minecraft username alone.
- **Account deletion** deletes the account's posts, replies and likes.
- **Notifications** are in game only: a new announcement notifies every player, a reply notifies the author of what it answers, nobody is notified of their own action. No browser notifications, no push.
- **Plain text.** No editing, links, mentions, hashtags or media. No report button.
- **Several Minecraft accounts.** In the browser, the person chooses which linked account they post from in the composer at the top of the Feed page; the site remembers it as their setting until they change it, and their replies use it too. In game, a post or reply carries the account the player is playing on (chosen).
- **The browser** reads, posts, replies, likes, pins (announcers) and deletes its own posts and replies. It gets live updates (new posts, deletions, counts, pins), built as the last website task and behind their own flag part, so they can slip without touching the rest (see "Live updates in the browser").
- **The badge follows the role** (chosen). The announcer badge shows on posts and replies whose author is an announcer now, like the name follows the current setting. An announcement by someone who is no longer an announcer loses its badge.
- **The site works out every recipient** (chosen). Notifications wait in a queue on the site until the Minecraft server takes them, so a reply made in the browser while the server is down still reaches the player when it comes back.
- **Read state lives on the site** (chosen), per LNB account: which posts of each feed were seen and which threads were opened. The unread dots and the unseen-replies markers are then right after a restart, and the same in the browser and in game.
- **Flag.** `feed`, shipped **off** (seeded as a disabled row by the migration, as the Market's flags are), with parts `feed.serverApi`, `feed.writing` and `feed.live`, and `jobs.feedPurge` for the nightly purge. `feed.live` is seeded off too (decided on 2026-11-24), so switching `feed` on doesn't switch live updates on: the owner opens them after checking his proxy (see "Before switching it on").
- **Looks.** The site keeps its own neutral styles for likes, the announcer badge and unseen replies, as the mock shows, not the phone's coral and violet.

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

Any post can be anonymous: a Global post, an announcement, a reply in either feed. An anonymous post is shown with `anonymous: true` and `author: null` to everyone except two viewers, who get the `author` object:

- its author (the same LNB account, from any of its Minecraft accounts or the browser), with `mine: true`;
- moderators.

With `author` null there is no handle and no announcer badge, so an anonymous announcement looks like any anonymous post (only its place in Announcements says an announcer wrote it). No route, stream event, payload or log line carries the author of an anonymous post to anyone else. The `replyTo` of a reply that answers an anonymous one carries `anonymous: true` and no name, for moderators too (the private line on the anonymous post itself is where they read its author). Two places necessarily know more, and both are trusted: the site itself, and the Minecraft server, which holds `WARDEN_SERVER_SECRET`. The server learns the author of an anonymous post or reply in three cases only: a reply notification names the players to notify, who are the author of what was answered; an announcement notification names the players to leave out, who are its author's accounts; and a per-viewer answer for a moderator or for the author carries the author. The mod forwards those to that viewer's client only and never logs them ([feed-mod.md](feed-mod.md), "Privacy").

## Rights

The site decides every right on every request. Clients and the mod only use rights to choose what to show.

| Right      | Who                                                               | Covers                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| read       | everyone, while the `feed` flag is on (signed in, in the browser) | both feeds, threads                                                                                                                                     |
| write      | a linked Minecraft account, no Warden ban or site ban in force    | posting in Global, replying anywhere, liking                                                                                                            |
| announce   | write, and the `feed-announcer`, `warden-admin` or `admin` role   | posting in Announcements, pinning and unpinning announcements                                                                                           |
| moderate   | the `warden-admin` or `admin` role, no ban in force               | in game: deleting any post or reply, seeing anonymous authors, granting the announcer role by command                                                   |
| admin      | the `warden-admin` or `admin` role                                | the admin's Feed tab and the announcer switch: reading every row and anonymous author, deleting any post or reply, giving and taking the announcer role |
| delete own | the author, whatever their ban                                    | deleting their own posts and replies, anonymous ones included                                                                                           |

- A Warden ban (`warden_ban` in force) or a site ban (`user.banned` with no end, or an end in the future) removes write, announce and moderate, in game and on the Feed page. In game a Warden-banned player can't be online; in the browser a site-banned person can't sign in, so in practice this is a Warden ban seen in the browser.
- The admin (`/api/feed/admin/*`, the Feed tab of Moderation and the Person page's switch) follows the role alone, as the rest of the admin does: a Warden-banned Warden admin keeps every Warden page (bans, notes, appeals, People, the activity log), so they also keep the Feed tab, its deletes and the announcer switch. Whether a Warden ban should suspend a Warden admin's access to the admin, site-wide, is an open question for the site's owner.
- The `feed.writing` flag off makes posting, replying and liking answer 503 `disabled`, for everyone. Deleting and pinning still work, so moderation never stops.
- Roles live in `user.role`, as for the other roles. `shared/utils/roles.ts` gets `FEED_ANNOUNCER_ROLE = 'feed-announcer'`, `isFeedModerator(role)` (`isWardenAdmin`) and `isFeedAnnouncer(role)` (`isFeedModerator(role) || hasRole(role, FEED_ANNOUNCER_ROLE)`). `server/lib/auth.ts` lists the role with no Better Auth rights, like `economy-admin`. The People list's `hasRole` filter and `role` choices include it. `setRoles` (`PUT /api/admin/users/:userId/roles`) keeps it, as it keeps any role it does not set.

### Granting the announcer role

- **From the admin:** moderators (admin and Warden admins) switch "Feed announcer" on a person's Minecraft tab (`/admin/people/:userId/minecraft`); the person's header then shows an "Announcer" pill. `PUT /api/feed/admin/announcers/:userId` with `{ "announcer": true }`.
- **From the game:** `/feed announcer add <username>` and `remove`, run by a moderator in game or from the server console. The mod calls `PUT /api/feed/server/announcers/:uuid` with an `issuer`, as Warden's bans do: the site refuses the change (403 `issuerNotAllowed`) unless the issuer is a linked Minecraft account whose LNB account has the moderate right. Without an `issuer` the change comes from the console, which the mod only allows for a permission level of 4 (the console, not command blocks).
- Giving the role to a moderator changes nothing (it is implied); taking it from one is refused (409 `impliedByRole`). A ghost account can't get it (409 `isGhost`). Each real change is audited as `minecraft.feed.announcer` and sends a `rights` event.

## Feeds, threads and posts

- **Announcements**: main posts by announcers, newest first, after the **pinned** group: at most 3 pinned announcements, the most recently pinned first. Pinned posts are not repeated in the list below them.
- **Global**: main posts by every writer, newest first. Global posts can't be pinned.
- **A thread** is a main post and its replies, oldest first, one level deep. A reply answers the main post or another reply of the same thread (`replyTo`). Replying to a reply adds it to the same thread, with a reply-to line naming whom it answers.
- **Counts.** `likes` is the number of likes. `replies` is, on a main post, the replies in its thread, and on a reply, the replies that answer it directly. Deleted replies don't count.
- **Liked.** `liked` says whether the viewer's LNB account liked the post. One like per account and post, whatever Minecraft account it was given from. A player may like their own post.

### Pinning

Announcers pin and unpin any announcement, from the feed or from its thread, in game and on the browser's Feed page. Pinning sets `pinned_at`; the pinned group is ordered by it.

- Pinning when fewer than 3 are pinned: the post joins the group.
- Pinning when 3 are pinned: refused with 409 `pinLimit`, naming the oldest pin (`data.oldest`), unless the request says `replace: true`; then the oldest pin is unpinned and the post pinned, in one transaction. This is the art direction's "Replace a pin?" dialog.
- Pinning a pinned post, or unpinning a post that isn't pinned, changes nothing and answers the current pins.
- Pinning a reply, or a Global post, is `notPinnable` (409). Unpinning one changes nothing, like any post that isn't pinned.
- Deleting a pinned post unpins it.

Each pin and unpin is audited (`minecraft.feed.pin`, `.unpin`) and sends a `pins` event with the whole group.

### Deleting

| Who                              | What                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| The author                       | their own posts and replies, anonymous ones included, even while banned |
| Moderators                       | any post or reply                                                       |
| Announcers who aren't moderators | their own only, like any player                                         |

- Deleting sets `deleted_at` on the row. Deleting a main post sets it on every reply of its thread too (`deleted_cause = 'thread'`), and unpins it. Replies that answered a deleted reply stay; their reply-to line keeps naming whom they answered.
- A deleted post or reply is **absent** for players, in game and in the browser: it leaves every list and count, and reading it, its thread, or acting on it answers 404 `notFound`. Moderators see the same thing in game and on the Feed page; only the admin's Feed table shows deleted rows (dimmed), with who deleted them, when, and when they will be purged.
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

Creating a post or a reply takes an `idempotencyKey` (a UUID), in game and in the browser. The same key with the same request returns the first post with `replayed: true` and creates nothing; the same key with any other request (another requester, feed, thread, target, text or anonymous flag) is 409 `idempotencyMismatch`. The requester is the Minecraft account in game and the LNB account in the browser, not the browser's posting account: a retry from the browser after "Change account" replays the post made from the earlier account rather than posting from the new one. The key is checked before anything else but the flags. A key whose post has since been deleted answers 404 `notFound`, whatever the request: the post existed, so the client stops retrying. Calls with the same key wait for each other (a lock on the key, in the transaction that creates), so a retry sent while the first call runs replays its post, whatever the rate limits say. Likes, pins and deletes need no key: doing them twice leaves the same state.

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

Each LNB account keeps, per thread it opened, when it last opened it (`feed_thread_seen`). `unseenReplies` is the number of replies, on a post or reply of the viewer, that answer it, are not deleted, are not by the viewer, and are newer than the viewer's last opening of that thread (0 otherwise, and always 0 on someone else's post). On a main post in a feed, it counts replies to the post and to the viewer's replies inside its thread: the marker (the phone's dot, the site's "2 new" pill) shows on the card until the thread is opened. A thread's answer computes the markers first; the client then marks the thread seen (`POST .../posts/:id/seen`). A reply also carries `answersMe`, true when it answers a post or reply of the viewer's account and is not the viewer's own (a reply to oneself raises no marker, as markers never count one's own replies), so a client can raise the marker when such a reply arrives live.

### Notifications

The site creates one row in `feed_notification` per notification, in the transaction that creates the post:

- a new **announcement**: one row for everyone (`recipient_user_id` null), with the author's accounts excluded at delivery;
- a new **reply**: one row for the author of what it answers (the main post, or the reply named in `replyTo`), unless that is the replier's own account.

The Minecraft server takes the rows (`GET /api/feed/server/notifications`), delivers them with `PhoneNotifications` (every linked Minecraft account of the recipient for a reply; for an announcement, every player of the world but the author's accounts, through the phone's `sendToEveryone` with an `except` list), and acknowledges them, which deletes them. It drains the queue at start, at each reconnection of the stream, on each `notification` event and every 5 minutes. A reply made in the browser while the server is down waits in the queue. An anonymous announcement's notification reads "Anonymous: …" (its `post.author` is null in the queue, as everywhere); only the `except` list, which the Minecraft server never shows anyone, names its author's accounts. Rows deleted with their post are never delivered; rows older than 30 days (the phone's own lifetime) are purged unsent. Likes and new Global posts notify nobody.

## Data

In `server/db/schema/feed.ts`. Every timestamp is `timestamp` without time zone, in UTC, like the rest of the schema. The times the API sends back and later compares are stored to the millisecond (`timestamp(3)`), as JSON carries them: `feed_post.created_at` (cursors and the `upTo` of a seen mark), `pinned_at` and `deleted_at`, and the seen times of `feed_member` and `feed_thread_seen`. A row written outside the app can then neither keep a dot unread nor be skipped by paging.

### `feed_post`

Main posts and replies.

| Column                        | Type                                               | Notes                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | `uuid` PK, random                                  |                                                                                                                                                                                                                                         |
| `feed`                        | `text` not null                                    | `announcements` or `global`. A reply has its thread's feed.                                                                                                                                                                             |
| `thread_id`                   | `uuid` null, FK `feed_post.id`, on delete cascade  | Null for a main post; the main post for a reply.                                                                                                                                                                                        |
| `reply_to_id`                 | `uuid` null, FK `feed_post.id`, on delete set null | The reply this reply answers. Null when it answers the main post.                                                                                                                                                                       |
| `reply_to_user_id`            | `text` null, FK `user.id`, on delete set null      | The author of what it answers (main post or reply), for notifications and markers. Never sent to clients.                                                                                                                               |
| `reply_to_anonymous`          | `boolean` not null, default false                  | Whether what it answers was anonymous.                                                                                                                                                                                                  |
| `reply_to_minecraft_username` | `text` null                                        | On a reply to a reply only: that reply's username, for the reply-to line once that row is purged. Null on a reply to the main post, which tells the two apart once `reply_to_id` is null (a purged main post takes its thread with it). |
| `author_user_id`              | `text` not null, FK `user.id`, on delete cascade   |                                                                                                                                                                                                                                         |
| `minecraft_uuid`              | `uuid` not null                                    | The Minecraft account it was posted from. No foreign key: unlinking or a takeover keep it.                                                                                                                                              |
| `minecraft_username`          | `text` not null                                    | That account's username.                                                                                                                                                                                                                |
| `source`                      | `text` not null                                    | `server` (the game) or `site` (the browser).                                                                                                                                                                                            |
| `text`                        | `text` not null                                    | Cleaned, 1 to 280 code points.                                                                                                                                                                                                          |
| `anonymous`                   | `boolean` not null, default false                  |                                                                                                                                                                                                                                         |
| `like_count`                  | `integer` not null, default 0                      | Kept in the transaction that likes or unlikes.                                                                                                                                                                                          |
| `reply_count`                 | `integer` not null, default 0                      | Kept in the transactions that reply and delete (see Counts).                                                                                                                                                                            |
| `pinned_at`                   | `timestamp` null                                   | Announcements' main posts only.                                                                                                                                                                                                         |
| `pinned_by_user_id`           | `text` null, FK `user.id`, on delete set null      |                                                                                                                                                                                                                                         |
| `created_at`                  | `timestamp` not null, default now                  |                                                                                                                                                                                                                                         |
| `deleted_at`                  | `timestamp` null                                   |                                                                                                                                                                                                                                         |
| `deleted_by_user_id`          | `text` null, FK `user.id`, on delete set null      |                                                                                                                                                                                                                                         |
| `deleted_cause`               | `text` null                                        | `author`, `moderator` or `thread` (its main post was deleted).                                                                                                                                                                          |
| `deleted_reason`              | `text` null                                        | A moderator's reason from the admin, at most 500 characters.                                                                                                                                                                            |
| `idempotency_key`             | `uuid` not null, unique                            |                                                                                                                                                                                                                                         |
| `fingerprint`                 | `text` not null                                    | SHA-256 of the request, as the quests' `hashRequest`.                                                                                                                                                                                   |

Checks: `char_length(text) between 1 and 280` (PostgreSQL counts code points in UTF-8); `feed in ('announcements', 'global')`; `pinned_at` only on an announcement's main post (`pinned_at is null or (thread_id is null and feed = 'announcements')`); `reply_to_id` only on a reply.

Indexes: the feeds, `(feed, created_at desc, id desc) where thread_id is null and deleted_at is null and pinned_at is null`; threads, `(thread_id, created_at, id)`; `(pinned_at) where pinned_at is not null`; `(author_user_id, created_at)`; markers, `(reply_to_user_id, thread_id)`; replies to a reply, `(reply_to_id)`; `(pinned_by_user_id)` and `(deleted_by_user_id)`; the purge, `(deleted_at) where deleted_at is not null`. Every foreign key leads a plain index (none partial), since a cascade looks up the referencing rows for each row it deletes or sets to null: without them, deleting one account scanned `feed_post` once per post.

### `feed_like`

| Column       | Type                                         | Notes |
| ------------ | -------------------------------------------- | ----- |
| `post_id`    | `uuid`, FK `feed_post.id`, on delete cascade |       |
| `user_id`    | `text`, FK `user.id`, on delete cascade      |       |
| `created_at` | `timestamp` not null, default now            |       |

Primary key `(post_id, user_id)`; index `(user_id)`.

### `feed_member`

One row per LNB account that used Feed, created on first need.

| Column                                    | Type                                                         | Notes                                                  |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `user_id`                                 | `text` PK, FK `user.id`, on delete cascade                   |                                                        |
| `posting_minecraft_uuid`                  | `uuid` null, FK `minecraft_account.uuid`, on delete set null | The browser's posting account, chosen in the composer. |
| `announcements_seen_at`, `global_seen_at` | `timestamp` null                                             | See "Unread dots".                                     |
| `updated_at`                              | `timestamp` not null, default now                            |                                                        |

Index `(posting_minecraft_uuid)`, for its foreign key.

The **effective posting account** is `posting_minecraft_uuid` while it is linked to this account, otherwise the account's earliest-linked account that is still linked, otherwise none (the person can't write). Browser posts and replies carry it; the row is written the first time the person picks an account in the composer (`PATCH /api/feed/me`) and kept until they pick another.

### `feed_thread_seen`

| Column      | Type                                         | Notes |
| ----------- | -------------------------------------------- | ----- |
| `user_id`   | `text`, FK `user.id`, on delete cascade      |       |
| `thread_id` | `uuid`, FK `feed_post.id`, on delete cascade |       |
| `seen_at`   | `timestamp` not null                         |       |

Primary key `(user_id, thread_id)`; index `(thread_id)`, for its foreign key.

### `feed_notification`

| Column              | Type                                                  | Notes                                |
| ------------------- | ----------------------------------------------------- | ------------------------------------ |
| `id`                | `uuid` PK, random                                     |                                      |
| `kind`              | `text` not null                                       | `announcement` or `reply`.           |
| `post_id`           | `uuid` not null, FK `feed_post.id`, on delete cascade | The announcement, or the reply.      |
| `recipient_user_id` | `text` null, FK `user.id`, on delete cascade          | Null for an announcement (everyone). |
| `created_at`        | `timestamp` not null, default now                     |                                      |

Indexes `(created_at)`, and `(post_id)` and `(recipient_user_id)` for the foreign keys. Acknowledged rows are deleted.

### Stream topic

`MinecraftTopic` (`server/services/minecraft-events.ts`) and the `topic` column type of `minecraft_server_event` get `'feed'`. Events are recorded after the transaction commits and never fail the change, as for the other topics; `minecraft:prune-events` already deletes them after 24 hours. None carries an anonymous author or a per-viewer field; their data is in [feed-mod.md](feed-mod.md), section 8. The browser's live stream reads the same rows, the first four types only (see "Live updates in the browser").

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
  "unseenReplies": 0,
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

Under `/api/feed/`, signed in (`requireUser`), behind `feed`. Writes also need `feed.writing`. The answers are the server's, for the signed-in account: the post view, pages and threads have the same shapes, without `player` or `viewer` parameters. One difference: `canDelete` is true on the viewer's own posts only, moderators included, since they delete other people's from the admin. The services check `feed.writing` themselves, so a route can't forget it.

| Route                                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                              | Problems                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /me`                                       | `{ linked, banned, banExpiresAt, writing, rights, me, unread, accounts: [{ uuid, username }], postingAccount }`: `banExpiresAt` the end of the Warden ban in force (null when permanent or not banned), for the banned band; `me` the author block of the effective posting account (null without one); `accounts` the linked accounts to choose from in the composer; `postingAccount` the effective one's UUID or null. |                                                                                                                             |
| `PATCH /me`                                     | `{ "postingAccount": "<uuid>" }`: one of the caller's linked accounts, from the composer's account menu. Remembered until changed. Answers as `GET /me`.                                                                                                                                                                                                                                                                  | `notLinked` (404, not one of theirs)                                                                                        |
| `GET /posts?feed=&limit=&before=`               | A page of a feed: `{ feed, pinned, posts, next }`.                                                                                                                                                                                                                                                                                                                                                                        |                                                                                                                             |
| `GET /posts/:id?limit=&after=`                  | A thread.                                                                                                                                                                                                                                                                                                                                                                                                                 | `notFound` (404)                                                                                                            |
| `POST /posts`                                   | `{ idempotencyKey, feed, text, anonymous }`, from the effective posting account. 201 `{ replayed, post }`.                                                                                                                                                                                                                                                                                                                | as the server's, `notLinked` (404) without a posting account                                                                |
| `POST /posts/:id/replies`                       | `{ idempotencyKey, replyTo, text, anonymous }`, from the effective posting account. 201 `{ replayed, post }`.                                                                                                                                                                                                                                                                                                             | as the server's                                                                                                             |
| `PUT /posts/:id/like`, `DELETE /posts/:id/like` | `{ id, likes, liked }`.                                                                                                                                                                                                                                                                                                                                                                                                   | `notFound`, `notLinked`, `banned`, `rateLimited`, `disabled`                                                                |
| `PUT /posts/:id/pin`, `DELETE /posts/:id/pin`   | Announcers. `PUT` takes `{ "replace": false }` (optional). Both answer `{ pinned: [{ id, pinnedAt }], unpinned }`, with the server's rules (3 pins, `replace`, no change answered as the current group). Audited as `minecraft.feed.pin` and `.unpin`, from the site. Not behind `feed.writing`.                                                                                                                          | `notFound`, `notLinked` (404), `banned`, `notAllowed` (403); `PUT` only: `notPinnable`, `pinLimit` with `data.oldest` (409) |
| `DELETE /posts/:id`                             | Deletes the caller's own post or reply. 204, again for one already deleted. Moderators delete others' from the admin.                                                                                                                                                                                                                                                                                                     | `notFound`, `notAllowed` (403, not theirs)                                                                                  |
| `POST /seen`                                    | `{ feed, upTo }`. 204.                                                                                                                                                                                                                                                                                                                                                                                                    |                                                                                                                             |
| `POST /posts/:id/seen`                          | 204.                                                                                                                                                                                                                                                                                                                                                                                                                      | `notFound`                                                                                                                  |
| `GET /views?ids=`                               | The caller's views of 1 to 20 distinct posts or replies (comma-separated IDs; a repeat is a plain 400): `{ posts: [view] }`, deleted or unknown ones left out. For live updates.                                                                                                                                                                                                                                          |                                                                                                                             |
| `GET /events`                                   | The live stream, behind `feed.live` too: see "Live updates in the browser".                                                                                                                                                                                                                                                                                                                                               | `disabled` (503), `tooManyStreams` (429)                                                                                    |

Browser writes go through the rate limits above and the `write` rule. Without the live stream (before it is built, or with `feed.live` off), a page shows what it loaded and the reader reloads it to see newer posts; everything else works the same.

### Live updates in the browser

Built last, as its own task, and switched by its own flag part, `feed.live`: leaving it out, or switching it off, changes nothing else. It reuses the `feed` topic of `minecraft_server_event`, which the Minecraft server already reads.

**The stream.** `GET /api/feed/events`, for signed-in accounts (`requireUser`), behind `feed` and `feed.live`, as Server-Sent Events. It sends only the public events, with exactly the data of the server's stream: `post` `{ id, feed, threadId, createdAt }`, `deleted` `{ items: [{ id, feed, threadId }] }`, `counts` `{ items: [{ id, likes, replies }] }` and `pins` `{ pinned: [{ id, pinnedAt }] }`. Never `rights` or `notification`, and nothing per viewer. Each event's `id` is the row's ID. Two events of its own: `ping` `{}` after 25 quiet seconds, and `reset` `{}` when the page must reload what it shows (below).

**One poller for every tab.** The site is one container without Redis, so the browser connections share one in-process hub, `server/services/feed/live.ts`:

- The hub polls `minecraft_server_event` for topic `feed` once a second **only while at least one browser connection is open**, from the last ID it saw (`minecraftEventService.since`), and keeps the four public types in a ring buffer of the last 500 events. A tab costs no query of its own: the hub pushes each new event to every open connection.
- Connections register with the hub on open and leave on close; the poll loop stops when the last one leaves and starts again, from the newest ID, with the next one.
- `Last-Event-ID` on reconnection: the hub replays the buffered events after it. An ID older than the buffer, or unknown, gets a `reset` event first: the page reloads its first page (and its thread) and merges it.
- Limits: 5 open streams per account and 500 in all; past either, 429 `tooManyStreams` (the page then works without live updates). The stream is not counted by the per-IP `api` rule beyond its opening request.

**Sign-out and flags.** Every 60 seconds, and at each ping, the connection checks that its session still exists (`getAuthSession`) and closes when it doesn't; a page that reconnects signed out gets 401 and stops. The hub reads `feed` and `feed.live` through `flagService` (its 10-second cache) at each poll; when either is off, it closes every connection, and a reconnection gets 503 `disabled`. A 503 or a 429 makes the page stop retrying and fall back to "reload to see newer posts"; a dropped connection retries with a backoff from 1 to 30 seconds (the `EventSource` default, capped by the page's composable).

**What the page does with each event** (`useFeedLive`, one `EventSource` per tab, opened only on `/minecraft/feed` and `/minecraft/feed/:id`):

- `post`: the page asks `GET /api/feed/views?ids=` for its own view, gathering the `post` events of one second into one call. A main post of the feed on screen goes to the top when the list is scrolled to the top, otherwise behind a "N new posts" pill, as in game; a main post of the other feed sets that tab's dot unless it is `mine`. A reply goes to the end of its thread when that thread is open, and raises the marker of its main post when `answersMe`.
- `deleted`: the rows leave the page; on a thread page whose main post went, the page says "This post was deleted" with a link back to the feed.
- `counts`, `pins`: applied as they come.
- `reset`: the page reloads its first page (or its thread) and merges it, as on a reconnection.

Writes made from the same tab already show their answer; the matching `post` event is ignored when the post is already on the page.

**As built.** Where the build adds to or differs from the text above:

- **Headers and pings.** h3 sends `Content-Type: text/event-stream`, `Cache-Control: private, no-cache, no-store, no-transform, must-revalidate, max-age=0`, `X-Accel-Buffering: no` and, on HTTP/1.1, `Connection: keep-alive`, as for the Minecraft server's stream. A `ping` also goes out at opening (when nothing is replayed), so the response starts at once: Node sends no headers before the first write, and a client would otherwise wait up to 25 seconds to know it is connected. A `ping` carries as its `id` the last event ID the hub read (any type), since the tab has every public event up to it: a tab that has seen no event yet then reconnects with a `Last-Event-ID` too and misses nothing in between.
- **The page reads the stream with `fetch`, not `EventSource`.** `EventSource` can't read a refusal's status or body, and it resends `Last-Event-ID` only on the reconnections it makes itself, at its own fixed delay. `useFeedStream` reads the same wire format from a streaming `fetch`. The server side doesn't care which client reads it.
- **Which refusals stop the page.** Unlike the first text ("a 503 or a 429 makes the page stop"), the page reads the refusal's JSON body: it stops for good only on 401, 403 and a 503 whose `data.problem` is `disabled` (a flag off). On `tooManyStreams` it tries again 1, 2, 4, then 10 minutes later (each between half and all of it). Anything else, a proxy's bare 502 or 503 during a deploy, the per-IP rule's 429 or a dropped connection, comes back after a wait: the first anywhere up to a second (at least 0.1, so tabs dropped together by a restart don't return together), then between half and all of 2, 4, 8, 16 and 30 seconds, sending the last event's ID. A message the page can't read (malformed JSON, a list that isn't one) is skipped; the page lets go of a connection it stopped reading before it opens another.
- **Hidden tabs.** A tab hidden for 60 seconds drops its stream and takes it again with `Last-Event-ID` when shown (replayed, or `reset` past 500 events); a tab opened in the background opens it when first shown. This keeps background tabs from holding connections, which over HTTP/1.1 share the browser's six per site with every other request.
- **A client that stops reading** (a sleeping laptop, a dead network) is closed once more than 64 KiB wait for it: h3 writes to the socket without waiting, so Node would otherwise keep every event for it.
- **The database briefly away.** The hub keeps the streams open and pings them, logs once, and reads on from where it was when the database is back; a session check that fails (rather than finding no session) keeps the stream open. A read that never ends (a pool connection stuck on a dead socket, which no error ends) is given up after 30 seconds: the hub starts a new loop from the newest event, keeps the streams open, and sends them `reset` once for that stuck spell, so the pages read themselves again for what was missed; whatever the stuck read may still bring back is dropped.
- **The first opening starts where the page was read.** `GET /api/feed/posts` and `GET /api/feed/posts/:id` send `X-Feed-Event-Id`, the newest event of the topic read before the data (every change has its event after it commits, so the page holds everything up to that ID). The page keeps it through the server render (`useFeedEventId`) and sends it as `Last-Event-ID` at the stream's first opening: what came since is replayed, or, past the buffer or from before the hub started, `reset` makes the page read itself again and merge. A tab opened in the background and shown hours later catches up the same way, and nothing already shown is shown twice.
- **An account at its cap of 5** doesn't get 429 for a sixth stream: its oldest stream gets a last event, `closed` `{ "problem": "tooManyStreams" }`, and is closed in its favour. A stream whose client vanished without closing (a laptop asleep, a network change) would otherwise hold its place until TCP gives up, since pings fit in the kernel's buffer. A page whose stream is closed this way tries again only minutes later, as for `tooManyStreams`. The total cap of 500 still answers 429.
- **How long a switch-off takes.** The hub reads `feed` and `feed.live` through the flag cache at each read of events, and on the side at each tick while a read is slow, so open streams close within the cache's 10 seconds and a second, whatever a read does. While the database itself can't be reached, the flags can't be read once the cache has expired, and the switch, which writes to the database, can't be made either.
- **The composables** are `useFeedTimelineLive` (the Feed page) and `useFeedThreadLive` (a thread), in `app/composables/useFeedLive.ts`, over `useFeedStream`; the pure parts (the reader, the delay, the merges of a `reset`) are in `app/utils/feed-live.ts`. A page opens no stream while the flags it loaded say `feed.live` is off.
- **The "N new posts" button** is a neutral solid pill, sticky under the header at the top of the list, with an up arrow only when the place of the new posts is above what the reader sees (as in game); a click lets them in and scrolls to the first, and scrolling there by hand does the same. On Announcements it says "N new announcements". A new post counts as shown when its place, under the pinned group, is in view with room for a post. A new post is inserted with no highlight (the site's motion rules allow motion only in answer to the reader).
- **Counts** come only from `counts` events: a reply or a deletion that arrives live adds or removes its row without touching the counts, so the two events can't count it twice.
- **`feed.live` ships off**: the migration seeds it as a disabled row, like `feed`, so switching `feed` on leaves live updates off until the owner switches them on (2026-11-24). The row was appended to `0064_feed.sql` without a new migration: a database that had already applied 0064 (a development one) doesn't get it, since Drizzle doesn't run a migration twice, and has `feed.live` on until it is switched off in the admin.

**Before switching it on.** `feed.live` ships off. Before the owner switches it on in `/admin/settings/flags`:

- **The proxy's read timeout on long responses.** Traefik, Coolify's default proxy, has given its entry points a 60-second `respondingTimeouts.readTimeout` since 2.11.2, and community reports say it cuts long responses at that mark. Unless the HTTPS entry point sets it to 0 (or a long value), every stream is cut each minute, the Minecraft server's stream included. Pages and the mod come back by themselves with `Last-Event-ID`, so nothing is lost, but each tab then makes a request, a session check and a replay every minute.
- **HTTP/2 between browsers and the proxy.** Over HTTP/1.1 a browser opens about six connections per site and each open stream holds one; over HTTP/2 they share one connection. Traefik offers HTTP/2 on TLS by default: check that the site is served with it (the browser's network panel shows `h2`).
- **What the proxy answers during a deploy.** Pages give up for good only on 401, 403 and the site's own 503 `disabled` (its JSON body says so); a proxy's bare 502 or 503 makes them try again with a backoff. Check that a deploy answers one of those, not a 200 HTML page or a 404, which would leave pages retrying.
- **No buffering or compression on the stream.** The response carries `Cache-Control: no-transform` and `X-Accel-Buffering: no`; a compression or buffering middleware added in front of the site must leave `text/event-stream` alone, or events arrive late, in bursts.
- **One real deploy watched with a few tabs open**, signed in as two people: posts appear in the other tab, the tabs come back after the deploy without a reload, and the server's log shows no stream errors.

**For the owner, from the review.**

- **The "new posts" button is a solid neutral pill**, a button variant `docs/design.md` didn't list before. It is documented there and on `/styleguide`, and needs the owner's approval as a design change.
- **A page left open keeps its session alive.** Each session check (every 60 seconds, and at each ping) goes through Better Auth's `getSession`, which slides the session's expiry like any request, so a Feed tab left open never lets its session expire.
- **A limit of the site's event table, not of this feature.** The streams read `minecraft_server_event` by increasing ID. A row whose transaction commits after a row with a higher ID was already read (two writes committing out of order) is never read by any cursor, the Minecraft server's included. Feed records its events after its transactions commit, one insert each, which keeps the window to concurrent inserts committing out of order; fixing it for every topic belongs to the event table.

### For the admin

Under `/api/feed/admin/`, the `admin` and `warden-admin` roles (`requireWardenAdmin`), by role alone, a ban in force included (see Rights), never behind a flag. Every write records one audit action in its transaction.

| Route                                                             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Audit                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GET /posts?q=&feeds=&replies=&anonymous=&deleted=&user=&cursor=` | The table: main posts and replies, newest first, 50 per page, live and deleted ones (still kept) together, authors always shown (anonymous ones too). Filters, all optional and combined: `q` searches the text, the author's name and the Minecraft username (2 characters at least); `feeds` is `announcements`, `global` or both (comma-separated, both by default); `replies=true` keeps only replies; `anonymous=true` only anonymous rows; `deleted=true` only deleted rows; `user` one author's LNB account. Answers `{ items, nextCursor, summary: { last30Days, deleted } }`: `summary` counts the rows matching the filters in the last 30 days, and how many of them are deleted. |                                                    |
| `GET /posts/:id`                                                  | One row for the drawer, `{ post, thread: { post, replies } }`: the row, and its whole thread (the main post and every reply, deleted ones included and marked).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                    |
| `POST /posts/:id/delete`                                          | `{ "reason": "optional, at most 500" }`. Deletes as a moderator. 204, again for one already deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `minecraft.feed.delete`                            |
| `GET /announcers/:userId`                                         | `{ userId, announcer, viaRole }`, for the Person page's switch and its header pill: `announcer` is the role (held, or implied by a moderator role), not the right, so a banned or unlinked announcer still shows on and can be turned off.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                    |
| `PUT /announcers/:userId`                                         | `{ "announcer": true }`. `{ userId, announcer, viaRole }`. Problems: `notFound` (404), `impliedByRole`, `isGhost` (409).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `minecraft.feed.announcer` (only on a real change) |

The admin post shape is the post view without the viewer fields (`liked`, `mine`, `canDelete`, `canPin`, `unseenReplies`, `answersMe`), plus `author` always filled, `authorUserId` (to open the Person page), `replyToGone` (a reply to a reply whose author's account was deleted since, whose `replyTo` is null like a reply to the main post's), `source`, `deletedAt`, `deletedBy` (`{ userId, name }`, or null when the author deleted it or it went with its thread), `deletedCause`, `deletedReason` and `purgeAt` (`deletedAt` plus 30 days). The person filter's picker searches with `GET /api/warden/admin/users?q=`, as the mod editor's does.

## Pages

Following the picked mocks (`C:\Users\pain_\Documents\LNB\feed-mocks\feed-web-mocks.html`, Feed page proposition A, moderation proposition M1) and `docs/design.md`. Every string in both locales.

### The Feed page (proposition A, "one column")

- **`/minecraft/feed`**, in the Minecraft menu, signed in only (`auth` middleware), `definePageMeta({ flag: 'feed' })`. A page head ("Feed" and a one-line lede: the server's announcements and the players' discussions, the same as in the game phone), then one column with an aside on wide screens ("Good to know": 280 characters of plain text; an anonymous post hides your name from players, moderators see it; the Feed follows the server rules, with a link to `/minecraft/rules`). On a phone the aside goes.
- **Tabs**: Announcements (first, the default) and Global, as pill tabs with a megaphone and a messages icon, the tab in the query (`?feed=global`) so a reload keeps it. An unread dot on the tab that isn't shown, from `unread` and live posts.
- **Composer at the top**, for those who may write in that tab: collapsed, the posting account's head and "What's new on the server?"; expanded, the author row (head, display name, handle) with a "Change account" menu when the person has several linked accounts ("Post with", each account with "Your posts will show {name} {handle}", a check on the current one; picking one calls `PATCH /me`), the anonymous author row when the switch is on (the anonymous avatar, "Anonymous", "Hidden from players"), the text area with an `n/280` counter counted with `shared/utils/feed-text.ts`, and a footer with, for announcers, the destination switch (Announcements / Global), the "Post anonymously" switch ("Hidden from players, visible to moderators"; offered in both feeds) and "Post". On Announcements, people who can't announce see a note line instead ("Only the team posts here. You can like and reply.").
- **Bands** in place of the composer: without a linked account, "Link your Minecraft account to take part" with "Link my account" (to `/minecraft/account`), and the actions drawn but static; while a Warden ban is in force, an error callout "You are banned from the server until {date}" (or with no end) with "See my ban", and the same static actions; with `writing` off, a quiet note that posting is paused.
- **The list**: the pinned group first on Announcements (an "Pinned" meta line), then posts newest first, with a "Load more" button (no infinite scroll). A post: the 40 px head (the anonymous avatar is a head-sized square with Lucide's `venetian-mask`), display name, the **announcer badge** (a soft neutral pill with a megaphone and "Announcer"), the handle, the relative time, the reply-to line, the private line (a lock and muted text: "Posted anonymously by you", or "Author: {name} {handle}" for a moderator), the text, then the actions: replies with their count and, on the viewer's own posts with unseen replies, a soft neutral "{n} new" pill; the **like** as a neutral toggle (a filled heart and highlighted count when liked, never red or coral); the pin toggle for announcers on announcements, with the "Replace a pin?" dialog on `pinLimit`; the more menu with Delete on the viewer's own posts (moderators delete others' in the admin), with the delete dialog. The replies count of a post in a feed links to its thread for every reader, writers or not. On a phone the announcer badge keeps only its megaphone (the label stays for screen readers), so the name keeps its room.
- **A thread is its own page**, `/minecraft/feed/:id` (the main post's ID, so links and the back button work): a "Feed" back link, the main post with its full date, "{n} replies, oldest first", the replies, and the reply composer under them (docked at the bottom on a phone): a "Replying to {name}" line with a cross to answer the main post instead, the text area, "Reply anonymously", the counter and "Reply". It uses the same posting account. Opening it calls `POST /posts/:id/seen` once shown. A deleted or unknown thread shows "This post was deleted" with the link back. Someone who can't write sees the composer's band in the reply composer's place.
- **Empty states**: "No announcements" ("Server announcements will show up here."); "No posts yet" with "Write a post" for those who can.
- **A failed send** keeps the draft and its idempotency key: sending the same text again reuses the key, so a post that went through despite the error is answered as `replayed` instead of posted twice. Changing the text, the anonymous switch or the destination takes a new key.
- **Loading and errors**: a tab loading shows placeholder rows; a failed load says so with "Try again"; a refusal is a toast that says what to do (`feed.errors.*` in the locales).
- The Minecraft menu and the footer's Minecraft column list the page for signed-in people while `feed` is on.
- Code: `app/composables/useFeed.ts` (`useFeedMe`, `useFeedTimeline`, `useFeedThread`, `feedActions`, the toasts), `app/utils/feed.ts` (names, ages, the pinned group, the draft key), components under `app/components/feed/`. Reads with `useFetch` (`/api/feed/me`, `/api/feed/posts`, `/api/feed/posts/:id`); writes with `$fetch`, the component showing the toast. Live updates come from `app/composables/useFeedLive.ts` and `app/utils/feed-live.ts`.

### Moderation (proposition M1, "table and drawer")

- **The Feed tab of Moderation**, `/admin/moderation/feed`, beside Appeals, Bans and Rules, for moderators (`wardenAdmins: true`). One filterable table, no other part:
  - **Filters**: a search field ("Search a text, a username or a name"), filter chips Announcements, Global, Replies, Anonymous and Deleted, and a person picker ("Everyone", or one person). A line under them gives the summary ("214 posts in the last 30 days, 2 deleted").
  - **Columns**: Author (head and name; an anonymous row shows "Anonymous" with the real author under it, behind a lock), Post (the text on two lines, and "Reply to {name}" for a reply to a reply, or "Reply to the post" for a reply to the main post, whose author the admin row doesn't carry), Feed (a badge, and "Pinned"), Reactions (likes and replies), Date (the time today, the day before), State. 50 rows a page, with "First page" and "Next page"; the filters, the cursor and the open row (`?post=<id>`) are in the URL.
  - **Deleted rows stay in the table**, dimmed, with a "Deleted" badge, "By {name}, {date}" (or "By the author", or "With its post" for a reply that went with its thread) and "Erased on {purgeAt}" in the State column. The Deleted chip shows only them, and the summary then counts the deleted rows.
  - **A row opens a drawer** (the row takes the selected tint): its title ("Anonymous reply", "Post", ...), a band with the **real author** (head, name and handle, "Real author, hidden from players" for an anonymous row) and "Open the profile" (`/admin/people/:userId/summary`), the text, facts (feed, replying to, posted, Minecraft account, likes), "The discussion" (the main post and up to two replies on each side of the row, with how many more there are, the row tinted and deleted ones dimmed and marked, drawn with the Feed page's post component), and **Delete** ("Delete the post" or "Delete the reply"), which opens the confirmation dialog (a post: it disappears for everyone at once, with its replies, moderators keep it 30 days in Deleted, then it is erased) with an optional reason; for the viewer's own post or reply the dialog asks no reason and says it is deleted as its author (no reason kept, nothing audited). "Replying to" names the reply answered, the main post, or "a reply whose author is gone" (`replyToGone`). A deleted row's drawer has no Delete.
- **The Person page's Minecraft tab** gets a "Feed announcer" row with a switch ("Can post in Announcements and pin. Moderators are announcers by role. Also given in game by command."), on and disabled with a note for a moderator (`viaRole`), and the person's header shows an "Announcer" pill when they are one (moderators included). A ghost account has no Minecraft tab, so it gets no switch; the route refuses it with `isGhost` anyway.
- Ctrl K lists Moderation › Feed. The sidebar's Moderation badge and the Home inbox get nothing: deleting is the only moderation, and without a report button there is nothing waiting.

## Flags

| Flag             | Off means                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feed`           | Every Feed route but the admin's answers 503 `disabled`, the stream included; the browser page shows the 503 page and its menu entry hides. Nothing is deleted. Shipped off.                   |
| `feed.serverApi` | Only the Minecraft server's routes answer 503 (the game shows "Feed is switched off", and comes back by itself within a minute once it is on); the browser keeps working.                      |
| `feed.writing`   | Posting, replying and liking answer 503, in game and in the browser (read-only mode for an incident). Deleting and pinning still work. `writing: false` in `GET /players/:uuid` and `GET /me`. |
| `feed.live`      | The browser's live stream answers 503 and the open streams close; the Feed page works without live updates (reload to see newer posts). Nothing else changes. Shipped off, apart from `feed`.  |
| `jobs.feedPurge` | The nightly purge skips its run.                                                                                                                                                               |

Labels and descriptions go under `admin.flags.items` in both locales.

## Nightly purge

`feed:purge`, at 03:00 with the other prunes, behind `jobs.feedPurge`:

- deletes every post and reply whose `deleted_at` is older than 30 days (their likes, seen rows and notifications go with them by cascade; a reply that answered a purged one keeps its line through `reply_to_minecraft_username`);
- deletes `feed_notification` rows older than 30 days.

It records `minecraft.feed.purge` through `auditService.recordJob`, with the counts, only when something was removed.

## Account deletion, unlink and ban

- **Deleting an account** (by an admin, or `users:delete-inactive`) deletes its posts, replies and likes by cascade, so the threads of its main posts go too, with everyone's replies in them, as when an author deletes a post. Its seen state, posting account and notifications go as well. `feedPostService.forgetUsers(tx, userIds)` runs first in the deletion's transaction, before the account's row is locked: it locks the main posts of every thread the deletion touches, in one order (every write in a thread locks its main post first, so a reply, a like or a moderator's delete racing the deletion waits instead of deadlocking), and lists what is about to go. It returns `afterDelete(tx)`, called right after the accounts' rows are deleted, which recomputes the counts of the posts that stay from the rows, and `afterCommit()`, which sends `deleted`, `counts` and, if a pinned post went, `pins`. Replies by others that answered the deleted account keep no reply-to line (`reply_to_user_id` is set null, and `replyTo` is then null). One window is left open on purpose: an account that posts during its own deletion, after `forgetUsers` has read the threads to lock and before the account's row is locked, while someone replies to that new post at the same moment, can still deadlock (PostgreSQL then aborts one of the two transactions with a deadlock error), and that post is missing from the `deleted` event (a client holding it sees it go at its next read of it, which answers `notFound`). It takes an account posting while an admin deletes it; the nightly job deletes inactive accounts only.
- **Unlinking** a Minecraft account keeps the posts made from it, which keep showing it. If it was the browser's posting account, the next linked one takes over; with none left, the person reads only. A `rights` event goes out for the unlinked account (Warden kicks it anyway when it is online).
- **A Warden or site ban** removes write, announce and moderate while it is in force, in game and on the Feed page (the admin follows the role, see Rights); the person still reads in the browser (Warden ban) and still deletes their own posts. Banning, unbanning, changing a ban's end, a role change that touches `admin` or `warden-admin`, and the announcer role send a `rights` event with the person's Minecraft accounts, from `wardenModerationService` (`ban`, `unban`, `revokeById`, `updateBan`, and `decideAppeal` when an accepted appeal lifts the ban), `wardenResetService.resetSanctions` (for each ban in force it lifts), `usersService.setRoles`, `wardenAdminService.setWardenAdmin`, `usersService.ban`/`unban` and `feedAnnouncerService`. A ban that ends on its own sends nothing; the mod re-reads a player's rights each time they open Feed, and before using a copy older than 5 minutes.

## Audit actions

In the `minecraft` area, so site admins and Warden admins read them. Added to `AuditAction`, to `docs/activity-log.md` and to both locales (`admin.activity.actions.minecraftFeedDelete`, and so on), and to the map of `test/unit/audit-coverage.test.ts`.

| Action                     | When                                                                          | Target                                        | `data`                                                         |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `minecraft.feed.delete`    | A moderator deletes someone else's post or reply, from the admin or the game. | the author                                    | `postId`, `threadId`, `feed`, `reply`, `anonymous`, `reason`   |
| `minecraft.feed.pin`       | An announcer pins an announcement, in game or in the browser.                 | the post's author (none for an anonymous one) | `postId`, `replaced` (the post unpinned to make room, or null) |
| `minecraft.feed.unpin`     | An announcer unpins one, in game or in the browser.                           | the post's author (none for an anonymous one) | `postId`                                                       |
| `minecraft.feed.announcer` | The announcer role is given or taken, from the admin or the game.             | the person                                    | `announcer`                                                    |
| `minecraft.feed.purge`     | The nightly purge removed something.                                          | none                                          | `posts`, `notifications`                                       |

Posting, replying, liking, reading and an author's own delete record nothing.

## Privacy

- What is stored about a player: their posts and replies with the Minecraft account they came from, their likes, which threads they opened and when they last viewed each feed, their browser posting account, and notifications waiting for them. Nothing about who read what besides that.
- All of it is deleted with the LNB account. Deleted posts are kept 30 days, readable by moderators only, then purged.
- The authors of anonymous posts are seen by moderators only, in game and in the admin (see "Anonymous posts and replies"). Moderators reading them leaves no trace; deleting one is audited.
- No analytics or tracking: no view counts, no read receipts.

## Code layout

Following `docs/architecture.md`: `server/db/schema/feed.ts`; `server/services/feed/` with `posts.ts` (create, reply, delete), `views.ts` (per-viewer views, pages, threads, cursors), `likes.ts`, `pins.ts`, `rights.ts`, `read-state.ts`, `notifications.ts`, `announcers.ts`, `admin.ts`, `events.ts` (the `feed` topic), `purge.ts`, `live.ts` (the browser stream's hub) and `rules.ts` (pure: text, fingerprints, cursors); handlers under `server/api/feed/`, `server/api/feed/server/` and `server/api/feed/admin/`; `server/tasks/feed/purge.ts`; `shared/schemas/feed.ts` and `shared/utils/feed-text.ts`; pages `app/pages/minecraft/feed/index.vue` and `[id].vue`, `app/pages/admin/moderation/feed.vue`, components under `app/components/feed/` and `app/components/admin/feed/`, composables `useFeed`, `useFeedAdmin` and `useFeedLive` (`useFeedStream`, `useFeedTimelineLive`, `useFeedThreadLive`). Tests: the text vectors (unit), the services against PostgreSQL (rights, anonymity per viewer, anonymous announcements, pins from both sides, idempotency, deletion cascade, purge, read state, notifications), the hub (one poll for many connections, replay, `reset`, sign-out, flag off), the OpenAPI and audit coverage tests.

Order of the website tasks: data and services; the Minecraft server's routes; the browser's routes and the Feed page; the admin; live updates last.
