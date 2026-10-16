# Warden

Warden links Minecraft accounts to LNB accounts and tells the LNB Minecraft server who is joining. This page is the contract between the site and the Warden mod: the flows, the data, and every route under `/api/warden`.

## Rules

- An LNB account can link several Minecraft accounts, up to its limit. The limit is a global setting (1 by default), and admins can override it for one player.
- A Minecraft account, identified by its UUID, belongs to at most one LNB account.
- Warden is open to the schools listed for the `warden` app in `shared/utils/link-apps.ts` (Epitech for now).
- Each player has a personal server address, `<token>.mc.bde-teknantes.fr`. The token names their LNB account. Every login needs it, and for cracked accounts it's the only proof of identity. The player can regenerate it at any time, which signs out their online sessions.
- Bans apply to the LNB account, so they cover all of its Minecraft accounts. There is at most one active ban per player. A new ban replaces the active one. Warden bans are separate from site bans.
- Every change (link, link code made or cancelled by an admin, unlink, new token, ban, unban, appeal, note, warning, limit, role, settings) is written to the audit log with who did it, when, and from where (the site, the Minecraft server, or the system).
- No IP addresses are stored. Session history is kept with the account and deleted with it. Players' first name and initial show in-game under their username by default. They can hide it from `/minecraft/warden`.

## Flows

### First join

1. The player joins `mc.bde-teknantes.fr` with no token, or with an account that isn't linked yet.
2. The server calls `POST /api/warden/server/link-requests` and kicks the player with the 6-digit code and the link address (`verificationUriComplete`).
3. The player opens `/link`, signs in, enters the code, sees the Minecraft account, and links it. The site then sends them to `/minecraft/warden`, which shows their server address.
4. The server can poll `GET /api/warden/server/link-requests/:id`, or wait for the `link` event. The player then joins again through their own address.

