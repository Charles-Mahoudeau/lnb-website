# Playtime limits

A weekly limit on how long players can be on the Minecraft server during restricted hours (for example Monday to Friday, 9:00 to 17:00). The plan is `docs/plans/playtime-limits.md`, and the contract for the mod developers is `docs/plans/playtime-limits-mod.md`. This page says what is built.

**Status:** the data, the counting, the player view, the Minecraft account page and the enforcement (login denial, warnings, grace, kicks) are built. The mode starts in `observe`: everything is counted and shown, and nobody is denied, kicked or warned. The mod doesn't support the events yet, so switch to `enforce` only after it does. The admin is built: the Rules, Closures and Live tabs (`/admin/warden/playtime`) and the Playtime panel of a player's Warden page. Event mode and the nightly prune are built, so the feature is complete apart from the real-browser checks. None of the admin screens has been checked in a real browser.

## The rules

- **Everyone with a linked Minecraft account is limited**, unless exempt. An exemption sits on an LNB account or on one Minecraft account (by UUID), with a reason and an optional end date. The player is never shown the reason.
- **One allowance per LNB account**, 10 hours by default, pooled over its linked Minecraft accounts that are not exempt. An exempt account uses none of it.
- **A week** runs Monday 00:00 to the next Monday 00:00 in Europe/Paris, so it is 167 or 169 hours around a clock change. It is identified by its Monday, as a date.
- **Only time inside the restricted hours counts.** Time outside them is free and never capped. The hours are, for each weekday, zero or more ranges in Paris wall-clock time (`HH:MM`, up to `24:00`, sorted, not overlapping). Ranges that touch (one ends at `24:00`, the next starts at `00:00`) are one window.
- **Closures** (a label, Paris dates, both inclusive, for everyone or chosen schools) remove the windows of their days. "Skip this week" is a closure for the current Monday to Sunday.
- **Grace.** When the allowance runs out in the last hour of a window (60 minutes by default, `0` switches it off), the player isn't blocked: they play on until the window ends, and that time isn't counted. Someone with no allowance who joins in that last hour is allowed. Outside it, they are blocked inside a window.
- **Grants** add up to 5 hours to one player's allowance for one week (a reason is required, and each is audited). They end with the week.
- **Overrides**: each setting is inherited on its own, player, then school (`user.tenantId`), then global. A player overrides the allowance, the grace length and the warning times only. The schedule is overridden by a school, as a whole.
- **Forward only.** Time is stored when it is counted and never recounted. A rule change applies from the moment it is saved, and a mistake is fixed with a grant.
- **Fairness.** A session closed for a missing heartbeat gives back the time after its last heartbeat, so a crash never costs the player.

## Modes and the kill switch

