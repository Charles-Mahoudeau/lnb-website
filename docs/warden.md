# Warden

Warden links Minecraft accounts to LNB accounts and tells the LNB Minecraft server who is joining. This page is the contract between the site and the Warden mod: the flows, the data, and every route under `/api/warden`.

## Rules

- An LNB account can link several Minecraft accounts, up to its limit. The limit is a global setting (1 by default), and admins can override it for one player.
- A Minecraft account, identified by its UUID, belongs to at most one LNB account.
- Unlinking keeps the account: its sessions and playtime stay, it only stops counting as linked (`unlinked_at`), and it stops counting against the limit. The same player can link it again and get their history back. See "Account takeovers".
- Warden is open to the schools listed for the `warden` app in `shared/utils/link-apps.ts` (Epitech, e-artsup and ISEG, the same schools as sign-in).
- The Minecraft server is mod-only and runs in offline mode. A Minecraft account's UUID is the offline UUID of its username, `UUID.nameUUIDFromBytes("OfflinePlayer:" + username)`, and usernames are case-sensitive. The site checks this on every login.
- The LNB Warden mod proves who the player is. It holds a device token, created when the player approves the device on `/link`, and asks the site for a single-use join ticket before each join. The player can revoke a device at any time from `/minecraft/account`, which signs out its online sessions.
- Bans and warnings can name the server rules they apply (`ruleIds`, kept as a snapshot in `rule_citations`, returned as `rules`), and the server reads the rules at `GET /api/warden/server/rules`. See `docs/rules.md`.
- Bans apply to the LNB account, so they cover all of its Minecraft accounts. There is at most one active ban per player. A new ban replaces the active one. Warden bans are separate from site bans.
- Every change (link, unlink, account takeover, device link, denial and revocation, ban, unban, appeal, note, warning, limit, role, settings) is written to the one audit log (`audit`, see `docs/activity-log.md`) with who did it, when, and from where (the site, the Minecraft server, or the system). Warden admins read their part of it in Settings › Activity.
- No IP addresses are stored. Session history is kept with the account and deleted with it, also after an unlink. Players' first name and initial show in-game under their username by default. They can hide it from `/minecraft/account`.

## Flows

### Linking a device

1. The mod calls `POST /api/warden/client/link-requests` with `{ "deviceName": "..." }` (1 to 64 characters). No authentication; limited per IP. The answer has `requestId`, `pollSecret`, `userCode` (6 digits), `verificationUri`, `verificationUriComplete`, `expiresAt`, `expiresIn` (600) and `interval` (5).
2. The mod shows the code and address. The player opens `/link`, signs in, enters the code, and sees "Link (device name) to your account" with Approve and Deny. The code is single use.
3. The mod calls `POST /api/warden/client/link-requests/:requestId/poll` with `{ "pollSecret": "..." }` no faster than every `interval` seconds (otherwise 429, `slowDown`). The answer is `{ "status": "pending | denied | expired" }`, or once approved `{ "status": "approved", "token": "lnbw_...", "expiresAt": "...", "user": { "id": "...", "name": "..." } }`.

The token is returned exactly once. The device is created at that poll, and later polls answer `expired`. An approved request can be collected for 5 minutes after its code expires. A wrong `pollSecret` or an unknown ID is a 404. The poll secret is stored hashed.

