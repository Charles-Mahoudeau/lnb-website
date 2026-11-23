# Feed: what the mod must do

The contract between the site and the Feed mod (`lnbphone_feed`, an app of the LNB Phone, Kotlin for NeoForge): every route under `/api/feed/server/`, its request and answer, every problem code, the `feed` stream, pagination, idempotency, limits, notifications, what to do when the site is away, and test vectors. It is written to be followed without asking the site team. The feature itself (rules, data, rights, the browser and the admin) is [feed.md](feed.md); the mod's own design (packages, payloads, client state, screens) is `docs/feed-app.md` in the LNB-phone-mod repository. When this page and the live reference at `/api/docs` (tag "Feed: Minecraft server") disagree, `/api/docs` wins: tell the site owner.

The rule behind everything: **the site decides.** It decides who may read, write, announce, moderate and pin, it cleans and checks every text, it works out who to notify, and it computes every per-viewer field (liked, mine, can delete, can pin, unseen replies, the author of an anonymous post). The mod shows, relays and notifies. It never decides a right on its own, and never sends a player's client more than the site gave for that player.

## Contents

1. [How the pieces fit](#1-how-the-pieces-fit)
2. [Talking to the site](#2-talking-to-the-site)
3. [The post view](#3-the-post-view)
4. [Routes, with examples](#4-routes-with-examples)
5. [Errors and what to do](#5-errors-and-what-to-do)
6. [Idempotency](#6-idempotency)
7. [Limits](#7-limits)
8. [Live changes (SSE)](#8-live-changes-sse)
9. [Notifications](#9-notifications)
10. [Rights and how fresh they are](#10-rights-and-how-fresh-they-are)
11. [When things go wrong](#11-when-things-go-wrong)
12. [Privacy](#12-privacy)
13. [Test vectors](#13-test-vectors)
14. [Running against a local site](#14-running-against-a-local-site)
15. [Rollout and QA](#15-rollout-and-qa)

## 1. How the pieces fit

```
Feed app (player's client)  <- payloads ->  Feed mod, server side  <- HTTPS + secret ->  site  <->  browser
                                                                    <- SSE, topic feed --
```

- The player's client never calls the site. It sends payloads to the Minecraft server, which calls the site with the secret and answers.
- The site stores everything. The mod keeps caches in memory only (rights of online players, who has Feed open), nothing on disk: after a restart it reads again.
- Changes made anywhere (the browser, the admin, the game itself) come back as stream events, which the mod relays to the players who have Feed open.
- Notifications wait in a queue on the site until the mod takes them and hands them to `PhoneNotifications`.

## 2. Talking to the site

### 2.1 Transport

- Base: `api.url` from Warden's `lnbwarden-server.toml`, path `/api/feed/server`. Token: `api.token` from the same file. Read them through Warden's `ServerConfig`, as `lnb-quests` does (`QuestsApi.connection`).
- `Authorization: Bearer <WARDEN_SERVER_SECRET>`, `Content-Type: application/json` on bodies, `Accept: application/json`. Build requests with Warden's `ApiClient.request(url, path, token)` and send them with `ApiClient.HTTP`, decoding the body yourself: `ApiClient.send` keeps only `data.problem`, and Feed needs `data.oldest` (`pinLimit`) and the `Retry-After` header (`rateLimited`). Record every result with `ApiHealth.record("feed <what>", result)`, so an outage is told to operators once.
- Never block the server thread on HTTP. Every call is asynchronous; hop back with `server.execute { }` before touching players or sending payloads.
- Timeouts: 5 seconds for reads, 10 for writes (ApiClient's default is 15). A player waiting longer sees "Feed unavailable" sooner and can retry.
- Every route needs the `feed` and `feed.serverApi` flags (503 `disabled` otherwise). The site limits the Minecraft server to 1,200 calls a minute on these routes (rule `feed-server`); a 429 there means "not processed, wait".

### 2.2 Conventions

- UUIDs with dashes. `player` is the acting player's Minecraft UUID; `viewer` the player who will see the answer. Never a UUID taken from a client's payload: always the sender's own, from the payload context.
- Dates are ISO 8601 strings in UTC, with milliseconds (`2026-11-23T20:14:05.000Z`).
- `feed` is `announcements` or `global`.
- Cursors (`next`) are opaque strings of at most 128 characters. Pass them back unchanged as `before` (feeds) or `after` (threads). `next: null` is the end.

### 2.3 Error format

Every refusal is the standard Nitro error with a `data.problem` code (Warden's `ApiResult.Http.problem` reads it):

```json
{
  "statusCode": 409,
  "statusMessage": "pinLimit",
  "message": "pinLimit",
  "data": { "problem": "pinLimit", "oldest": { "id": "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8" } }
}
```

Some refusals have no `data.problem`: a malformed body or query (400), an ID that is not a UUID in the path (404), a wrong secret (401), and a bare 5xx. A 503 `disabled` names the flag in `data.flag` (`feed`, `feed.serverApi` or `feed.writing`). A 429 carries `Retry-After` in seconds.

## 3. The post view

Main posts and replies have one shape, computed **for one viewer**:

```json
{
  "id": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70",
  "feed": "global",
  "threadId": null,
  "replyTo": null,
  "text": "Qui est chaud pour une virée dans le Nether ce soir ? Rendez-vous au portail du spawn à 21:00.",
  "createdAt": "2026-11-23T20:14:05.000Z",
  "anonymous": false,
  "author": {
    "uuid": "5c2a7a3e-6b1d-3c8e-9f4a-2d7b8c9e0f11",
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

| Field                            | Type           | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | UUID           |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `feed`                           | string         | `announcements` or `global`. A reply has its thread's feed.                                                                                                                                                                                                                                                                                                                                                                  |
| `threadId`                       | UUID or null   | Null on a main post; the main post on a reply.                                                                                                                                                                                                                                                                                                                                                                               |
| `replyTo`                        | object or null | On a reply that answers another reply: `{ id, anonymous, name }`. `id` is that reply (null once it was purged, 30 days after its deletion), `anonymous` whether it was anonymous, `name` the display name of who wrote it, null when `anonymous`. Null on a main post, on a reply to the main post, and when the account that wrote the target was deleted. The line reads "Replying to {name}", or "Replying to Anonymous". |
| `text`                           | string         | 1 to 280 code points, NFC, already cleaned by the site. Line feeds are `\n`.                                                                                                                                                                                                                                                                                                                                                 |
| `createdAt`                      | date           |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `anonymous`                      | boolean        |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `author`                         | object or null | `{ uuid, username, realName, announcer }`. **Null when `anonymous` is true**, unless the viewer is a moderator or the author.                                                                                                                                                                                                                                                                                                |
| `author.uuid`, `author.username` |                | The Minecraft account it was posted from: the face (`Avatar.showPlayer(uuid, username)`) and the handle. `username` is 3 to 16 characters.                                                                                                                                                                                                                                                                                   |
| `author.realName`                | string or null | First name and initial (`Alexandre M.`), at most 64 code points, or null when the author hides it. The display name is `realName ?: username`; the handle is `"@" + username` when `realName` is not null, and none otherwise.                                                                                                                                                                                               |
| `author.announcer`               | boolean        | The author can post announcements now: the badge.                                                                                                                                                                                                                                                                                                                                                                            |
| `likes`                          | integer        |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `replies`                        | integer        | On a main post, the replies in its thread; on a reply, the replies that answer it.                                                                                                                                                                                                                                                                                                                                           |
| `pinnedAt`                       | date or null   | Pinned announcements only.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `liked`                          | boolean        | The viewer's LNB account liked it. Always false for a guest.                                                                                                                                                                                                                                                                                                                                                                 |
| `mine`                           | boolean        | The viewer's LNB account wrote it (from any of its Minecraft accounts, or the browser).                                                                                                                                                                                                                                                                                                                                      |
| `canDelete`                      | boolean        | `mine` or the viewer moderates. Show the more button exactly when true.                                                                                                                                                                                                                                                                                                                                                      |
| `canPin`                         | boolean        | An announcement's main post and the viewer announces. Show the pin button exactly when true.                                                                                                                                                                                                                                                                                                                                 |
| `unseenReplies`                  | boolean        | The viewer wrote it and a reply answering it (or, on a main post, answering the viewer anywhere in its thread) arrived since the viewer last opened the thread. The blue marker.                                                                                                                                                                                                                                             |
| `answersMe`                      | boolean        | On a reply: it answers a post or reply of the viewer. Lets the client raise the marker on the thread's main post when the reply arrives live.                                                                                                                                                                                                                                                                                |

**Anonymous, by viewer.** For an anonymous post by Mika: Mika (from any of their Minecraft accounts) gets `author` filled and `mine: true` (the app shows "Posted anonymously by you"); a moderator gets `author` filled and `mine: false` (the app shows "Author: Mika L. @MikaPvP" with its tooltip); everyone else gets `author: null`. See vector 13.3.

## 4. Routes, with examples

All examples use these players (the UUIDs are examples, not the offline UUIDs of these names):

| Player                               | UUID                                   | LNB account              | Rights                    |
| ------------------------------------ | -------------------------------------- | ------------------------ | ------------------------- |
| `Cam_Roux` (Camille R.)              | `3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10` | linked                   | write                     |
| `MikaPvP` (Mika L.)                  | `7a1e4b2c-3d5f-3a6b-8c9d-0e1f2a3b4c5d` | linked                   | write                     |
| `Admin_Lune` (Lune G.)               | `9c8b7a6d-5e4f-3d2c-9b1a-0f9e8d7c6b5a` | linked, `warden-admin`   | write, announce, moderate |
| `Kael_Builder` (hides his real name) | `2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e` | linked, `feed-announcer` | write, announce           |
| `Visitor42`                          | `6d7e8f9a-0b1c-3d2e-8f4a-5b6c7d8e9f0a` | none (a guest)           | read                      |

### 4.1 `GET /players/:uuid`

The player's state, for any UUID. Call it when a player joins (in the background), each time they open Feed, and as section 10 says.

```json
{
  "linked": true,
  "banned": false,
  "writing": true,
  "me": {
    "uuid": "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10",
    "username": "Cam_Roux",
    "realName": "Camille R.",
    "announcer": false
  },
  "rights": { "write": true, "announce": false, "moderate": false },
  "unread": { "announcements": false, "global": true }
}
```

- `linked`: the UUID is a Minecraft account linked to an LNB account. A guest, or an account unlinked since, is `linked: false`, `me: null`, every right false, and both `unread` false.
- `banned`: a Warden ban or a site ban is in force. Write, announce and moderate are then false; the player can still delete their own posts.
- `writing`: the `feed.writing` flag. When false, posting, replying and liking answer 503 `disabled` for everyone: hide the compose button and the reply composer, and show likes as they are.
- `me`: the author block the player would post as, from this Minecraft account (the Compose author row).
- `rights`: what the player may do now (see 10). Reading needs no right.
- `unread`: the tab dots at the moment of the call (see 8.4).

### 4.2 `GET /posts?feed=&viewer=&limit=&before=`

A page of a feed for one viewer, newest first. `limit` is 1 to 50 (20 by default). `before` is the previous page's `next`.

```bash
curl -H "Authorization: Bearer $SECRET" \
  "$SITE/api/feed/server/posts?feed=announcements&viewer=3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10&limit=20"
```

```json
{
  "feed": "announcements",
  "pinned": [
    {
      "id": "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8",
      "feed": "announcements",
      "threadId": null,
      "replyTo": null,
      "text": "La saison 2 commence samedi à 20:00. Nouvelle map, nouvelles quêtes !",
      "createdAt": "2026-11-20T18:00:00.000Z",
      "anonymous": false,
      "author": {
        "uuid": "9c8b7a6d-5e4f-3d2c-9b1a-0f9e8d7c6b5a",
        "username": "Admin_Lune",
        "realName": "Lune G.",
        "announcer": true
      },
      "likes": 31,
      "replies": 6,
      "pinnedAt": "2026-11-20T18:01:12.000Z",
      "liked": true,
      "mine": false,
      "canDelete": false,
      "canPin": false,
      "unseenReplies": false,
      "answersMe": false
    }
  ],
  "posts": [],
  "next": null
}
```

- `pinned` is filled on the first page of `announcements` only (no `before`), most recent pin first, at most 3. It is `[]` on Global and on later pages.
- `posts` never repeats a pinned post. When a post is unpinned (a `pins` event), put it back in date order yourself.
- Pages are keyset pages on `(createdAt, id)`: a post created after the first page doesn't shift the second, and a post deleted between two pages is simply absent (vector 13.4).

### 4.3 `GET /posts/:id?viewer=&limit=&after=`

A thread for one viewer: the main post and a page of its replies, oldest first. `limit` 1 to 50 (50 by default). The first page has no `after`; pass `next` to get the following replies.

```json
{
  "post": {
    "id": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70",
    "feed": "global",
    "threadId": null,
    "...": "..."
  },
  "replies": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "feed": "global",
      "threadId": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70",
      "replyTo": null,
      "text": "Moi ! Je ramène des potions de résistance au feu.",
      "createdAt": "2026-11-23T20:16:40.000Z",
      "anonymous": false,
      "author": {
        "uuid": "7a1e4b2c-3d5f-3a6b-8c9d-0e1f2a3b4c5d",
        "username": "MikaPvP",
        "realName": "Mika L.",
        "announcer": false
      },
      "likes": 2,
      "replies": 1,
      "pinnedAt": null,
      "liked": false,
      "mine": false,
      "canDelete": false,
      "canPin": false,
      "unseenReplies": false,
      "answersMe": false
    },
    {
      "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "feed": "global",
      "threadId": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70",
      "replyTo": {
        "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "anonymous": false,
        "name": "Mika L."
      },
      "text": "Il y en a encore ?",
      "createdAt": "2026-11-23T20:18:02.000Z",
      "anonymous": true,
      "author": null,
      "likes": 0,
      "replies": 0,
      "pinnedAt": null,
      "liked": false,
      "mine": false,
      "canDelete": false,
      "canPin": false,
      "unseenReplies": false,
      "answersMe": false
    }
  ],
  "next": null
}
```

- `:id` must be a main post. A reply's ID, or a deleted or unknown post, is 404 `notFound`. A notification's target always names the main post.
- The markers (`unseenReplies`) are computed against the viewer's last opening of this thread, **before** it is marked. Once the thread is shown, call `POST /posts/:id/seen` (4.11).

### 4.4 `POST /views`

Per-viewer views of a few posts for many viewers in one call: what the mod uses to relay a `post` event (8.2), so that each client gets exactly what the site would answer that player.

```json
{
  "viewers": [
    "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10",
    "9c8b7a6d-5e4f-3d2c-9b1a-0f9e8d7c6b5a",
    "6d7e8f9a-0b1c-3d2e-8f4a-5b6c7d8e9f0a"
  ],
  "ids": ["b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"]
}
```

```json
{
  "views": [
    {
      "viewer": "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10",
      "posts": [
        {
          "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
          "anonymous": true,
          "author": null,
          "mine": true,
          "...": "..."
        }
      ]
    },
    {
      "viewer": "9c8b7a6d-5e4f-3d2c-9b1a-0f9e8d7c6b5a",
      "posts": [
        {
          "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
          "anonymous": true,
          "author": { "username": "Cam_Roux", "...": "..." },
          "...": "..."
        }
      ]
    },
    {
      "viewer": "6d7e8f9a-0b1c-3d2e-8f4a-5b6c7d8e9f0a",
      "posts": [
        {
          "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
          "anonymous": true,
          "author": null,
          "...": "..."
        }
      ]
    }
  ]
}
```

(Here the anonymous reply is Camille's: Camille gets `author` and `mine: true`, Lune, a moderator, gets `author`, the guest gets neither. For Camille `author` is filled too; it is elided above.)

- `viewers`: 1 to 200 distinct UUIDs, linked or not. `ids`: 1 to 20 distinct post or reply IDs.
- Every viewer is in `views`, in the order sent. A deleted or unknown ID is left out of every viewer's `posts`, in the order of `ids` otherwise.
- Problems: a plain 400 beyond the limits. No `notFound`.

### 4.5 `POST /posts`

Creates a main post.

| Field            | Type    | Notes                                                                                  |
| ---------------- | ------- | -------------------------------------------------------------------------------------- |
| `idempotencyKey` | UUID    | Made by the player's client with the draft, see 6.                                     |
| `player`         | UUID    | The author, the payload's sender.                                                      |
| `feed`           | string  | `announcements` needs the announce right.                                              |
| `text`           | string  | As typed, trimmed; at most 4,000 characters raw. The site cleans and checks it (13.1). |
| `anonymous`      | boolean | Refused in `announcements` (400 `anonymousAnnouncement`).                              |

```json
{
  "idempotencyKey": "c0a8e1a2-7b0f-4f6e-9a55-3d3b6a0f0c11",
  "player": "2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e",
  "feed": "announcements",
  "text": "Événement PvP dimanche à 15:00 à l'arène. Inscriptions au panneau du spawn.",
  "anonymous": false
}
```

201:

```json
{
  "replayed": false,
  "post": {
    "id": "5f6a7b8c-9d0e-4f1a-b2c3-d4e5f6a7b8c9",
    "feed": "announcements",
    "threadId": null,
    "replyTo": null,
    "text": "Événement PvP dimanche à 15:00 à l'arène. Inscriptions au panneau du spawn.",
    "createdAt": "2026-11-23T21:02:44.000Z",
    "anonymous": false,
    "author": {
      "uuid": "2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e",
      "username": "Kael_Builder",
      "realName": null,
      "announcer": true
    },
    "likes": 0,
    "replies": 0,
    "pinnedAt": null,
    "liked": false,
    "mine": true,
    "canDelete": true,
    "canPin": true,
    "unseenReplies": false,
    "answersMe": false
  }
}
```

The view is for `player`. The site also sends a `post` event (other players get it through 4.4) and, for an announcement, queues a notification for everyone but Kael's accounts (`notification` event).

The site checks, in this order: the flags (`feed`, `feed.serverApi`, then `feed.writing`); the key (a stored post with this key answers `replayed: true`, or 409 `idempotencyMismatch`); the player (404 `notLinked`); the ban (403 `banned`); the right (403 `notAllowed` for Announcements without announce); `anonymousAnnouncement`; the text (400 `emptyText`, `tooLong`); the rate (429 `rateLimited`).

### 4.6 `POST /posts/:id/replies`

Creates a reply in the thread of main post `:id`.

| Field            | Type         | Notes                                                        |
| ---------------- | ------------ | ------------------------------------------------------------ |
| `idempotencyKey` | UUID         | As for a post.                                               |
| `player`         | UUID         |                                                              |
| `replyTo`        | UUID or null | A reply of the same thread, or null to answer the main post. |
| `text`           | string       | As for a post.                                               |
| `anonymous`      | boolean      | Allowed in both feeds.                                       |

```json
{
  "idempotencyKey": "4a1b0e0e-2a3f-45d2-b2c9-9d9f2b3d7a02",
  "player": "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10",
  "replyTo": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "text": "Il y en a encore ?",
  "anonymous": true
}
```

201 `{ "replayed": false, "post": { ...the reply, for player... } }`. The site sends `post` and `counts` events (the main post's and the target's `replies` changed) and, unless the target is the replier's own, queues a notification for the target's author.

Checks as for a post, plus: `:id` unknown, deleted or a reply, or `replyTo` unknown, deleted or in another thread: 404 `notFound`. Any player who can write may reply in Announcements' threads.

### 4.7 `PUT /posts/:id/like` and `DELETE /posts/:id/like?player=`

```json
{ "player": "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10" }
```

Both answer the state after the call:

```json
{ "id": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70", "likes": 13, "liked": true }
```

Liking a liked post, or unliking one that isn't, changes nothing and answers the same shape. A change sends a `counts` event. Works on main posts and replies. Problems: `notFound`, `notLinked` (404), `banned` (403), `rateLimited` (429), `disabled` (503, `feed.writing` included).

### 4.8 `PUT /posts/:id/pin` and `DELETE /posts/:id/pin?player=`

```json
{ "player": "9c8b7a6d-5e4f-3d2c-9b1a-0f9e8d7c6b5a", "replace": false }
```

Both answer the pinned group after the call, most recent pin first, and the post unpinned to make room, if any:

```json
{
  "pinned": [
    { "id": "6a7b8c9d-0e1f-4a2b-c3d4-e5f6a7b8c9d0", "pinnedAt": "2026-11-23T21:10:00.000Z" },
    { "id": "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8", "pinnedAt": "2026-11-20T18:01:12.000Z" }
  ],
  "unpinned": null
}
```

- With 3 pinned and `replace: false`: 409 `pinLimit`, with `data.oldest: { id }`, the pin that would go. Show the "Replace a pin?" dialog; on confirm, send again with `replace: true`. `replace` is optional and false by default.
- With `replace: true`: the oldest pin goes (`unpinned` is its ID) and the post is pinned, in one transaction.
- Pinning a pinned post, or unpinning one that isn't, changes nothing and answers the group.
- A change sends a `pins` event.
- Problems: `notFound`, `notLinked` (404), `banned`, `notAllowed` (403, no announce right), `notPinnable` (409, a reply or a Global post), `pinLimit` (409). Not behind `feed.writing`.

### 4.9 `DELETE /posts/:id?player=`

Deletes a main post (and its whole thread) or a reply. 204, with no body.

- The author may delete their own, banned or not; a moderator any. Anyone else: 403 `notAllowed`.
- An already deleted post answers 204 again when the player could have deleted it, so a retry after a timeout is harmless. An unknown ID, or one the player couldn't have deleted that is already gone, is 404 `notFound`.
- The site sends a `deleted` event listing every row that went (the post and its replies), `counts` for what changed, and `pins` if a pinned post went. A moderator deleting someone else's post is audited.
- Problems: `notFound`, `notLinked` (404), `notAllowed` (403). Not behind `feed.writing`.

### 4.10 `POST /seen`

Marks a feed viewed: the tab's dot clears and stays clear until a newer post arrives.

```json
{
  "player": "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10",
  "feed": "global",
  "upTo": "2026-11-23T20:14:05.000Z"
}
```

`upTo` is the `createdAt` of the newest post the player was shown in that feed (pinned posts included). The site keeps the later of the stored time and `upTo`, never later than now. 204. A guest's call does nothing and answers 204 too. Problems: none beyond 400 and 503. There is no route to read the dots apart from 4.1: they come with the player's state, and live posts update them on the client (8.4).

### 4.11 `POST /posts/:id/seen`

Marks a thread opened by the player, which clears its unseen-replies markers.

```json
{ "player": "3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10" }
```

204. A guest's call does nothing. `notFound` (404) for an unknown or deleted main post.

### 4.12 `GET /notifications`

The notifications waiting to be delivered, oldest first, at most 100 per call (call again while `more` is true, after acknowledging).

```json
{
  "items": [
    {
      "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "kind": "announcement",
      "createdAt": "2026-11-23T21:02:44.000Z",
      "players": null,
      "except": ["2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e"],
      "post": {
        "id": "5f6a7b8c-9d0e-4f1a-b2c3-d4e5f6a7b8c9",
        "feed": "announcements",
        "threadId": null,
        "text": "Événement PvP dimanche à 15:00 à l'arène. Inscriptions au panneau du spawn.",
        "anonymous": false,
        "author": {
          "uuid": "2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e",
          "username": "Kael_Builder",
          "realName": null,
          "announcer": true
        }
      }
    },
    {
      "id": "f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c",
      "kind": "reply",
      "createdAt": "2026-11-23T21:05:10.000Z",
      "players": ["7a1e4b2c-3d5f-3a6b-8c9d-0e1f2a3b4c5d"],
      "except": [],
      "post": {
        "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
        "feed": "global",
        "threadId": "0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70",
        "text": "Il y en a encore ?",
        "anonymous": true,
        "author": null
      }
    }
  ],
  "more": false
}
```

- `kind`: `announcement` or `reply`.
- `players`: for a reply, every Minecraft account linked to the recipient's LNB account now (possibly `[]` if they unlinked all: acknowledge it and move on). For an announcement, null: every player of the world.
- `except`: for an announcement, the author's linked Minecraft accounts, who must not get it. `[]` for a reply.
- `post`: the public part of the post (no viewer fields): `id`, `feed`, `threadId`, `text`, `anonymous`, `author` (null when anonymous, for everyone: this is what goes into the notification's text).
- Rows older than 30 days are never returned (the site purges them). A post deleted before delivery takes its rows with it.

How to deliver them is section 9.

### 4.13 `POST /notifications/ack`

```json
{ "ids": ["e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b", "f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c"] }
```

1 to 100 IDs. Deletes them. 204. Unknown IDs (already acknowledged, or purged) are ignored.

### 4.14 `PUT /announcers/:uuid`

For `/feed announcer add|remove <username>`. `:uuid` is the target's Minecraft UUID (the offline UUID of the username typed).

```json
{
  "announcer": true,
  "issuer": { "uuid": "9c8b7a6d-5e4f-3d2c-9b1a-0f9e8d7c6b5a", "username": "Admin_Lune" }
}
```

```json
{
  "uuid": "2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e",
  "username": "Kael_Builder",
  "announcer": true,
  "viaRole": false
}
```

- `issuer`: the player who ran the command. The site refuses with 403 `issuerNotAllowed` unless the issuer is a linked account whose LNB account moderates. Leave `issuer` out only for the server console (see `docs/feed-app.md`, "The command").
- `announcer` in the answer is the target's announce right after the call; `viaRole` is true when they have it as a moderator (then the `feed-announcer` role itself changes nothing).
- Giving it to someone who has it changes nothing and answers the same. Taking it from a moderator is 409 `impliedByRole`.
- A real change is audited (`minecraft.feed.announcer`, from the server, with the issuer as the in-game actor) and sends a `rights` event.
- Problems: `notLinked` (404, the target has no LNB account), `issuerNotAllowed` (403), `impliedByRole`, `isGhost` (409).

### 4.15 `GET /announcers`

For `/feed announcer list`: the people with the `feed-announcer` role (moderators announce by role and aren't listed).

```json
{
  "items": [
    {
      "realName": null,
      "accounts": [{ "uuid": "2b3c4d5e-6f7a-3b8c-9d0e-1f2a3b4c5d6e", "username": "Kael_Builder" }]
    }
  ]
}
```

`realName` follows the person's Warden setting; `accounts` are their linked Minecraft accounts.

### 4.16 `GET /events`

The `feed` topic as Server-Sent Events: section 8.

## 5. Errors and what to do

| Status                      | `data.problem`                     | Routes                                  | Meaning                                                                            | What the mod does                                                                                                                         |
| --------------------------- | ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 400                         | none                               | any                                     | Malformed body or query                                                            | A bug: log it, answer the client `UNAVAILABLE`.                                                                                           |
| 400                         | `emptyText`                        | posts, replies                          | Nothing left after cleaning                                                        | The client never sends that (it checks with `TextLimits.canSend`): log, answer `INVALID`.                                                 |
| 400                         | `tooLong`                          | posts, replies                          | More than 280 code points after cleaning                                           | As `emptyText`.                                                                                                                           |
| 400                         | `anonymousAnnouncement`            | posts                                   | Anonymous in Announcements                                                         | As `emptyText` (the app hides the toggle there).                                                                                          |
| 401                         | none                               | any                                     | Wrong secret                                                                       | Configuration: `ApiHealth` tells operators. Answer `UNAVAILABLE`.                                                                         |
| 403                         | `banned`                           | writes, pins                            | A Warden or site ban is in force                                                   | Answer `BANNED`, re-read the player's rights.                                                                                             |
| 403                         | `notAllowed`                       | posts (Announcements), pins, deletes    | The right is missing                                                               | Answer `NOT_ALLOWED`, re-read the player's rights.                                                                                        |
| 403                         | `issuerNotAllowed`                 | announcers                              | The command's issuer doesn't moderate                                              | Tell the issuer they can't.                                                                                                               |
| 404                         | none                               | any                                     | An ID in the path that isn't a UUID                                                | A bug: log it.                                                                                                                            |
| 404                         | `notLinked`                        | writes, pins, deletes, announcers       | The UUID has no linked LNB account                                                 | Answer `NOT_LINKED`, re-read the player's rights (they were unlinked, or are a guest). For the command: "this player has no LNB account". |
| 404                         | `notFound`                         | thread, writes on a post, pins, deletes | Unknown or deleted post, or a reply where a main post is expected                  | Answer `NOT_FOUND`: the client drops the post (and leaves its thread with "This post was deleted").                                       |
| 409                         | `idempotencyMismatch`              | posts, replies                          | The key was used for another request                                               | A bug or a forged client: log it loudly, answer `INVALID`.                                                                                |
| 409                         | `pinLimit` (with `oldest`)         | pin                                     | 3 already pinned                                                                   | Answer `PIN_LIMIT` with `oldest`: the client shows the dialog.                                                                            |
| 409                         | `notPinnable`                      | pin                                     | A reply or a Global post                                                           | Answer `NOT_PINNABLE` (the app never offers it).                                                                                          |
| 409                         | `impliedByRole`                    | announcers                              | Removing a moderator's announce right                                              | Tell the issuer the player is a moderator.                                                                                                |
| 409                         | `isGhost`                          | announcers                              | A ghost account                                                                    | Tell the issuer. Shouldn't happen: a ghost has no linked account.                                                                         |
| 429                         | `rateLimited` (with `Retry-After`) | writes                                  | Too many posts, replies or likes from that account                                 | Answer `RATE_LIMITED` with the seconds; the client keeps the draft.                                                                       |
| 503                         | `disabled` (with `flag`)           | any                                     | `feed` or `feed.serverApi` off; or `feed.writing` off for posts, replies and likes | Answer `DISABLED`. For `feed.writing`, re-read the state (`writing: false`) so the app hides composing. See 11.2.                         |
| 5xx, timeout, no connection |                                    | any                                     | Unknown                                                                            | Answer `UNAVAILABLE`. A write's outcome is unknown: the client keeps the draft and its key (6).                                           |

The outcome names (`OK`, `UNAVAILABLE`, `DISABLED`, `RATE_LIMITED`, `NOT_LINKED`, `BANNED`, `NOT_ALLOWED`, `NOT_FOUND`, `PIN_LIMIT`, `NOT_PINNABLE`, `INVALID`) are the mod's own, defined in `docs/feed-app.md`.

## 6. Idempotency

Only creating a post or a reply takes a key. Likes, pins and deletes are idempotent by state: sending them twice leaves the same result.

- **The client makes the key**, a `UUID.randomUUID()`, when the player first presses Post (or Reply) on a draft, and keeps it with the draft. The mod forwards it as `idempotencyKey`. This way a retry after a timeout, pressed by the player from the error snackbar, reuses the key, even though the Minecraft server already answered "failed".
- The key changes when the draft changes after a failure (its text, the anonymous toggle, the destination, or the reply's target), and after a success (the draft is cleared).
- The same key with the same request returns the first post with `replayed: true`: treat it as a success. The post may already be in the feed (its `post` event arrived first): the client deduplicates by `id`.
- The same key with any other request (`player`, `feed`, thread, `replyTo`, `text` after cleaning, `anonymous`) is 409 `idempotencyMismatch`. Keys are checked after the flags and before everything else, so a replay works whatever changed since, rights and rate included.
- A key whose post was deleted since answers 404 `notFound`: stop retrying and clear the draft.
- The mod doesn't retry on its own. It answers the client, and the player retries.

## 7. Limits

| Limit                             | Value                                                                                 | Enforced by                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Text                              | 1 to 280 code points after cleaning (13.1)                                            | the site (`emptyText`, `tooLong`); the client and the mod check first with `TextLimits.canSend(text.trim(), 280)` |
| Raw text sent                     | at most 4,000 characters                                                              | the site (plain 400); the payload codec caps it far lower (560 UTF-16 units)                                      |
| Pinned announcements              | 3                                                                                     | the site (`pinLimit`)                                                                                             |
| Feed page                         | 1 to 50 posts (20 by default), plus up to 3 pinned on the first page of Announcements | the site                                                                                                          |
| Thread page                       | 1 to 50 replies (50 by default)                                                       | the site                                                                                                          |
| `POST /views`                     | 1 to 200 viewers, 1 to 20 IDs                                                         | the site                                                                                                          |
| Notifications                     | 100 per `GET`, 1 to 100 IDs per ack                                                   | the site                                                                                                          |
| Cursor                            | at most 128 characters                                                                | the site                                                                                                          |
| `realName`                        | at most 64 code points                                                                | the site                                                                                                          |
| Main posts per LNB account        | 3 a minute and 15 an hour, both feeds, game and browser together                      | the site (`rateLimited`)                                                                                          |
| Replies per LNB account           | 6 a minute and 60 an hour                                                             | the site                                                                                                          |
| Likes and unlikes per LNB account | 60 a minute                                                                           | the site                                                                                                          |
| Calls from the Minecraft server   | 1,200 a minute on `/api/feed/server/*`                                                | the site's middleware (`feed-server`)                                                                             |
| Deleted posts kept                | 30 days, for moderators                                                               | the site's nightly purge                                                                                          |
| Stream events kept                | 24 hours                                                                              | the site's nightly prune                                                                                          |
| Waiting notifications kept        | 30 days                                                                               | the site's nightly purge                                                                                          |

## 8. Live changes (SSE)

### 8.1 The stream

`GET /api/feed/server/events`, with the secret, behind `feed` and `feed.serverApi`. It is the same stream as the economy's and the quests' (`server/utils/minecraft-event-stream.ts`): each event has an `id` (a number, shared by every topic, growing), an `event` type and a JSON `data`. Send `Last-Event-ID` when reconnecting to receive what was missed in the last 24 hours; without it the stream starts from now. A `ping` event comes after 25 quiet seconds: drop a connection silent for 75 seconds and reconnect, with a backoff from 1 to 30 seconds, as `QuestEvents` does. A 503 `disabled` at connection means the feature is off: try again every 60 seconds.

| Event          | Data                                  | Sent when                                                                                                                                  |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `post`         | `{ id, feed, threadId, createdAt }`   | A main post (`threadId` null) or a reply was created, in game, in the browser or anywhere.                                                 |
| `deleted`      | `{ items: [{ id, feed, threadId }] }` | Posts or replies went: deleted by their author or a moderator (a main post lists its replies too), or with an account.                     |
| `counts`       | `{ items: [{ id, likes, replies }] }` | A post's or reply's likes or replies changed (a like, an unlike, a reply created or deleted).                                              |
| `pins`         | `{ pinned: [{ id, pinnedAt }] }`      | The pinned group changed: the whole group after the change, most recent pin first.                                                         |
| `rights`       | `{ uuids: [...] }`                    | Those Minecraft accounts' rights or state may have changed: the announcer role, a moderator role, a ban, an unban, a ban's end, an unlink. |
| `notification` | `{}`                                  | Notifications were queued.                                                                                                                 |

No event carries an anonymous post's author or any per-viewer field. A flag change sends no event (see 11.2).

### 8.2 What the mod does with each

The mod keeps the set of **watchers**: online players who opened Feed since they joined (the app's `open` payload). Live changes go to watchers only; other players read fresh data when they open Feed.

- `post`: call `POST /views` with the post's ID and the watchers' UUIDs (in chunks of 200), and send each watcher their own view (`live` payload). Events that arrive within the same server tick can share one call (up to 20 IDs).
- `deleted`: forward to the watchers (`removed`), and take back the notifications that point to the rows (9.4).
- `counts`, `pins`: forward to the watchers as they are.
- `rights`: for each listed UUID online, read `GET /players/:uuid` again and send the result to the player if they watch (`state`). Re-send the command tree so `/feed announcer` appears or disappears (see `docs/feed-app.md`).
- `notification`: drain the queue (9).

### 8.3 Catching up

The stream's 24 hours don't cover a long outage, and the site doesn't say when events were pruned. So on **every** successful connection (the first one too):

1. Drain the notification queue (9). Nothing is lost there: the queue lives on the site.
2. Read `GET /players/:uuid` again for every online player, and send their state to those who watch.
3. Tell the watchers their caches are stale (`reset` payload): the client reloads what it shows.

Send `Last-Event-ID` anyway when you have one: after a short drop, the missed events replay and the posts appear without a reload.

### 8.4 Unread dots

`GET /players/:uuid` gives `unread` when the player opens Feed. While they watch, a `post` event for a main post in the feed they aren't looking at sets that tab's dot on the client (unless the post is theirs: `mine`). When the player views a tab, the client sends what it saw and the mod calls `POST /seen` with the newest `createdAt` shown. The state is on the site, so it is the same after a restart and in the browser.

## 9. Notifications

### 9.1 When to drain

`GET /notifications`, deliver, then `POST /notifications/ack` with the IDs delivered, again while `more` is true. Do it:

- when the server has started (`ServerStartedEvent`) and the stream connects;
- on each `notification` event;
- every 5 minutes, in case an event was missed.

Never two drains at once: a drain that is asked for while one runs runs once more after it.

### 9.2 Delivering

From the server thread (or any thread: `PhoneNotifications` may be called from any), with the app ID `lnbphone_feed:feed`:

| Kind           | Recipients                                                                                                                                                                                     | Title                              | Text                                                                                                                                                            | Target                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `announcement` | every player of the world: the UUIDs of the world's `playerdata` folder (`server.getWorldPath(LevelResource.PLAYER_DATA_DIR)`, the `<uuid>.dat` files) and every online player, minus `except` | `notif.lnbphone_feed.announcement` | `notif.lnbphone_feed.text` with the author's display name and the post's text                                                                                   | `post:<postId>`                     |
| `reply`        | `players`                                                                                                                                                                                      | `notif.lnbphone_feed.reply`        | `notif.lnbphone_feed.text` with the reply author's display name, or the translatable `lnbphone_feed.post.anonymous` when `author` is null, and the reply's text | `reply:<feed>:<threadId>:<replyId>` |

- Use `PhoneNotifications.send(players: Collection<UUID>, appId, title, text, target)`: it stores the notification for offline players and delivers it at their next login. Not `sendToEveryone` for announcements: it can't leave the author out, and a player's own action must never notify them.
- Player content goes in as arguments of your own keys, never as a key (see the phone's `PhoneNotifications` KDoc). The phone cuts the text to 320 characters between graphemes; pass the whole post.
- Acknowledge a row once `send` has been called for it. A crash between the two delivers it twice at the next drain; that is rare and harmless next to losing it.
- `players: []`: acknowledge without sending.

### 9.3 Targets

| Target                              | Leads to                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `post:<postId>`                     | the Announcements tab, scrolled to the top, the announcement highlighted                                       |
| `reply:<feed>:<threadId>:<replyId>` | the thread of `threadId` over the `feed` tab (`announcements` or `global`), scrolled to the reply, highlighted |

At most 93 characters, under the phone's 256. Read them defensively: an unknown or malformed target opens Feed on Announcements.

### 9.4 Taking them back

On a `deleted` event, for each item: `PhoneNotifications.clearTargetForEveryone(appId, "post:<id>")` when `threadId` is null (only announcements are notified, but clearing a Global one costs nothing), and `clearTargetForEveryone(appId, "reply:<feed>:<threadId>:<id>")` for a reply. The phone then removes the badge and any banner or peek still showing.

## 10. Rights and how fresh they are

The mod never works rights out from roles or op levels. It reads them from `GET /players/:uuid` and uses them for two things only: what the app shows (the client gets them in its `state`), and the `/feed announcer` command's visibility. Every action is checked again by the site.

- Read them when a player joins, in the background (nothing waits for it), and each time they open Feed (the answer also carries the tab dots).
- Read them again at once on a `rights` event naming the player, on any `notAllowed`, `banned` or `notLinked` answer to that player's action, for every online player at each stream connection, and before using a copy older than 5 minutes (the command's visibility).
- Forget them when the player leaves.
- A ban that ends by itself sends no event; the 5 minutes cover it.

So a right given or taken on the site reaches an online player within a second (the event), and in the worst case (the stream down) at their next action or within 5 minutes.

## 11. When things go wrong

### 11.1 The site is unreachable

- Reads (`state`, a page, a thread): answer the client `UNAVAILABLE`. The app shows "Feed unavailable" with Retry, or keeps what it has loaded and shows the snackbar (the art direction's F-3).
- Writes: answer `UNAVAILABLE`. The client keeps the draft and its key; the player retries.
- The stream reconnects with a backoff; on success, catch up (8.3).
- Notifications wait on the site; the drain at reconnection delivers them.
- **Feed never gets in the way of playing**: the state read at join runs in the background and nothing waits for it, there is no retry loop, and nothing blocks the server thread.

### 11.2 The feature is switched off

- `feed` or `feed.serverApi` off: every route answers 503 `disabled`. The app shows "Feed unavailable". The stream refuses to connect: retry every 60 seconds; when it connects again, catch up (8.3).
- `feed.writing` off: reads work; posts, replies and likes answer 503 `disabled` with `flag: "feed.writing"`. Re-read the player's state: `writing: false` makes the app hide the compose button and the reply composer, and show likes inactive. Deleting and pinning still work.
- A flag turned back on sends no event. The next read that succeeds, or the stream reconnecting, brings Feed back; the app's Retry does it at once.

### 11.3 Guests

A guest (`linked: false`) reads both feeds and threads, with no compose button, no reply composer, and likes shown but inactive. Their views have every viewer field false. They get announcement notifications like everyone (they are in the world's `playerdata`). Marking seen does nothing for them: their dots live only in the client, for the session.

### 11.4 Banned players

A Warden-banned player can't be online. If a ban comes while they are online, Warden kicks them (its `kick` event). Should an action arrive in between, the site answers 403 `banned`.

### 11.5 A player unlinked while online

Warden kicks them (its `kick` event, reason `unlinked`). If they come back as a guest (Warden in `optional` mode), their state reads `linked: false`. An action that arrives before the kick answers 404 `notLinked`: re-read their state and send it.

## 12. Privacy

- **Never send a client what the site didn't give for that player.** Relay per-viewer views (`POST /views`, pages, threads) to the viewer they were made for, and nothing else. Never copy one player's view to another.
- **The author of an anonymous post or reply** reaches the mod in two ways only: inside a view made for a moderator or for the author, and as the `players` of a reply notification (who are the author of what was answered). Don't log either, don't keep them beyond the call that needs them, don't show them in a command's output.
- Don't log post texts. Log IDs and problem codes.
- The secret stays in `lnbwarden-server.toml` on the server. The client never calls the site.

## 13. Test vectors

The site's unit tests (`test/unit/feed-text.test.ts` and the service tests) and the mod's (`FeedRulesTest`, `MemoryBackendTest`) use the same vectors.

### 13.1 Text

The rule (`feed.md`, "Text"): clean (CR LF and CR to LF, tab to space, drop U+0000 to U+001F except LF, U+007F to U+009F, U+00A7 and unpaired surrogates), NFC, trim (LF, Zs, U+2028, U+2029), fold three or more LF into two, count code points (1 to 280).

| Input (escapes as in Kotlin)            | Stored              | Count | Answer          |
| --------------------------------------- | ------------------- | ----- | --------------- |
| `"  Salut  "`                           | `"Salut"`           | 5     | 201             |
| `"été"` (decomposed)                    | `"été"`             | 3     | 201             |
| `"👍🏽"`                                  | `"👍🏽"`              | 2     | 201             |
| `"🇫🇷"`                                  | `"🇫🇷"`              | 2     | 201             |
| 280 × `"a"`                             | the same            | 280   | 201             |
| 281 × `"a"`                             |                     | 281   | 400 `tooLong`   |
| 279 × `"a"` + `"é"` (281 raw)           | 279 × `"a"` + `"é"` | 280   | 201             |
| `"   \n   "`                            |                     | 0     | 400 `emptyText` |
| `""`                                    |                     | 0     | 400 `emptyText` |
| `"a\r\nb"`                              | `"a\nb"`            | 3     | 201             |
| `"a\rb"`                                | `"a\nb"`            | 3     | 201             |
| `"a\tb"`                                | `"a b"`             | 3     | 201             |
| `"§cRouge"`                             | `"cRouge"`          | 6     | 201             |
| `"a\u0000b\u0085c"`                     | `"abc"`             | 3     | 201             |
| `"a\n\n\n\nb"`                          | `"a\n\nb"`          | 4     | 201             |
| `"　bonjour "`                          | `"bonjour"`         | 7     | 201             |
| `"﻿hi"` (a BOM is not whitespace)       | `"﻿hi"`             | 3     | 201             |
| `"a​b"` (zero-width space, category Cf) | `"a​b"`             | 3     | 201             |

### 13.2 Idempotency

1. `POST /posts` with key K by Camille, text `"Salut"`: 201, `replayed: false`, post P.
2. The same body again: 201, `replayed: true`, the same `id` P. One post exists.
3. Key K with text `"Salut !"`: 409 `idempotencyMismatch`.
4. Key K with the same text by Mika: 409 `idempotencyMismatch`.
5. Key K with text `"  Salut  "`: 201, `replayed: true` (the cleaned text is the same).
6. With `feed.writing` switched off, step 2 again: 503 `disabled` (the flags come before the key). Switched back on: `replayed: true` again.
7. Camille deletes P, then sends step 1 again: 404 `notFound`.

### 13.3 Anonymity, by viewer

Camille posts in Global, anonymous. The views:

| Viewer                                | `author` | `mine` | `canDelete` | `canPin` |
| ------------------------------------- | -------- | ------ | ----------- | -------- |
| Camille, from `Cam_Roux`              | filled   | true   | true        | false    |
| Camille, from a second linked account | filled   | true   | true        | false    |
| Lune (moderator)                      | filled   | false  | true        | false    |
| Kael (announcer, not a moderator)     | null     | false  | false       | false    |
| Mika                                  | null     | false  | false       | false    |
| `Visitor42` (guest)                   | null     | false  | false       | false    |

Mika replies to it: the reply's `replyTo` is null (it answers the main post); the notification queued for Camille has `players` = Camille's accounts and `post.author` = Mika. Lune replies to Mika's reply, anonymous: for Kael, that reply has `author: null` and `replyTo: { id: <Mika's reply>, anonymous: false, name: "Mika L." }`; Mika's notification has `post.author: null`. The `post` events for all three carry only `{ id, feed, threadId, createdAt }`.

`POST /posts` in Announcements with `anonymous: true` by Kael: 400 `anonymousAnnouncement`.

### 13.4 Pagination

Global holds 25 posts, G1 (oldest) to G25 (newest).

1. `limit=20`: G25 to G6, `next` = c1.
2. G26 is created, then `before=c1&limit=20`: G5 to G1, `next: null`. G26 doesn't shift the page.
3. G3 is deleted between steps 1 and 2: step 2 gives G5, G4, G2, G1.
4. Announcements with A1 to A5 and A2, A4 pinned (A4 pinned last): the first page has `pinned` = A4, A2 and `posts` = A5, A3, A1.

### 13.5 Pins

A, B, C are pinned in that order (C last). Lune pins D:

1. `replace: false`: 409 `pinLimit`, `data.oldest.id` = A. Nothing changed.
2. `replace: true`: 200, `pinned` = D, C, B; `unpinned` = A. One `pins` event with D, C, B.
3. Pin D again: 200, the same group, `unpinned: null`, no event.
4. Kael unpins C: 200, `pinned` = D, B. Kael is an announcer, not a moderator: allowed.
5. Mika pins B: 403 `notAllowed`.
6. Lune pins a Global post: 409 `notPinnable`.
7. Lune deletes D: `deleted` event with D and its replies, then `pins` with B.

### 13.6 Unread and markers

1. Camille has never viewed Global; G1 exists, by Mika: `unread.global` is true.
2. `POST /seen` Global, `upTo` = G1's `createdAt`: `unread.global` false.
3. Camille posts G2: `unread.global` stays false (her own post).
4. Mika posts G3: `unread.global` true.
5. Mika replies to Camille's G2: Camille's view of G2 has `unseenReplies: true`; the reply has `answersMe: true` for Camille.
6. Camille opens G2's thread (`GET`, then `POST /posts/G2/seen`): G2's `unseenReplies` is false afterwards.

## 14. Running against a local site

1. In `LNB-Website`: `docker compose up -d`, then `pnpm dev` (the site on `http://localhost:3000`). Set `WARDEN_SERVER_SECRET` in `.env` (32 characters or more).
2. Sign in on the local site as an admin, turn `feed` on at `/admin/settings/flags` (it ships off).
3. In the mod's run folder, `config/lnbwarden-server.toml`: `api.url = "http://localhost:3000"`, `api.token` = the secret, `auth.mode = "required"` (or `optional`). Plain HTTP is accepted on localhost only.
4. Start the client with Warden and Feed (`./gradlew :apps:feed:runClient`), link the dev account through Warden's device flow on `http://localhost:3000/link`, and join the integrated or a dedicated server.
5. Make the account an announcer or a Warden admin from the local admin to try Announcements, pins and moderation.

`docs/feed-app.md` explains the memory backend, which needs no site at all.

## 15. Rollout and QA

### 15.1 Order

1. The site, with `feed` off (seeded disabled).
2. The mod, which shows "Feed unavailable" while the flag is off.
3. Turn `feed` on. `feed.writing` can be switched off on its own for a read-only period.

### 15.2 Manual checklist

On a real server against a site with `feed` on, with a player, an announcer, a Warden admin and a guest:

- [ ] Feed off: the app says unavailable, nothing crashes, the stream retries every minute; turn it on: Retry loads.
- [ ] A post from the game appears at once for another player in game, and on the site after a reload; a post from the browser appears in game within a second.
- [ ] An anonymous post: its author sees "Posted anonymously by you", the Warden admin sees the author line, the announcer and the guest see neither; same in the browser for the author.
- [ ] A reply notifies the author of what it answers, in game, online (banner) and offline (badge at next login); a reply to oneself notifies nobody.
- [ ] A reply made in the browser while the Minecraft server is stopped notifies the player after the server starts.
- [ ] An announcement notifies everyone but its author, guests included.
- [ ] Deleting a notified post takes the notification back (the badge goes).
- [ ] Pin 3 announcements, pin a 4th: the dialog, then the oldest drops back.
- [ ] Delete a main post: its thread disappears for a player who has it open ("This post was deleted").
- [ ] Give the announcer role from the admin, then from `/feed announcer add` as a Warden admin: the compose button appears on Announcements within a second; `/feed announcer add` by a plain player is refused.
- [ ] Ban a player in Warden while they are on the browser: posting is refused, reading works.
- [ ] `feed.writing` off: composing hides, likes are inactive, deleting still works.
- [ ] Unread dots: the Global dot shows after another player posts; viewing Global clears it; restart the server: it is still right; it matches the browser.
- [ ] Rate limit: a fourth post within a minute is refused with a clear message, the draft kept.
- [ ] Timeout: block the network while posting, press Retry after it comes back: one post, not two.
- [ ] Both languages: every message in English and French.