The mode is `off`, `observe` or `enforce`, in `playtime_settings`. It starts in `observe`. The `playtime` feature flag is the kill switch and wins over the mode. With either off, nothing is denied or kicked, and the tick only records time as free (so switching back on doesn't count the gap). Nothing is deleted.

## How time is counted

`server/services/playtime/rules.ts` holds the pure rules (settings inheritance, weeks, windows, `advanceLedger`, `evaluate`, `takeBack`), tested in `test/unit/playtime-rules.test.ts`. It imports nothing from Nuxt or the database.

- **The ledger** (`playtime_ledger`, one row per session and week) holds what a session played in a week: `counted_seconds` (against the allowance), `grace_seconds`, `over_seconds` (played with no allowance left and no grace, which only happens in `observe` or before a kick lands) and `free_seconds`, with `counted_until`. A session across Monday 00:00 has two rows. `user_id` and `minecraft_uuid` are copied onto the row, so a week's total needs no join.
- **The tick** (`server/plugins/playtime.ts`, every 5 seconds) advances the ledger of every online session in whole seconds from where it stopped. It skips sessions with no heartbeat for 3 minutes, which `warden:close-stale-sessions` closes. Work is locked per player (`pg_advisory_xact_lock`), so two sessions of one player never read the same total.
- **Login** brings the player's online sessions up to date. **Closing a session** settles its ledger at the instant it ended: a normal end counts up to then, and a stale one takes back what was counted after its last heartbeat (grace first, then over, then counted). Both run in a savepoint and log instead of failing, so a bug here can't stop a player joining or a session closing.
- **Evaluating** gives the state: `unlimited` (exempt, closed, or mode off), `free`, `counting`, `grace` or `blocked`, with `remainingSeconds`, `windowEndsAt`, `nextWindowStartsAt`, `graceEndsAt`, `resumesAt`, `resetsAt` and `nextChangeAt`. `observe` evaluates like `enforce`.

## Enforcement

Only in `enforce`. In `observe` and `off` the server is told nothing and nobody is denied: it counts and shows, and that is all. The contract the mod follows is in `docs/warden.md` and `docs/plans/playtime-limits-mod.md`.

- **The timer** (`server/plugins/playtime.ts`, every 5 seconds) counts each online player's time, then in `enforce` (`server/services/playtime/enforcement.ts`) writes what is due as audit rows, which the events stream sends within a second: `playtime.warning`, `playtime.grace`, `playtime.update` and `playtime.kick`. They are hidden from the admin audit log, like the anticheat's stream events.
- **Warnings** are sent at each "minutes left" mark of the allowance (30, 10, 5, 1), but only when the allowance really runs out before the window ends. A player online with nothing left gets the start warnings (5 and 1 minutes) before a window opens, then the kick when it does. Each notice is kept to once per session and week in `playtime_notice` (kinds like `2026-11-16:w10`), so the timer is safe to run twice. A player who joins with 3 minutes left gets one warning that says so, covering the marks already crossed.
- **Grace**: when the allowance runs out in the last grace period of a window, `playtimeGrace` is sent once and nobody is kicked. A player who joins in grace is allowed with `grace: true` and is told again right after.
- **Updates**: the timer remembers (in memory) the state it last saw for each session and sends `playtimeUpdate` when it changes: a window starts or ends, extra time is granted, an exemption or closure appears. The first look at a session, and the first look after a restart, is silent. The heartbeat answer carries the same state for every open session, so a missed event is repaired within a minute.
- **Kick**: once per session and week, when the state is `blocked`. The session stays open until the server reports it ended, but the kick isn't repeated, so the mod's own fallback timer and the heartbeat answer cover a missed kick. The kick is at most about 6 seconds late.
- **Login**: after the ban check, a player whose allowance is used up inside a window and not in grace is denied with `playtimeLimitReached` and the dates, in `enforce` only. The check counts their open sessions first, so the total is current. Anything that goes wrong in here lets the player in.
- **Heartbeat and staff lookup**: both carry the same `playtime` object as the login answer (the lookup adds `state` and `usedSeconds`).

## The admin screens

`/admin/warden/playtime`, for site admins and `warden-admin` (the tab is in the URL hash).

- **Rules:** the three mode cards (a card saves at once, and `enforce` asks first), the defaults (allowance in hours, grace in minutes, warning times), the restricted hours and the schools. The schedule editor draws one 24-hour line per weekday: drag on an empty line to draw a range, drag a range to move it, drag its edges to resize (15 minute steps). Selecting a range edits its exact times; arrow keys, Shift and Delete work on a focused range. A school's modal has one switch per setting: off follows the default, on gives the school its own value, and an own schedule replaces the default one as a whole.
- **Closures:** the list with "Skip this week" first, then a three-month calendar where dragging across days fills the dates of the form. Closures made for an event show the event and can't be edited or deleted here.
- **Live:** the players online now, one row per Minecraft account, with a state pill (counting violet, grace teal, free green, out of time red, exempt neutral), time used against the allowance and time left. Four tiles filter the table, and a card sums the week (hours counted, players, who reached the limit, who used grace). It refreshes every 15 seconds. In `observe` a callout says nothing reaches the server.
- **Player panel** (card "Playtime" on `/admin/warden/players/{userId}`): the state, the allowance bar, key figures, the last 8 weeks against the allowance (closure weeks say "closed"), the player's overrides (allowance, grace, warnings; empty follows the school, then the defaults), extra time for this week (presets, a required reason, up to 5 h each, gone at the Monday reset) and exemptions (the whole LNB account or one of their Minecraft accounts, a required reason, an optional end date). Revoking asks first. Exemption reasons are never shown to the player.

**Reset the counters** (Danger zone at the bottom of the Rules tab, site admins only): typing `reset the playtime` deletes the time counted so far and the warnings (`POST /api/playtime/admin/reset`, audited as `playtime.reset` with the row counts). The rules, schools, closures, exemptions and grants stay. A session still open keeps its ledger row with the counters at zero, because the row says where counting stopped: without it the next tick would count the whole session again.

Routes, all `wardenAdmin` (see `/api/docs`, tag "Playtime: admins"): `GET`/`PATCH /api/playtime/admin/settings`, `PUT`/`DELETE /api/playtime/admin/schools/{tenantId}`, `GET`/`POST /api/playtime/admin/closures`, `POST /api/playtime/admin/closures/skip-week`, `PATCH`/`DELETE /api/playtime/admin/closures/{id}`, `GET /api/playtime/admin/live`, `GET /api/playtime/admin/players/{userId}`, `PUT .../overrides`, `POST .../exemptions` and `DELETE .../exemptions/{id}`. Grants (`POST .../grants`, `DELETE .../grants/{id}`) also accept `events-manager`, through `requirePlaytimeGranter`. Exemption and grant writes check that the Minecraft account belongs to the player in the URL. Every write answers with the data the screen shows.

## Player routes

| Route                  | What it does                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/playtime/me` | The week: mode, state, played this week and ever, allowance (with grants), used, remaining, percent, the instants above, the restricted hours as lines, and per account `{ uuid, username, exempt, playedSeconds }`. Behind the `playtime` flag. |

## The Minecraft account page

`/minecraft/account` (components in `app/components/minecraft-account/`, composable `usePlaytime`, wording helpers in `app/utils/playtime.ts`) replaced `/minecraft/warden`, which redirects to it. The Playtime card comes first: the state band, the hours played this week, then one allowance bar and the reset line. Colors: violet while counting, amber at 25% or less left, teal (`grace`) in the grace period, green in free time, red when paused, muted with no limit. In `observe` the card says nothing is enforced yet. It hides itself when the `playtime` flag is off or the player has no linked account. The card refetches every 30 seconds. The Bank and Quests cards reuse the bank's and quests' own endpoints, and ban history moved to `/minecraft/account/history`. Design notes are in `docs/design.md`.

## Data

`server/db/schema/playtime.ts`: `playtime_settings` (one row), `playtime_school`, `playtime_closure`, `playtime_exemption`, `playtime_grant`, `playtime_ledger` and `playtime_notice`, plus the player's overrides on `warden_player`. Every change by an admin is audited in `warden_audit` as `playtime.settings`, `playtime.school`, `playtime.closure`, `playtime.exemption` or `playtime.grant`.

Deleting an account deletes its ledger, grants and exemptions with it.

## Event mode

An event can lift the limit for its days. The event form (Publishing section, events managers) has a "Lift the playtime limit" switch and a choice: **registered players** (people registered to the event, not on its waitlist) or **everyone**. It shows only while the `playtime` flag is on.

- It is a closure with `event_id` and `event_scope` (`server/services/playtime/events.ts`), created, renamed, moved and removed by `eventAdminService` in the same transaction as the event: on create, update, duplicate (the copy keeps the setting on its new dates), cancel (removed) and delete (the foreign key cascades). There is no second copy of the setting: the form reads the closure.
- A closure is whole Paris days, from the start day to the end day, both inclusive, for every school. An event running past midnight therefore closes the next day too, unless it ends exactly at 00:00. Nothing counts on those days and the player sees "No limit this week" like any closure.
- It applies only while the event is published and not cancelled. A draft keeps its closure, so the setting survives, but it does nothing until the event is published.
- "Registered" is decided when the player is read (`closureAppliesTo` in `closure-scope.ts`), from `event_registration.status = 'registered'`: registering, leaving, or moving up from the waitlist takes effect on the next five-second tick, with no sync. In team events people never wait (only teams do), so every player registered to the event counts, whatever the state of their team.
- Event closures can't be edited or deleted from the Closures tab (409), only from the event.
- Events managers can set it although they can't create closures: it is tied to an event they run, and the event's audit row (`event.create`, `event.update`) records the `playtimeFree` value.

## Retention

- The nightly `playtime:prune` (03:00, flag `jobs.playtimePrune`, `server/services/playtime/prune.ts`) deletes ledger rows of weeks more than 26 weeks before the current Monday, and the warnings (`playtime_notice`) of sessions that ended more than a day ago. It reports `{ ledger, notices }`.
- Grants and exemptions are not pruned: they are small, and they are the record of who gave time or took an account out of the limit. They go with the account, like the ledger and the warnings: deleting a user (including by `users:delete-inactive`) cascades to all of them, which `test/server/playtime-prune.test.ts` checks.
- Players never see past weeks, and admins see eight, so 26 weeks is for support questions only.
