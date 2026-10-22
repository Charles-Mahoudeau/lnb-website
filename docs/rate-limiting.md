# Rate limiting

One middleware, `server/middleware/rate-limit.ts`, limits `/api/**` and `/go/**` with [`rate-limiter-flexible`](https://github.com/animir/node-rate-limiter-flexible). The table of limits is `rulesFor` in `server/lib/rate-limit-rules.ts`; change numbers there.

| Rule                  | Applies to                                                                        | Limit       | Per     |
| --------------------- | --------------------------------------------------------------------------------- | ----------- | ------- |
| `api`                 | every `/api` route except `/api/auth/*`, `/api/health` and `/api/warden/server/*` | 3000 / min  | IP      |
| `go`                  | `/go/<id>`                                                                        | 240 / min   | IP      |
| `warden-server`       | `/api/warden/server/*` (the Minecraft server)                                     | 1200 / min  | IP      |
| `warden-client`       | `/api/warden/client/*` (the Warden mod)                                           | 600 / min   | IP      |
| `warden-link-request` | `POST /api/warden/client/link-requests`                                           | 30 / 10 min | IP      |
| `write`               | other POST, PUT, PATCH and DELETE                                                 | 60 / min    | account |
| `write-admin`         | writes under `/api/admin`, `/api/minecraft/admin`, `/api/warden/admin`            | 240 / min   | account |
| `write-heavy`         | uploads and imports, event announce and push impact, BDE sync, bulk user actions  | 20 / min    | account |
| `write-sensitive`     | `/api/link/approve`, and any route ending in `/token`                             | 10 / min    | account |

## Modes

Admins pick a mode on `/admin/rate-limit`. It is stored in `rate_limit_setting` (one row, `default`; no row means normal), read through a 10 second in-memory cache like the feature flags, and each change is logged in `admin_audit` (`rateLimit.mode`).

- **Normal**: the table above.
- **Event night**: the per-IP ceilings (`api`, `go`, `warden-server`, `warden-client`) are multiplied by 5 (`EVENT_IP_MULTIPLIER` in `shared/rate-limit.ts`), for a room sharing one Wi-Fi. The per-account limits and `warden-link-request` stay.
- **Off**: the middleware applies nothing. If the database can't be read, the last known mode is kept.

The mode doesn't touch Better Auth's limits, the join ticket limit or the mod search limit.

Join tickets have their own limit of 10 per minute per device, kept in the handler (`wardenClientService.checkTicketRate`), since a device token isn't an account. A write must pass `api` and its account rule. The mod search keeps its own 20 per minute per account (`server/services/mods/suggestions.ts`). Better Auth limits `/api/auth/*` itself (see `docs/authentication.md`).

- The IP ceilings are loose on purpose: an Epitech campus shares one public IP, and an event can put about 60 people behind it. They only stop floods.
- A caller over a limit gets `429`, the problem `rateLimited` and a `Retry-After` header in seconds.
- The client IP is the last `X-Forwarded-For` entry, the one Coolify's proxy added. Earlier entries are forged easily. Check that the proxy appends rather than keeps a client's header before trusting this in production.
- Counters are in memory: the site is one container, and a deploy resets them. If it ever runs as several, switch `createLimiter` in `server/lib/rate-limit.ts` to `RateLimiterPostgres`.
- A new route that mints a credential or does heavy work should be added to `SENSITIVE` or `HEAVY`.