Codes use the same 6-digit pool as other apps on `/link` (Better Auth's `device_code` table). They can only be created through the route above: `/api/auth/device/code` refuses the `warden` client, and Better Auth's own approve and deny routes are disabled in favor of `/api/link/approve` and `/api/link/deny`.

### Device tokens

A token is `lnbw_` followed by 32 random bytes in base64url. Only its SHA-256 hash is stored. It expires 90 days after its last use: `lastUsedAt` and `expiresAt` are refreshed at most once an hour. A token works only on `/api/warden/client/**`. An unknown, expired or revoked token is a 401, and a school the player no longer belongs to is a 403 (`schoolNotAllowed`). Deleting an account deletes its devices.

### Joining

1. The player joins `mc.bde-teknantes.fr`. The mod calls `POST /api/warden/client/join-tickets` with `{ "nonce", "username", "link" }`. The nonce is 32 random bytes in base64url, the username matches `^\w{3,16}$`, and `link` says whether the player agreed to link this account if it isn't yet. The answer is `{ "ticket", "expiresAt" }`. A ticket is random, stored hashed, single use, valid for 60 seconds, and bound to the device, nonce, username and `link`. Limited to 10 per minute per device. No ban or link check happens here.
2. The mod sends the ticket to the server in the join handshake, with the nonce. The server calls `POST /api/warden/server/login`.
3. While the player is online, the server calls `POST /api/warden/server/sessions/heartbeat` every 60 seconds, and `POST /api/warden/server/sessions/end` when they leave. Sessions with no heartbeat for 3 minutes are closed by the site at their last heartbeat.

### Presence

The mod calls `PUT /api/warden/client/presence` with `{ "state": "menu" }` while the player is in the game's menus (kept 3 minutes, so repeat it), and `DELETE` when they leave. A player on the server counts as online, which beats "menu", which beats offline. `wardenPresenceService.ofUsers` reads it; no feature uses it yet.

### Live changes

The server keeps `GET /api/warden/server/events` open. When a player is banned, unlinked, or has a device revoked on the site, the site sends a `kick` event and the server disconnects them.

## Authentication

| Caller           | How                                                              |
| ---------------- | ---------------------------------------------------------------- |
| Minecraft server | `Authorization: Bearer <WARDEN_SERVER_SECRET>`                   |
| Warden mod       | `Authorization: Bearer <device token>`, `/api/warden/client/**`  |
| Player           | The site session cookie                                          |
| Admin            | The site session cookie, with the `admin` or `warden-admin` role |

Site admins are Warden admins too. Only site admins can give or remove `warden-admin`. Logins return the player's roles, so the server can give Warden admins their in-game permissions. A ban, unban or warning sent by the server with an `issuer` is refused unless that issuer is a linked account with the role. Without an `issuer`, it comes from the console.

## Conventions

- Bodies and responses are JSON. Their Zod schemas are in `shared/schemas/warden.ts`, and the full reference for every route is at `/api/docs`.
- UUIDs are written with dashes. Usernames are 3 to 16 letters, digits or underscores.
- Dates are ISO 8601 strings in UTC.
- `durationSeconds` is a positive number of seconds, or `null` for a permanent ban.
- Errors have an HTTP status and a `data.problem` code, listed with each route.
- Lists take `cursor` and return `{ items, nextCursor }`, with `nextCursor` null on the last page.

## Warden mod routes

Under `/api/warden/client`. The first two need no authentication, the others the device token (`wardenClient` in the API reference). All of them are behind the `warden.clientApi` feature flag.

| Route                                 | What it does                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /link-requests`                 | Starts a device link, see above. Limited to 30 per 10 minutes per IP.                                                                                                                               |
| `POST /link-requests/:requestId/poll` | Collects the answer, see above. Problems: `slowDown` (429).                                                                                                                                         |
| `GET /me`                             | `{ user: { id, name, shortName, showRealName }, accounts: [{ uuid, username, linkedAt, lastSeenAt, online, playtimeSeconds }], limit: { used, max }, activeBan, device: { id, name, expiresAt } }`. |
| `POST /join-tickets`                  | A join ticket, see above. Problems: `rateLimited` (429, with `Retry-After`).                                                                                                                        |
| `PUT /presence`, `DELETE /presence`   | See above. Both return 204.                                                                                                                                                                         |
| `POST /sign-out`                      | Revokes the calling device. Returns 204.                                                                                                                                                            |

## Minecraft server routes

### `POST /api/warden/server/login`

```json
{ "ticket": "...", "nonce": "...", "uuid": "...", "username": "Notch" }
```

The checks run in this order:

1. `uuid` is not the offline UUID of `username`: 400, problem `invalidUuid`.
2. The ticket is unknown, used, expired, doesn't match the nonce or username, or its device is revoked or expired: `denied`, `invalidTicket`. The ticket is marked used atomically, whatever the result.
3. The player's school is no longer allowed: `schoolNotAllowed`.
4. An active ban: `banned`, with `ban`. This comes before linking.
5. The player's weekly playtime is used up inside a restricted window, outside the grace period, and the mode is `enforce`: `playtimeLimitReached`, with `playtime: { windowEndsAt, resetsAt }` (see `docs/playtime.md`). In `observe` and `off` nobody is denied.
6. The account is linked to another LNB account: `linkedElsewhere`.
7. Not linked (never linked, or unlinked by anyone), and the ticket says `link: false`: `notLinked`, with `limit`.
8. Not linked, `link: true`, and the limit is reached: `accountLimitReached`, with `limit`.
9. Not linked, `link: true`: the account is linked, with an audit entry. An unlinked account that belonged to this player keeps its history. One that belonged to another player is taken over (see below).
10. A session is opened, recording the device: `allowed`.

Allowed:

```json
{
  "result": "allowed",
  "sessionId": "...",
  "linked": true,
  "player": {
    "userId": "...",
    "displayName": "Charles M., or null when hidden",
    "roles": ["warden-admin"]
  },
  "account": { "uuid": "...", "username": "Notch" },
  "warnings": [{ "id": "...", "body": "...", "createdAt": "..." }],
  "playtime": {
    "enforced": true,
    "limited": true,
    "counting": true,
    "remainingSeconds": 7260,
    "limitSeconds": 36000,
    "windowEndsAt": "2026-11-20T16:00:00.000Z",
    "nextWindowStartsAt": null,
    "grace": false,
    "graceEndsAt": null
  }
}
```

`linked` is true when this login linked the account. `playtime` is the weekly limit of this Minecraft account, worked out by the site (see `docs/playtime.md`): `enforced` is false in `observe`, and the server then shows and does nothing with it; `limited` is false when no limit applies (exempt, closed, off); `counting` is true inside a restricted window; `grace` is true when the allowance is used up but the player may stay until `graceEndsAt`. Denied:

```json
{
  "result": "denied",
  "reason": "invalidTicket | schoolNotAllowed | banned | playtimeLimitReached | linkedElsewhere | notLinked | accountLimitReached",
  "ban": { "reason": "...", "expiresAt": "... or null" },
  "limit": { "used": 1, "max": 1 },
  "playtime": { "windowEndsAt": "... or null", "resetsAt": "..." }
}
```

A login records username changes. Past usernames (`pastUsernames`) are history only: with offline UUIDs a username can't change for an account.

### `POST /api/warden/server/sessions/heartbeat`

```json
{ "sessionIds": ["..."] }
```

Returns `{ "unknown": ["..."], "playtime": { "<sessionId>": {...} } }`: `unknown` is the sessions the site has closed, which the server should treat as ended (and usually kick). `playtime` is the state of each open session, the same object as in the login answer: a safety net for missed events, to be treated like `playtimeUpdate`. The site counts a session's time up to its last heartbeat, so send it every 60 seconds at most.

### `POST /api/warden/server/sessions/end`

```json
{ "sessionId": "...", "reason": "quit | kicked" }
```

Returns 204.

### `GET /api/warden/server/players/:uuid`

For staff commands: the LNB name and school, the linked accounts, the active ban, the number of warnings, the playtime, and the week's limit (`playtime`, the login object with `state` and `usedSeconds`). Problem: `notLinked` (404).

### `POST /api/warden/server/players/:uuid/bans`

```json
{
  "reason": "Griefing at spawn",
  "durationSeconds": 604800,
  "issuer": { "uuid": "...", "username": "Moderator" }
}
```

Returns the ban. Problems: `notLinked` (404), `issuerNotAllowed` (403).

### `POST /api/warden/server/players/:uuid/unban`

```json
{ "reason": "optional", "issuer": { "uuid": "...", "username": "..." } }
```

Returns the revoked ban. Problems: `notLinked` (404), `notBanned` (409), `issuerNotAllowed` (403).

### `POST /api/warden/server/players/:uuid/warnings`

```json
{ "body": "Keep the chat friendly", "issuer": { "uuid": "...", "username": "..." } }
```

Returns the warning. The player sees it on `/minecraft/account` and in the next login's `warnings`.

### `GET /api/warden/server/events`

Server-Sent Events. Each event's `id` is its audit log ID. Send `Last-Event-ID` when reconnecting to receive the events you missed. Without it, or with one above the newest ID, the stream starts from now. The site checks for new events every second, and sends a `ping` event after 25 quiet seconds so proxies keep the connection open.

| Event              | Data                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kick`             | `{ "uuids": [...], "reason": "banned \| unlinked \| deviceRevoked \| playtimeLimit", "ban"?: {...}, "playtime"?: { "windowEndsAt", "resetsAt" } }`           |
| `playtimeWarning`  | `{ "uuids": [...], "remainingSeconds", "kind": "allowance \| windowStart" }`: time is running out, or a window is about to open for a player with none left. |
| `playtimeGrace`    | `{ "uuids": [...], "graceEndsAt" }`: the allowance ran out inside the grace period. The player stays until then.                                             |
| `playtimeUpdate`   | `{ "uuids": [...], "playtime": {...} }`: the state changed while online (a window started or ended, extra time, limit switched off).                         |
| `unban`            | `{ "uuids": [...] }`                                                                                                                                         |
| `settings`         | `{ "defaultMaxAccounts": 1 }`                                                                                                                                |
| `anticheatVerdict` | `{ "sessionId", "uuid", "reportId", "verdict", "files": [...] }`: the verdict of an online player changed. See `docs/anticheat.md`.                          |
| `anticheatAlert`   | `{ "kind", "userId", "uuid", "sha512", "name" }`: something an admin should look at (nullable fields).                                                       |

## Player routes

| Route                                     | What it does                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/warden/me`                      | The `/minecraft/account` page: the limit (`used`, `max`), linked accounts with last seen, online state, playtime and past usernames, the active ban and its appeal, the history of bans and warnings (without staff names), and the first page of sessions.             |
| `PATCH /api/warden/me`                    | `{ "showRealName": true }`                                                                                                                                                                                                                                              |
| `GET /api/warden/me/devices`              | The player's active devices: `id`, `name`, `createdAt`, `lastUsedAt`, `expiresAt`.                                                                                                                                                                                      |
| `DELETE /api/warden/me/devices/:id`       | Revokes a device (204) and kicks its online sessions.                                                                                                                                                                                                                   |
| `DELETE /api/warden/me/accounts/:uuid`    | Unlinks an account (its playtime and sessions stay), and kicks it if it's online.                                                                                                                                                                                       |
| `GET /api/warden/me/sessions`             | Recent sessions, newest first.                                                                                                                                                                                                                                          |
| `POST /api/warden/me/bans/:banId/appeal`  | `{ "body": "..." }`. Once per ban, while it's active.                                                                                                                                                                                                                   |
| `GET /api/warden/link-requests/:userCode` | For `/link`: the device behind a code the player has claimed, `{ "kind": "device", "deviceName": "..." }`.                                                                                                                                                              |
| `GET /api/warden/heads/:uuid`             | The account's skin head (64 px PNG), for linked accounts only. The site fetches it from Crafatar, or mc-heads.net when Crafatar is down, and caches it for a day, so visitors never contact these services. Every account gets Steve, since the server is offline-mode. |

## Admin routes

| Route                                                        | What it does                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/warden/admin/players?q=&status=`                   | Players, searched by name, email or Minecraft username. `status`: `all`, `banned`, `online`. The admin's own list is `GET /api/admin/people` (`docs/people.md`).                                                                       |
| `GET /api/warden/admin/players/:userId`                      | One player: accounts, username history, bans, notes, sessions (the audit trail is in Settings › Activity).                                                                                                                             |
| `PATCH /api/warden/admin/players/:userId`                    | `{ "maxAccounts": 3 }`, or `null` to use the global limit.                                                                                                                                                                             |
| `PUT /api/warden/admin/players/:userId/role`                 | `{ "wardenAdmin": true }`. Site admins only.                                                                                                                                                                                           |
| `DELETE /api/warden/admin/players/:userId/devices/:deviceId` | Revokes one of the player's devices.                                                                                                                                                                                                   |
| `DELETE /api/warden/admin/players/:userId/accounts/:uuid`    | Unlinks an account.                                                                                                                                                                                                                    |
| `POST /api/warden/admin/transfers/:transferId/dismiss`       | Dismisses the warning about an account takeover, for both players (204, `alreadyDismissed` 409).                                                                                                                                       |
| `POST /api/warden/admin/players/:userId/bans`                | `{ "reason": "...", "durationSeconds": 86400 }`                                                                                                                                                                                        |
| `POST /api/warden/admin/bans/:banId/revoke`                  | `{ "reason": "optional" }`                                                                                                                                                                                                             |
| `PATCH /api/warden/admin/bans/:banId`                        | `{ "expiresAt": "2027-01-01T00:00:00Z" }`, or `null` for a permanent ban. A ban in force only, and the end must be in the future (`invalidEnd`). Audited as `ban.update`, and sent to the server as a `kick` with the reason `banned`. |
| `GET /api/warden/admin/feed?kind=`                           | Bans in force and the latest 50 warnings and notes, for Moderation > Bans.                                                                                                                                                             |
| `POST /api/warden/admin/players/:userId/notes`               | `{ "kind": "note", "body": "..." }`. A `note` stays private, and a `warning` is shown to the player.                                                                                                                                   |
| `GET /api/warden/admin/appeals?status=`                      | Appeals, with their ban.                                                                                                                                                                                                               |
| `GET /api/warden/admin/users?q=`                             | Players of Warden's schools, by name or email, for pickers such as the mod editor's.                                                                                                                                                   |
| `POST /api/warden/admin/appeals/:id/decision`                | `{ "accept": true, "response": "..." }`. Accepting lifts the ban.                                                                                                                                                                      |
| `GET` and `PATCH /api/warden/admin/settings`                 | `{ "defaultMaxAccounts": 1 }`                                                                                                                                                                                                          |

## Account takeovers

The server is in offline mode, so a username proves nothing: an unlinked account's UUID can be linked by anyone who picks the same username. When a player links an account that another player unlinked:

- The account moves to the new player and starts again at no playtime, with the new player's username and link date.
- The sessions stay with the previous owner (`warden_session.user_id`). The account's playtime is added to `warden_player.transferred_playtime_seconds`, so the previous owner's total stays the same.
- The takeover is recorded in `warden_account_transfer` and in the audit log (`minecraft.link.transfer`, on the new player, with the previous one's ID). It counts against the new player's limit like any link.
- Admins see a warning pill in the People list on both players ("Took over an account", "Account taken over", or "Account takeovers" when both), and the takeovers on each player's page. Any Warden admin can dismiss a takeover, for both players (`transfer.dismiss`). The pill goes away when none is left to review, and the takeover stays on the page.
- Players never see any of this, in the site, the mod or the API. Their unlink dialog only says the playtime is kept if they link the account again.

A link by the same player is not a takeover.

## Environment

- `WARDEN_SERVER_SECRET`: the Minecraft server's API key, at least 32 characters (`openssl rand -base64 32`).

Skin heads are cached in Nitro storage under `.data/warden-heads`. On Coolify, keep `.data` on a persistent volume, or the cache starts empty after each deploy.

## Reset all sanctions

The Danger zone of Warden's Settings tab (site admins only). Typing `reset all sanctions` deletes every ban (the ones in force too, so banned players can play again), every appeal (they go with their ban), every note and warning, and resets the anticheat's trust scores, manual holds, timelines, actions and alerts, all in one transaction (`POST /api/warden/admin/reset-sanctions`, `server/services/warden/reset.ts`). The audit log, files and their decisions stay. It is audited as `warden.resetSanctions` with the row counts. The anticheat's own "Reset the sanctions" button still resets only its part.
