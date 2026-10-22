# Warden

Warden links Minecraft accounts to LNB accounts and tells the LNB Minecraft server who is joining. This page is the contract between the site and the Warden mod: the flows, the data, and every route under `/api/warden`.

## Rules

- An LNB account can link several Minecraft accounts, up to its limit. The limit is a global setting (1 by default), and admins can override it for one player.
- A Minecraft account, identified by its UUID, belongs to at most one LNB account.
- Warden is open to the schools listed for the `warden` app in `shared/utils/link-apps.ts` (Epitech for now).
- The Minecraft server is mod-only and runs in offline mode. A Minecraft account's UUID is the offline UUID of its username, `UUID.nameUUIDFromBytes("OfflinePlayer:" + username)`, and usernames are case-sensitive. The site checks this on every login.
- The LNB Warden mod proves who the player is. It holds a device token, created when the player approves the device on `/link`, and asks the site for a single-use join ticket before each join. The player can revoke a device at any time from `/minecraft/warden`, which signs out its online sessions.
- Bans apply to the LNB account, so they cover all of its Minecraft accounts. There is at most one active ban per player. A new ban replaces the active one. Warden bans are separate from site bans.
- Every change (link, unlink, device link, denial and revocation, ban, unban, appeal, note, warning, limit, role, settings) is written to the audit log with who did it, when, and from where (the site, the Minecraft server, or the system).
- No IP addresses are stored. Session history is kept with the account and deleted with it. Players' first name and initial show in-game under their username by default. They can hide it from `/minecraft/warden`.

## Flows

### Linking a device

1. The mod calls `POST /api/warden/client/link-requests` with `{ "deviceName": "..." }` (1 to 64 characters). No authentication; limited per IP. The answer has `requestId`, `pollSecret`, `userCode` (6 digits), `verificationUri`, `verificationUriComplete`, `expiresAt`, `expiresIn` (600) and `interval` (5).
2. The mod shows the code and address. The player opens `/link`, signs in, enters the code, and sees "Link LNB Warden (device name) to your account?" with Approve and Deny. The code is single use.
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
5. The account is linked to another LNB account: `linkedElsewhere`.
6. Not linked, and the ticket says `link: false`: `notLinked`, with `limit`.
7. Not linked, `link: true`, and the limit is reached: `accountLimitReached`, with `limit`.
8. Not linked, `link: true`: the account is linked, with an audit entry.
9. A session is opened, recording the device: `allowed`.

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
  "warnings": [{ "id": "...", "body": "...", "createdAt": "..." }]
}
```

`linked` is true when this login linked the account. Denied:

```json
{
  "result": "denied",
  "reason": "invalidTicket | schoolNotAllowed | banned | linkedElsewhere | notLinked | accountLimitReached",
  "ban": { "reason": "...", "expiresAt": "... or null" },
  "limit": { "used": 1, "max": 1 }
}
```

A login records username changes. Past usernames (`pastUsernames`) are history only: with offline UUIDs a username can't change for an account.

### `POST /api/warden/server/sessions/heartbeat`

```json
{ "sessionIds": ["..."] }
```

Returns `{ "unknown": ["..."] }`: sessions the site has closed, which the server should treat as ended (and usually kick).

### `POST /api/warden/server/sessions/end`

```json
{ "sessionId": "...", "reason": "quit | kicked" }
```

Returns 204.

### `GET /api/warden/server/players/:uuid`

For staff commands: the LNB name and school, the linked accounts, the active ban, the number of warnings and the playtime. Problem: `notLinked` (404).

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

Returns the warning. The player sees it on `/minecraft/warden` and in the next login's `warnings`.

### `GET /api/warden/server/events`

Server-Sent Events. Each event's `id` is its audit log ID. Send `Last-Event-ID` when reconnecting to receive the events you missed. Without it, the stream starts from now. The site checks for new events every second, and sends a `ping` event after 25 quiet seconds so proxies keep the connection open.

| Event      | Data                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| `kick`     | `{ "uuids": [...], "reason": "banned \| unlinked \| deviceRevoked", "ban"?: {...} }` |
| `unban`    | `{ "uuids": [...] }`                                                                 |
| `settings` | `{ "defaultMaxAccounts": 1 }`                                                        |

## Player routes

| Route                                     | What it does                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/warden/me`                      | The `/minecraft/warden` page: the limit (`used`, `max`), linked accounts with last seen, online state, playtime and past usernames, the active ban and its appeal, the history of bans and warnings (without staff names), and the first page of sessions.              |
| `PATCH /api/warden/me`                    | `{ "showRealName": true }`                                                                                                                                                                                                                                              |
| `GET /api/warden/me/devices`              | The player's active devices: `id`, `name`, `createdAt`, `lastUsedAt`, `expiresAt`.                                                                                                                                                                                      |
| `DELETE /api/warden/me/devices/:id`       | Revokes a device (204) and kicks its online sessions.                                                                                                                                                                                                                   |
| `DELETE /api/warden/me/accounts/:uuid`    | Unlinks an account, and kicks it if it's online.                                                                                                                                                                                                                        |
| `GET /api/warden/me/sessions`             | Recent sessions, newest first.                                                                                                                                                                                                                                          |
| `POST /api/warden/me/bans/:banId/appeal`  | `{ "body": "..." }`. Once per ban, while it's active.                                                                                                                                                                                                                   |
| `GET /api/warden/link-requests/:userCode` | For `/link`: the device behind a code the player has claimed, `{ "kind": "device", "deviceName": "..." }`.                                                                                                                                                              |
| `GET /api/warden/heads/:uuid`             | The account's skin head (64 px PNG), for linked accounts only. The site fetches it from Crafatar, or mc-heads.net when Crafatar is down, and caches it for a day, so visitors never contact these services. Every account gets Steve, since the server is offline-mode. |

