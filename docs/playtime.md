# Playtime limits

A weekly limit on how long players can be on the Minecraft server during restricted hours (for example Monday to Friday, 9:00 to 17:00). The plan is `docs/plans/playtime-limits.md`, and the contract for the mod developers is `docs/plans/playtime-limits-mod.md`. This page says what is built.

**Status:** the data, the counting, the player view and the Minecraft account page are built, in `observe` mode: everything is counted and shown, and nobody is denied or kicked. Warnings, grace, kicks and the login denial (slice 3), the admin screens (slice 4), event mode (slice 5) and the nightly prune (slice 6) are still to do. Until the admin screens exist, rules are changed through `playtimeAdminService` (`server/services/playtime/admin.ts`) or the database.

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

## Player routes

| Route                  | What it does                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/playtime/me` | The week: mode, state, played this week and ever, allowance (with grants), used, remaining, percent, the instants above, the restricted hours as lines, and per account `{ uuid, username, exempt, playedSeconds }`. Behind the `playtime` flag. |

## The Minecraft account page

`/minecraft/account` (components in `app/components/minecraft-account/`, composable `usePlaytime`, wording helpers in `app/utils/playtime.ts`) replaced `/minecraft/warden`, which redirects to it. The Playtime card comes first: the state band, the hours played this week, then one allowance bar and the reset line. Colors: violet while counting, amber at 25% or less left, teal (`grace`) in the grace period, green in free time, red when paused, muted with no limit. In `observe` the card says nothing is enforced yet. It hides itself when the `playtime` flag is off or the player has no linked account. The card refetches every 30 seconds. The Bank and Quests cards reuse the bank's and quests' own endpoints, and ban history moved to `/minecraft/account/history`. Design notes are in `docs/design.md`.

## Data

`server/db/schema/playtime.ts`: `playtime_settings` (one row), `playtime_school`, `playtime_closure`, `playtime_exemption`, `playtime_grant`, `playtime_ledger` and `playtime_notice`, plus the player's overrides on `warden_player`. Every change by an admin is audited in `warden_audit` as `playtime.settings`, `playtime.school`, `playtime.closure`, `playtime.exemption` or `playtime.grant`.

Deleting an account deletes its ledger, grants and exemptions with it.
