# API keys

Admins make API keys at `/admin/api-keys` for integrations they vouch for: the BDE website, bots, the Minecraft server, scripts. There is no public developer program and no self-service key. Only full admins manage keys.

## What a key is

- A standalone service identity: a name, a description, permissions and an expiry. Nobody's account is behind it, so it survives its creator leaving. `created_by` is kept for the audit and set to null if that account is deleted.
- The secret is `lnb_` + 40 characters. Only its SHA-256 is stored (`api_key.key_hash`). It is shown once, when the key is made or rotated. The first 8 characters (`prefix`) tell keys apart in the admin.
- Every key expires: 30, 90 or 365 days (the maximum, and the default). The table flags a key within 30 days of expiry, and the Overview lists it.
- Rotating issues a new one-year key with the same name and permissions, and brings the old key's expiry forward to the end of an overlap (1, 3 or 7 days) so the integration can switch without a gap. The old key shows as "Rotating out".
- Revoking stops a key at once and can't be undone.
- The nightly `api-keys:prune` task deletes keys 90 days after they expired or were revoked, and call counts older than 30 days.

## Permissions

The catalog is `API_KEY_GROUPS` in `shared/api-keys.ts`. A permission exists only for data a visitor can't already read.

| Permission            | Routes                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `events:read-hidden`  | `GET /api/admin/events`, `GET /api/admin/events/:id`                                                                                   |
| `registrations:read`  | `GET /api/admin/events/:id/registrations`                                                                                              |
| `registrations:write` | `POST` and `DELETE` on the registrations. The user id goes in the body; `force` is ignored, so a key never goes past an event's limit. |
| `links:read`          | `GET /api/admin/short-links`, `GET /api/admin/short-links/:id`                                                                         |
| `links:create`        | `POST /api/admin/short-links`                                                                                                          |
| `warden:read`         | `GET /api/warden/admin/players`, `GET /api/warden/admin/players/:id`                                                                   |

Destructive or account-level actions (bans, roles, user deletion, flags, rate-limit mode, API keys) can never be reached by a key.

## How a route accepts a key

Routes refuse keys unless they opt in. A route calls `requireAccess(event, { permission, user: guard })` (`server/utils/api-key.ts`):

1. No `Authorization: Bearer lnb_…` header: the route's own user guard runs, as before.
2. With one: the `apiKeys` flag must be on (503 `disabled`), the key must be valid (401), and it must hold the permission (403). Then the call is counted.

A key is read only from the `Authorization` header, never from a query string or cookie, and never on `/api/auth/*`. A write made by a key records it in the audit `data.apiKey`.

To add a key-accessible route: add a permission to the catalog if needed (with its label in `admin.apiKeys.permissions` in both locale files), call `requireAccess`, and set `key: '<permission>'` on the route in `server/lib/openapi.ts`. `test/unit/api-keys.test.ts` checks that the documented keyed routes and the catalog match.

## Rate limiting and usage

A valid key is limited by its id, not its IP: 600 reads and 60 writes per minute. Event night mode doesn't change this, off mode applies nothing, and a key call doesn't count against the per-IP `api` rule (see `docs/rate-limiting.md`).

Usage is counters only: `last_used_at` (moved at most once a minute) and daily per-key per-route call counts (`api_key_usage`). No IP, no user agent, no content.

## Flags

`apiKeys` switches every key off (503). `jobs.pruneApiKeys` skips the nightly prune. Managing keys in the admin is never gated.
