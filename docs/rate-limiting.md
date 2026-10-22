# Rate limiting

One middleware, `server/middleware/rate-limit.ts`, limits `/api/**` and `/go/**` with [`rate-limiter-flexible`](https://github.com/animir/node-rate-limiter-flexible). The table of limits is `rulesFor` in `server/lib/rate-limit-rules.ts`; change numbers there.

| Rule              | Applies to                                                                        | Limit      | Per     |
| ----------------- | --------------------------------------------------------------------------------- | ---------- | ------- |
| `api`             | every `/api` route except `/api/auth/*`, `/api/health` and `/api/warden/server/*` | 1500 / min | IP      |
| `go`              | `/go/<id>`                                                                        | 120 / min  | IP      |
| `warden-server`   | `/api/warden/server/*` (the Minecraft server)                                     | 1200 / min | IP      |
| `write`           | other POST, PUT, PATCH and DELETE                                                 | 60 / min   | account |
| `write-admin`     | writes under `/api/admin`, `/api/minecraft/admin`, `/api/warden/admin`            | 240 / min  | account |
| `write-heavy`     | uploads and imports, event announce and push impact, BDE sync, bulk user actions  | 20 / min   | account |
| `write-sensitive` | `/api/link/approve` and every `…/token`                                           | 10 / min   | account |

A write must pass `api` and its account rule. The mod search keeps its own 20 per minute per account (`server/services/mods/suggestions.ts`). Better Auth limits `/api/auth/*` itself (see `docs/authentication.md`).

- The IP ceilings are loose on purpose: an Epitech campus shares one public IP, and an event can put a hundred people behind it. They only stop floods.
- A caller over a limit gets `429`, the problem `rateLimited` and a `Retry-After` header in seconds.
- The client IP is the last `X-Forwarded-For` entry, the one Coolify's proxy added. Earlier entries are forged easily. Check that the proxy appends rather than keeps a client's header before trusting this in production.
- Counters are in memory: the site is one container, and a deploy resets them. If it ever runs as several, switch `createLimiter` in `server/lib/rate-limit.ts` to `RateLimiterPostgres`.
- A new route that mints a credential or does heavy work should be added to `SENSITIVE` or `HEAVY`.
