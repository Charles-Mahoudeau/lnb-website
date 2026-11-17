# Playtime limits: website implementation plan

This plan builds the website side of the weekly Minecraft playtime limit: the rules, the counting, the enforcement through Warden, the player's Minecraft account page and the admin section. The Minecraft mod and server are out of scope: this repo only defines the contract they follow, in `docs/plans/playtime-limits-mod.md` (to give to the mod developers).

Approved mocks: [Minecraft account mocks](https://claude.ai/artifact/Emp7XZbq4adjKHCqu7BQEs), layout A, "Playtime on top" (version 12). It is recorded in `docs/design.md` ("Minecraft account"). The mock is a layout reference, not code to port.

## How to work through this plan

- Read `CLAUDE.md`, `docs/architecture.md`, `docs/design.md`, `docs/warden.md`, `docs/feature-flags.md` and `docs/rate-limiting.md` first. Their rules apply to every slice and are not repeated here. `docs/plans/anticheat.md` is the closest example of a plan like this one, and of its `off`, `observe` and `enforce` modes.
- Work on the branch `feat/playtime-limits`. Do the slices in order. One slice per session works best. Slice 0 needs the user's go-ahead on its own.
- Each slice ends with: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (start PostgreSQL with `docker compose up -d` first), then atomic commits with `git commit -s`, Conventional Commits subjects, and no AI attribution. Never push: ask the user.
- If a step contradicts the code you find, stop and ask the user instead of guessing. Do not widen the scope.
- Server code imports framework helpers from `nuxt/server`. Use `parseBody`, `parseParams` and `parseQuery` from `server/utils/validation.ts`. Every new route needs an entry in `server/lib/openapi.ts` and, when it needs its own limit, a row in `server/lib/rate-limit-rules.ts`. Shapes are Zod schemas in `shared/schemas/playtime.ts`.
- Every user-facing string goes in both `i18n/locales/en.json` and `i18n/locales/fr.json`. Write "LNB", never "La LNB".
- Handlers stay 5 to 10 lines. The rules live in `server/services/playtime/`, and the pure ones in `rules.ts`, which imports no Nuxt or database code so it can be tested alone.
- Frontend work follows `docs/design.md`. The Minecraft account page is already designed, so don't ask for new mocks for it. A new admin screen does need one (see slice 4).

## Decisions already made

These were settled with the user. Do not reopen them.

| Topic               | Decision                                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who is limited      | Everyone with a linked Minecraft account. Exemptions can be set on an LNB account or on one Minecraft account.                                                                                                                                                                                              |
| Whose time          | One allowance per LNB account, pooled over its linked Minecraft accounts that are not exempt. An exempt account never uses any of it, even when the player's other account is limited.                                                                                                                      |
| Allowance           | 10 hours a week by default. The week starts Monday 00:00 in Europe/Paris and the allowance resets then.                                                                                                                                                                                                     |
| What counts         | Only time played inside the restricted hours. Time outside them is free, shown as "not counted", and never capped. Counted in seconds.                                                                                                                                                                      |
| Schedule            | Per weekday, zero or more ranges (for example 9:00 to 12:00 and 14:00 to 17:00), in Europe/Paris wall-clock time, so a week can be 167 or 169 hours around a clock change. One global schedule. A school's schedule replaces it as a whole.                                                                 |
| Overrides           | Each setting is inherited on its own: player, then school, then global. A player overrides the allowance, the grace length and the warning times only. The schedule is overridden at school level only.                                                                                                     |
| Schools             | School overrides ship now. They work on `user.tenantId`. The three allowed schools can link (slice 0).                                                                                                                                                                                                      |
| Closures            | A date range with a label, for everyone or for chosen schools. During a closure nothing counts and the player sees "No limit this week". "Skip this week" is a shortcut that creates a closure for the current Monday to Sunday.                                                                            |
| Event mode          | An event can switch the limit off during its start to end, for registered players (default) or everyone. It is a closure tied to the event, kept in step with it. Nobody edits it by hand.                                                                                                                  |
| Grace period        | When the allowance runs out in the last N minutes of a window (60 by default, set globally, per school or per player, can be switched off), the player isn't kicked: they play on until the window ends, and that time isn't counted. Outside that hour, they are kicked. A player joining then is allowed. |
| Warnings            | A list of "minutes left" values, 30, 10, 5 and 1 by default, set globally, per school or per player. Each is sent once per session. A player online with no allowance left when a window is about to open is warned 5 and 1 minutes before, then kicked when it opens.                                      |
| Kick timing         | A timer inside the server, every 5 seconds, over the online sessions only. It writes warnings and kicks to `warden_audit`, which the events stream sends within a second. A kick is at most about 6 seconds late.                                                                                           |
| Forward only        | A session's counted time is stored when it is counted and is never recounted. A rule change applies from the moment it is saved. Mistakes are fixed with an extra-time grant, never by recounting.                                                                                                          |
| Fairness            | A session closed for a missing heartbeat gives back the time after its last heartbeat, so a crash never costs the player.                                                                                                                                                                                   |
| Grants              | Add minutes to one player's allowance for one week, expire at the Monday reset, need a reason, are audited, and are capped at 5 hours each. Site admins, `warden-admin` and `events-manager` can give them. Only site admins and `warden-admin` change rules, schedules, closures and exemptions.           |
| Exemptions          | Set by site admins and `warden-admin`, with a reason and an optional end date. The player sees "Exempt" on the account and never the reason or who set it.                                                                                                                                                  |
| Rollout             | Modes `off`, `observe` and `enforce`, plus a feature flag as the kill switch. It starts in `observe`: everything is counted and shown, but nobody is denied or kicked, and the server gets no warnings or kicks. The user switches to `enforce` once the mod supports the events.                           |
| Where players look  | The Minecraft account page (`/minecraft/account`), which replaces `/minecraft/warden` (it redirects). Full history and appeals go to `/minecraft/account/history`. Players see the current week only.                                                                                                       |
| Where admins look   | `/admin/warden/playtime` with Rules, Closures and Live, and a Playtime panel on the Warden player page. Admins see the last 8 weeks of a player.                                                                                                                                                            |
| Retention           | Ledger rows are kept 26 weeks, pruned nightly, and deleted with the account. Grants and exemptions stay in the audit log.                                                                                                                                                                                   |
| Not in this feature | Push notifications (push is opt-in and about events only), a "request more time" button (players ask staff), per-player schedules, past weeks for players, a calendar feed for holidays (closures are entered by hand).                                                                                     |

## Starting values

Allowance 10 hours; Monday to Friday 9:00 to 17:00; grace 60 minutes; warnings 30, 10, 5 and 1 minutes; window-start warnings 5 and 1 minutes; mode `observe`; timezone Europe/Paris.

## What the code already gives us

- **Sessions** (`server/services/warden/sessions.ts`, table `warden_session`): `startedAt`, `lastHeartbeatAt`, `endedAt`, `endReason`. A session with no heartbeat for 3 minutes is closed by the `warden:close-stale-sessions` task, with `endedAt` set to its last heartbeat. `playtimeSeconds` on `minecraft_account` is all-time and only grows when a session closes, so the weekly figure cannot come from it.
- **The events stream** (`server/services/warden/events.ts`): reads `warden_audit` rows whose action is in `EVENT_ACTIONS` and maps each with `toEvent`. A new event is a new audit action, an `EVENT_ACTIONS` entry, a `toEvent` case, the `wardenEvent` schema in `shared/schemas/warden.ts` and a row in `docs/warden.md`. The kick `reason` is a Zod enum (`banned`, `unlinked`, `deviceRevoked`): add `playtimeLimit`. Login denial reasons are `WARDEN_DENY_REASONS`: add `playtimeLimitReached`.
- **Settings and per-player overrides**: one settings row (`warden_settings`) and nullable columns on `warden_player` (`maxAccounts`), read by `resolveMaxAccounts`. Mirror this for the playtime settings and overrides. The anticheat settings row (`anticheat_settings.mode`) is the pattern for the three modes.
- **Time zones**: no date library. `shared/utils/paris-time.ts` converts Paris wall-clock times to instants with `Intl`. Use it. Never use the server's local time, and note the existing warning that node-postgres writes raw `Date` parameters in local time, so pass ISO strings in new queries.
- **Roles**: `requireAdmin`, `requireWardenAdmin` and `requireEventsManager` in `server/utils/auth.ts`. Grants need a new guard that accepts the three.
- **Schools**: `user.tenantId` and the names in `shared/utils/schools.ts`. `LINK_APPS.warden.schools` in `shared/utils/link-apps.ts` is the Epitech-only restriction that slice 0 removes.
- **Jobs and flags**: jobs are `server/tasks/<area>/<name>.ts` timed in `nuxt.config.ts`; flags are declared in `shared/flags.ts`, with labels under `admin.flags.items` in both locales and a row in `docs/feature-flags.md`. The five-second timer is a Nitro plugin, like `server/plugins/migrate.ts`.

## Data model

All in `server/db/schema/playtime.ts`, one migration per slice (`pnpm db:generate --name <change>`). Timestamps are UTC. A week is identified by its Monday in Paris, as a `date`.

| Table                | Columns and rules                                                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playtime_settings`  | One row (id 1). `mode` (`off`, `observe`, `enforce`, check constraint), `allowance_seconds`, `schedule` (jsonb), `grace_seconds` (0 means off), `warnings_minutes` (jsonb array), `start_warnings_minutes` (jsonb array), `updated_at`, `updated_by_user_id`.                                                     |
| `playtime_school`    | Primary key `tenant_id`. The same fields as settings except `mode`, each nullable (null inherits). `updated_at`, `updated_by_user_id`.                                                                                                                                                                            |
| `warden_player`      | New nullable columns: `playtime_allowance_seconds`, `playtime_grace_seconds`, `playtime_warnings_minutes`.                                                                                                                                                                                                        |
| `playtime_closure`   | `id`, `label`, `starts_on` and `ends_on` (dates, inclusive, in Paris), `tenant_ids` (text array, null means everyone), `event_id` (nullable, cascades), `event_scope` (`registered` or `everyone`, null without an event), `created_by_user_id`, `created_at`. A closure with an event cannot be edited directly. |
| `playtime_exemption` | `id`, `user_id` or `minecraft_uuid` (exactly one, check constraint), `reason`, `until` (nullable), `set_by_user_id`, `created_at`, `revoked_at`. Active means not revoked and not past `until`.                                                                                                                   |
| `playtime_grant`     | `id`, `user_id`, `week_start`, `seconds` (1 to 18,000), `reason`, `granted_by_user_id`, `created_at`, `revoked_at`.                                                                                                                                                                                               |
| `playtime_ledger`    | Primary key (`session_id`, `week_start`). `counted_seconds`, `grace_seconds`, `free_seconds`, `counted_until` (the instant up to which the session was counted). A session that crosses Monday 00:00 gets two rows.                                                                                               |
| `playtime_notice`    | Unique (`session_id`, `kind`), where kind is `w30`, `w10`, `start5`, and so on. It keeps each warning to once per session.                                                                                                                                                                                        |

The schedule is `{ "mon": [["09:00", "17:00"]], "tue": [...], ... }`. A Zod schema checks it: ranges in minutes, `HH:MM`, the end after the start and up to `24:00`, sorted and not overlapping within a day. Every weekday key is present, with an empty array for a free day.

Audit: every rule, closure, exemption, grant and mode change writes a `warden_audit` row with who, when and from where, through `wardenAuditService.record` in the same transaction as the change. New audit actions are added to `WARDEN_AUDIT_ACTIONS` (check whether the column is plain text or needs a migration).

## The counting engine

`server/services/playtime/rules.ts`, pure, with the Paris helpers from `shared/utils/paris-time.ts`.

- `resolveConfig(global, school, player)` gives the effective allowance, schedule, grace, warnings and start warnings, field by field.
- `weekStart(instant)` gives the Monday 00:00 Paris of the week containing it.
- `splitInterval(from, to, schedule, closures)` splits a time span into counted and free seconds. Windows are Paris wall-clock times, so it must be right across the two clock changes and across Monday 00:00.
- `evaluate({ now, config, usedSeconds, grantedSeconds, exempt, closed })` returns the state: `unlimited` (exempt, closed, or the mode is off), `free` (outside the windows), `counting`, `grace` or `blocked` (allowance used inside a window and not in grace). It also returns `remainingSeconds`, `windowEndsAt`, `nextWindowStartsAt`, `graceEndsAt`, `resumesAt`, `resetsAt` and `nextChangeAt`, the next instant the answer may change.

The ledger is advanced by one function, `advance(session, now)`: it counts from `counted_until` to `now`, splits at window edges, stops counting into the allowance where it runs out, and sends what follows to grace or to "blocked" as the rules say. It runs for every online session on each tick, on login, and when a session closes. `settle(session, endedAt)` runs inside `closeSessions` for a session closed for a missing heartbeat: it takes back the time after `endedAt`. Counting never goes backwards otherwise.

## Enforcement

- **The tick** (`server/plugins/playtime.ts`, every 5 seconds, skipped when the `playtime` flag is off or the mode is `off`): load the open sessions (a few dozen), advance their ledgers, evaluate each, and write what is due: a `playtimeWarning` for each warning time crossed (once, through `playtime_notice`), a `playtimeGrace` when a player enters grace, a `playtimeUpdate` when the state changes for another reason (a grant, a closure, a window starting or ending), and a kick when the state is `blocked`. Only one instance runs, so there is no lock, but the tick must be safe to run twice (the notices are unique, and a kick is only written if the session is still open).
- **Login**: after the ban check, `blocked` gives `denied` with `playtimeLimitReached` and the dates. A player in grace is allowed. In `observe` nothing is denied, and the answer is the same as in `enforce` with `"enforced": false`.
- **Heartbeat**: the answer adds a `playtime` object for each session in the request, the same as at login.
- **Observe mode**: counting, the ledger, the player page and the admin all work. Nothing is denied or kicked, and the server gets no warnings or kicks. The admin Live tab shows what would have happened.
- **Kill switch**: the `playtime` flag and the mode `off` both stop the tick and the denial at once. Neither deletes data.

## Routes

Player, `server/api/playtime/`:

| Route                  | What it does                                                                                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/playtime/me` | The page's playtime view: `mode`, `state`, `playedSeconds` this week (all accounts, all time included), `totalPlayedSeconds`, `allowanceSeconds` with grants, `usedSeconds`, `percentUsed`, the dates above, the restricted hours as lines, and per account `{ uuid, username, exempt, playedSeconds }`. |

Minecraft server, extended in `server/api/warden/server/`: `login.post.ts` (the `playtime` object and the denial), `sessions/heartbeat.post.ts` (the `playtime` map), `events.get.ts` (the new events) and `players/[uuid].get.ts` (the state, for staff commands). All are behind `warden.serverApi` and the `playtime` flag.

Admin, `server/api/warden/admin/playtime/`, guarded by `requireWardenAdmin` except grants:

| Route                                                         | What it does                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET`, `PATCH /settings`                                      | Mode, allowance, schedule, grace, warnings.                      |
| `PUT`, `DELETE /schools/:tenantId`                            | A school's overrides.                                            |
| `GET`, `POST /closures`, `PATCH`, `DELETE /closures/:id`      | Closures. `POST /closures/skip-week` creates the current week's. |
| `GET /live`                                                   | Online players, their state and who is close to the limit.       |
| `GET /players/:userId`                                        | The player panel: state, overrides, exemptions, grants, 8 weeks. |
| `PUT /players/:userId/overrides`                              | Allowance, grace and warnings for one player.                    |
| `POST /players/:userId/exemptions`, `DELETE …/exemptions/:id` | Exemptions on the account or on one Minecraft account.           |
| `POST /players/:userId/grants`, `DELETE …/grants/:id`         | Grants. Guard: site admin, `warden-admin` or `events-manager`.   |

## Slices

Each slice is one or more atomic commits, and the plan's docs are updated in the slice that changes the behavior.

### Slice 0: open Warden to the three schools

Needs the user's go-ahead on its own: it changes who can join the server.

1. Remove the Epitech-only `schools` list from `LINK_APPS.warden` so it follows the sign-in allowlist, or list the three tenants.
2. Update `docs/warden.md` and `docs/economy.md` (both say "Epitech for now") and any text in the locale files that says Epitech only.
3. Check the `schoolNotAllowed` tests and the quests, anticheat and economy code for an assumption that every Warden player is at Epitech.

### Slice 1: data, engine and the player view (observe)

1. Add the flag `playtime` and its labels, then the schema and migration, then the shared Zod schemas.
2. Write `rules.ts` with its unit tests (see Tests), then the ledger, the settings, the closures, the exemptions and the grants as services.
3. Hook `advance` into login and `settle` into `closeSessions`. Add the tick, writing only the ledger in `observe`.
4. Add `GET /api/playtime/me`, its OpenAPI entry and its rate limit.
5. Start `docs/playtime.md` (the contract and the rules, like `docs/economy.md`) and add it to the list in `CLAUDE.md`.

### Slice 2: the Minecraft account page

1. Create `/minecraft/account` from the mock: the Playtime card with the state band, the allowance bar and the reset line; the larger Bank and Quests cards (reuse the economy and quests endpoints for the summaries, no new data); the linked accounts; the devices, warnings and sessions sections moved from the Warden page. Components live in `app/components/minecraft-account/` and use one composable, `usePlaytime`.
2. Move the full history and appeals to `/minecraft/account/history`. Redirect `/minecraft/warden` to `/minecraft/account`, and change the Minecraft menu entry, the header menu, the `redirectAfterLink` of the Warden app and any link in the docs and the locale files.
3. Add the semantic colors the mock uses (`grace`, teal) to `app/assets/css/main.css`, update `/styleguide`, and check both color modes and phone width in a real browser. Say in the commit which parts were not checked.
4. Every string in both locales, including the state lines, labels and the restricted hours text.

### Slice 3: enforcement

1. Add the login denial, the new events and kick reason, the heartbeat object and the staff command data, with the schema, `docs/warden.md` and OpenAPI changes.
2. Turn on the tick's warnings, grace and kicks for `enforce`, and keep `observe` silent toward the server.
3. Finish `docs/plans/playtime-limits-mod.md` against what was built, and tell the user it is ready to hand over.

### Slice 4: the admin

Frontend design starts with a mock offering several propositions, so ask the user for the Rules and Closures screens first (the schedule editor is the hard part). Then build `/admin/warden/playtime` (Rules, Closures, Live), the school overrides, the Playtime panel on the Warden player page (state, overrides, exemptions, grants, 8 weeks) and the matching admin entries. The mode picker is three selectable cards like the anticheat settings.

### Slice 5: event mode (built)

The events admin gets the switch and its scope. The event service keeps its closure in step when the event is created, moved, cancelled or deleted. Tournament registrations decide "registered players".

### Slice 6: maintenance

A nightly job `playtime:prune` (flag `jobs.playtimePrune`) removes ledger rows older than 26 weeks and notices of closed sessions. Check that account deletion removes the ledger, grants and exemptions. Add the economy-style retention sentence to `docs/playtime.md`.

## Tests

- **Unit** (`test/unit/`, `rules.ts`): the week boundary; a session across Monday 00:00; the two clock changes (Sunday 28 March 2027 and Sunday 31 October 2027) with a window inside the changed day; several ranges in a day; a session across a window edge; closures that start or end mid-week; grants; grace at 59, 60 and 61 minutes before the end; an allowance that runs out exactly at a window's end; a player joining in grace; no allowance at a window start; exemption of one account but not the other; inheritance of each field.
- **Database** (`test/db/`): `settle` gives back the time after the last heartbeat; the ledger is never recounted after a rule change; the tick writes a warning once and a kick once, and does nothing in `observe`; login denial in `enforce` only; account deletion removes the new rows; the grant guard accepts `events-manager`.
- **Nuxt** (`test/nuxt/`): the state band and the allowance bar in each state, with the right label and color token; the reset line; the page for an account with an exempt Minecraft account.
- `test/unit/openapi.test.ts` and `test/unit/flags.test.ts` pass with the new routes and flag.

## Risks

- **A wrong kick is the worst failure.** That is why it starts in `observe`, why a crash gives time back, why grants exist and why `off` stops everything at once. Watch the admin Live tab in `observe` for a week before `enforce`.
- **Clock changes.** The engine is tested on both, and every instant is converted through the Paris helper, never through the server's time zone.
- **Two timers.** The mod's local fallback timer and the site's tick could disagree by a few seconds. The site is the authority: an event always replaces the mod's timer.
- **Open sessions after a restart.** The tick rebuilds everything from the database at startup, so a restart loses nothing except up to 5 seconds of counting.
- **A school with a different schedule** is replaced as a whole, so an admin who edits the global schedule should be told that schools with their own are unchanged.