Codes last 10 minutes and use the same 6-digit codes as other apps on `/link` (Better Auth's `device_code` table). Warden codes can only be created by the Minecraft server: `/api/auth/device/code` refuses the `warden` client.

### Joining

1. The player joins through `<token>.mc.bde-teknantes.fr`. The server reads the token from the handshake host name.
2. The server calls `POST /api/warden/server/login`. The answer is `allowed`, with a `sessionId`, or `denied`, with a reason. When the token is valid but the account isn't linked, the answer includes a link request bound to that player.
3. While the player is online, the server calls `POST /api/warden/server/sessions/heartbeat` every 60 seconds, and `POST /api/warden/server/sessions/end` when they leave. Sessions with no heartbeat for 3 minutes are closed by the site at their last heartbeat.

### Live changes

The server keeps `GET /api/warden/server/events` open. When a player is banned, unlinked or gets a new token on the site, the site sends a `kick` event and the server disconnects them.

## Authentication

| Caller           | How                                                              |
| ---------------- | ---------------------------------------------------------------- |
| Minecraft server | `Authorization: Bearer <WARDEN_SERVER_SECRET>`                   |
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

## Minecraft server routes

### `POST /api/warden/server/link-requests`

Creates a link code for a Minecraft account.

```json
{
  "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "username": "Notch",
  "cracked": false,
  "token": "optional, from the host name"
}
```

With a valid `token`, the request is bound to that player: only they can link it. A pending request for the same UUID is returned again instead of a new code.

```json
{
  "requestId": "...",
  "userCode": "123456",
  "expiresAt": "2026-10-15T20:10:00.000Z",
  "expiresIn": 600,
  "interval": 5,
  "verificationUri": "https://<site>/link",
  "verificationUriComplete": "https://<site>/link?code=123456",
  "boundToUser": false
}
```

Problems: `alreadyLinked` (409), `crackedNotAllowed` (403), `banned` (403, bound requests only).

### `GET /api/warden/server/link-requests/:id`

```json
{ "status": "pending | approved | denied | expired", "userId": "set once approved" }
```

### `POST /api/warden/server/login`

```json
{ "token": "...", "uuid": "...", "username": "Notch", "cracked": false }
```

Allowed:

```json
{
  "result": "allowed",
  "sessionId": "...",
  "player": {
    "userId": "...",
    "displayName": "Charles M., or null when hidden",
    "roles": ["warden-admin"]
  },
  "account": { "uuid": "...", "username": "Notch" },
  "warnings": [{ "id": "...", "body": "...", "createdAt": "..." }]
}
```

Denied:

```json
{
  "result": "denied",
  "reason": "unknownToken | notLinked | linkedElsewhere | banned | crackedNotAllowed | crackedMismatch | schoolNotAllowed",
  "ban": { "reason": "...", "expiresAt": "... or null" },
  "link": { "...": "a link request, as above, for notLinked" }
}
```

- `linkedElsewhere`: the account belongs to another LNB account than the token's.
- `crackedMismatch`: the account was linked as premium and now joins as cracked, or the other way round.
- A login records username changes and opens a session.

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

| Event      | Data                                                     |
| ---------- | -------------------------------------------------------- |
| `kick`     | `{ "uuids": [...], "reason": "banned                     | unlinked | tokenRotated", "ban"?: {...} }` |
| `unban`    | `{ "uuids": [...] }`                                     |
| `link`     | `{ "requestId": "...", "uuid": "...", "userId": "..." }` |
| `settings` | `{ "allowCracked": true, "defaultMaxAccounts": 1 }`      |

## Player routes

| Route                                     | What it does                                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/warden/me`                      | The `/minecraft/warden` page: server address, the limit (`used`, `max`), linked accounts with last seen, online state, playtime and past usernames, the active ban and its appeal, the history of bans and warnings (without staff names), and the first page of sessions. |
| `PATCH /api/warden/me`                    | `{ "showRealName": true }`                                                                                                                                                                                                                                                 |
| `POST /api/warden/me/token`               | Regenerates the token and returns `{ "serverUrl": "..." }`.                                                                                                                                                                                                                |
| `DELETE /api/warden/me/accounts/:uuid`    | Unlinks an account, and kicks it if it's online.                                                                                                                                                                                                                           |
| `GET /api/warden/me/sessions`             | Recent sessions, newest first.                                                                                                                                                                                                                                             |
| `POST /api/warden/me/bans/:banId/appeal`  | `{ "body": "..." }`. Once per ban, while it's active.                                                                                                                                                                                                                      |
| `GET /api/warden/link-requests/:userCode` | For `/link`: the Minecraft account behind a code the player has claimed, and their limit.                                                                                                                                                                                  |
| `GET /api/warden/heads/:uuid`             | The account's skin head (64 px PNG), for linked accounts and pending link requests only. The site fetches it from Crafatar, or mc-heads.net when Crafatar is down, and caches it for a day, so visitors never contact these services. Cracked accounts get Steve.          |

New problems on `/link` for Warden codes: `accountLimitReached`, `minecraftAccountTaken`, `wrongAccount` (the code is bound to another player).

## Admin routes

| Route                                                     | What it does                                                                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/warden/admin/players?q=&status=`                | Players, searched by name, email or Minecraft username. `status`: `all`, `banned`, `online`.                                                                                                                                |
| `GET /api/warden/admin/players/:userId`                   | One player: accounts, username history, bans, notes, sessions and audit trail.                                                                                                                                              |
| `PATCH /api/warden/admin/players/:userId`                 | `{ "maxAccounts": 3 }`, or `null` to use the global limit.                                                                                                                                                                  |
| `PUT /api/warden/admin/players/:userId/role`              | `{ "wardenAdmin": true }`. Site admins only.                                                                                                                                                                                |
| `POST /api/warden/admin/players/:userId/token`            | Regenerates the player's token, for a leaked address.                                                                                                                                                                       |
| `DELETE /api/warden/admin/players/:userId/accounts/:uuid` | Unlinks an account.                                                                                                                                                                                                         |
| `POST /api/warden/admin/players/:userId/bans`             | `{ "reason": "...", "durationSeconds": 86400 }`                                                                                                                                                                             |
| `POST /api/warden/admin/bans/:banId/revoke`               | `{ "reason": "optional" }`                                                                                                                                                                                                  |
| `POST /api/warden/admin/players/:userId/notes`            | `{ "kind": "note", "body": "..." }`. A `note` stays private, and a `warning` is shown to the player.                                                                                                                        |
| `GET /api/warden/admin/appeals?status=`                   | Appeals, with their ban.                                                                                                                                                                                                    |
| `GET /api/warden/admin/minecraft/:username?cracked=`      | The account a username names: its UUID from Mojang for premium accounts, or worked out from the name for cracked ones, and who linked it, if anyone. Problems: `unknownMinecraftUsername` (404), `mojangUnavailable` (502). |
| `POST /api/warden/admin/link-requests`                    | `{ "username": "jeb_", "cracked": false, "userId": "optional" }`. Makes a link code by hand, for a player who can't get one from the server. With `userId`, only that player can use it.                                    |
| `GET /api/warden/admin/link-requests`                     | Codes made by hand in the last 7 days, with who made them, who they're for and whether they were used.                                                                                                                      |
| `DELETE /api/warden/admin/link-requests/:id`              | Cancels a code made by hand while it's still waiting. Problem: `linkRequestClosed` (409).                                                                                                                                   |
| `GET /api/warden/admin/users?q=`                          | Players of Warden's schools, by name or email, to make a code for.                                                                                                                                                          |
| `POST /api/warden/admin/appeals/:id/decision`             | `{ "accept": true, "response": "..." }`. Accepting lifts the ban.                                                                                                                                                           |
| `GET /api/warden/admin/audit?userId=&action=&source=`     | The audit log.                                                                                                                                                                                                              |
| `GET` and `PATCH /api/warden/admin/settings`              | `{ "defaultMaxAccounts": 1, "allowCracked": true }`                                                                                                                                                                         |

## Environment

- `WARDEN_SERVER_SECRET`: the Minecraft server's API key, at least 32 characters (`openssl rand -base64 32`).
- `WARDEN_SERVER_HOST`: the domain under which player addresses live, `mc.bde-teknantes.fr`. It needs a wildcard DNS record (`*.mc.bde-teknantes.fr`) pointing to the Minecraft server.

Skin heads are cached in Nitro storage under `.data/warden-heads`. On Coolify, keep `.data` on a persistent volume, or the cache starts empty after each deploy.