## Admin routes

| Route                                                        | What it does                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET /api/warden/admin/players?q=&status=`                   | Players, searched by name, email or Minecraft username. `status`: `all`, `banned`, `online`.         |
| `GET /api/warden/admin/players/:userId`                      | One player: accounts, username history, bans, notes, sessions and audit trail.                       |
| `PATCH /api/warden/admin/players/:userId`                    | `{ "maxAccounts": 3 }`, or `null` to use the global limit.                                           |
| `PUT /api/warden/admin/players/:userId/role`                 | `{ "wardenAdmin": true }`. Site admins only.                                                         |
| `DELETE /api/warden/admin/players/:userId/devices/:deviceId` | Revokes one of the player's devices.                                                                 |
| `DELETE /api/warden/admin/players/:userId/accounts/:uuid`    | Unlinks an account.                                                                                  |
| `POST /api/warden/admin/players/:userId/bans`                | `{ "reason": "...", "durationSeconds": 86400 }`                                                      |
| `POST /api/warden/admin/bans/:banId/revoke`                  | `{ "reason": "optional" }`                                                                           |
| `POST /api/warden/admin/players/:userId/notes`               | `{ "kind": "note", "body": "..." }`. A `note` stays private, and a `warning` is shown to the player. |
| `GET /api/warden/admin/appeals?status=`                      | Appeals, with their ban.                                                                             |
| `GET /api/warden/admin/users?q=`                             | Players of Warden's schools, by name or email, for pickers such as the mod editor's.                 |
| `POST /api/warden/admin/appeals/:id/decision`                | `{ "accept": true, "response": "..." }`. Accepting lifts the ban.                                    |
| `GET /api/warden/admin/audit?userId=&action=&source=`        | The audit log.                                                                                       |
| `GET` and `PATCH /api/warden/admin/settings`                 | `{ "defaultMaxAccounts": 1 }`                                                                        |

## Environment

- `WARDEN_SERVER_SECRET`: the Minecraft server's API key, at least 32 characters (`openssl rand -base64 32`).

Skin heads are cached in Nitro storage under `.data/warden-heads`. On Coolify, keep `.data` on a persistent volume, or the cache starts empty after each deploy.
