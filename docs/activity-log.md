# Activity log

Status: built (slice 4 of `docs/plans/admin-redesign.md`). Migration `0057_activity_log` copied `warden_audit` and `admin_audit` into `audit`, by date and with fresh IDs, and dropped them.

One table, `audit`, records every change made from the admin, by the Minecraft server, by players on things admins watch (linking an account, appealing a ban), and by nightly jobs that change data. Admins read it in Settings › Activity.

## Table

| Column                                         |                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                           | `bigserial`. Also numbers the events sent to the Minecraft server, which replays the ones it missed (`GET /api/warden/server/events`). |
| `at`                                           | When.                                                                                                                                  |
| `action`                                       | `<area>.<what>`, below.                                                                                                                |
| `source`                                       | `site`, `server` (the Minecraft server) or `system` (a job). `site` by default.                                                        |
| `actor_user_id`                                | Who did it. Null for a job or the Minecraft server.                                                                                    |
| `actor_minecraft_uuid`, `actor_minecraft_name` | The in-game actor, for actions from the Minecraft server.                                                                              |
| `target_user_id`                               | Who it happened to.                                                                                                                    |
| `target_minecraft_uuid`                        | The Minecraft account it happened to.                                                                                                  |
| `data`                                         | `jsonb`, what the sentence needs.                                                                                                      |

Indexes on `(target_user_id, id)`, `(action, id)` and `(at)`.

When an account is deleted, its rows stay and the user IDs and Minecraft UUID pointing at it are emptied: the log keeps what happened, not who it happened to. A nightly job, `audit:prune`, deletes rows older than 24 months. Bans, notes and warnings live in their own tables, so pruning the log never shortens a person's record.

## Rules

- Every admin route that writes data records one action, in the same transaction as the change. `test/unit/audit-coverage.test.ts` lists the admin write routes (`server/api/admin/**` and `server/api/*/admin/**`, with a post, put, patch or delete method) against a map of the actions each one records, and fails on a route missing from the map, an action that is not in the code the route reaches, an action nobody writes, and a scheduled task missing from its own map. A route that records nothing on purpose says why in the map (the impact counts, the partner logo pre-upload).
- Every nightly job that changes data records one action with `source: 'system'` and no actor, with counts in `data`.
- Reads record nothing.
- Every action has one sentence in English and French, `admin.activity.actions.<action>` in `i18n/locales/`. The key is the action in camelCase (`minecraft.ban.update` is `minecraftBanUpdate`), which keeps vue-i18n from reading a sentence as a group. `test/unit/activity-i18n.test.ts` fails when one is missing or left over, or when the two languages use different slots. There is no generic fallback.
- A new action is added to `AuditAction` in `server/db/schema/audit.ts`, to this page and to both locales.

## Areas and who sees them

| Area        | Covers                                                                                                             | Seen by                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `minecraft` | Minecraft accounts and devices, moderation, server rules, playtime, anticheat, Modlist, mod vote, files, downloads | site admins, Warden admins                        |
| `people`    | site accounts, roles, site bans, ghost accounts                                                                    | site admins; events managers see `people.ghost.*` |
| `events`    | events, registrations, teams, rooms, types, posters, notifications, partner events                                 | site admins, events managers                      |
| `links`     | short links                                                                                                        | site admins, events managers                      |
| `site`      | team page, partners, Gamesplanet                                                                                   | site admins                                       |
| `settings`  | flags, rate limit, API keys, map                                                                                   | site admins                                       |
| `economy`   | LNBits accounts, ledger, shops, quests                                                                             | site admins, economy admins                       |

## Actions

Renamed from the two old tables by the migration. New actions follow the same pattern.

### From `warden_audit`

Every Warden action keeps its name with `minecraft.` in front: `ban` becomes `minecraft.ban`, `note.create` becomes `minecraft.note.create`, `anticheat.verdict` becomes `minecraft.anticheat.verdict`, `playtime.kick` becomes `minecraft.playtime.kick`. The only exception is `warden.resetSanctions`, which becomes `minecraft.resetSanctions`.

That covers: `link`, `link.request`, `link.cancel`, `unlink`, `link.transfer`, `transfer.dismiss`, `token.rotate`, `device.link`, `device.deny`, `device.revoke`, `ban`, `unban`, `ban.expire`, `appeal.create`, `appeal.decide`, `note.create`, `warning.create`, `limit.set`, `role.set`, `settings.update`, `identity.update`, `uuid.collision`, `mod.*`, `modSettings.update`, `file.*`, `modpack.*`, `anticheat.*`, `playtime.*`.

New: `minecraft.ban.update` (a ban's end changed).

### From `admin_audit`

| Old                                                                   | New                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `user.roles`, `user.ban`, `user.unban`, `user.signOut`, `user.delete` | `people.roles`, `people.ban`, `people.unban`, `people.signOut`, `people.delete` |
| `user.ghostCreate`, `user.ghostUpdate`, `user.ghostClaim`             | `people.ghost.create`, `people.ghost.update`, `people.ghost.claim`              |
| `users.deleteInactive`                                                | `people.deleteInactive`                                                         |
| `event.<what>`                                                        | `events.event.<what>`                                                           |
| `eventTeam.<what>`                                                    | `events.team.<what>`                                                            |
| `eventRoom.<what>`, `eventType.<what>`                                | `events.room.<what>`, `events.type.<what>`                                      |
| `poster.<what>`                                                       | `events.poster.<what>`                                                          |
| `push.settings`                                                       | `events.push.settings`                                                          |
| `partnerEvent.<what>`                                                 | `events.partnerEvent.<what>`                                                    |
| `shortLink.<what>`                                                    | `links.<what>`                                                                  |
| `teamPole.<what>`, `teamMember.<what>`, `team.settings`               | `site.teamPole.<what>`, `site.teamMember.<what>`, `site.team.settings`          |
| `partner.<what>`, `partners.settings`                                 | `site.partner.<what>`, `site.partners.settings`                                 |
| `gamesplanet.<what>`                                                  | `site.gamesplanet.<what>`                                                       |
| `flag.update`                                                         | `settings.flag`                                                                 |
| `rateLimit.mode`                                                      | `settings.rateLimit`                                                            |
| `map.settings`                                                        | `settings.map`                                                                  |
| `apiKey.<what>`                                                       | `settings.apiKey.<what>`                                                        |
| `downloads.update`                                                    | `minecraft.downloads.update`                                                    |
| `rule.<what>`                                                         | `minecraft.rule.<what>`                                                         |
| `economy.<what>`                                                      | `economy.<what>` (unchanged)                                                    |
| `quests.<what>`                                                       | `economy.quests.<what>`                                                         |

The Minecraft server never sees action names: `server/services/warden/events.ts` turns rows into its own event types, and only its `EVENT_ACTIONS` list changes with the rename.

## What was added

Changelog actions (`docs/changelog.md`), in `minecraft`, so Warden admins read them: `minecraft.changelog.create`, `.update`, `.translate`, `.schedule`, `.publish` and `.unpublish`. A scheduled post published by the job is a `.publish` by `system`.

Actions the migration did not have, because the routes recorded nothing before: `people.pruneAvatars`, `events.event.bdeRetry`, `events.image.add`, `events.pruneImages`, `events.push.prune`, `site.teamPole.move`, `site.teamMember.move`, `site.partner.move`, `site.prunePartnerLogos`, `site.gamesplanet.pinMove`, `site.gamesplanet.prune`, `minecraft.rule.move`, `minecraft.rule.categoryMove`, `minecraft.anticheat.alertDismiss`, `minecraft.anticheat.note`, `minecraft.anticheat.rescore`, `minecraft.anticheat.prune`, `minecraft.modpack.check`, `minecraft.events.prune`, `minecraft.playtime.prune`, `settings.apiKey.prune`, `settings.activityPrune`, `economy.sweep` and `economy.quests.index`.

Some old actions are no longer written but stay in `AuditAction` for the old rows and have a sentence: `minecraft.link.request`, `minecraft.link.cancel`, `minecraft.token.rotate`, `minecraft.ban.expire` and `minecraft.uuid.collision`.

`minecraft.anticheat.resetFiles` had no sentence before. It has one now.

## Jobs

`auditService.recordJob(action, data)` records one `system` action from a nightly task, and only when a count in `data` is above zero, so a quiet night leaves nothing. The jobs that run often (`events:bde-sync`, `push:deliver`, `warden:close-stale-sessions`, `anticheat:lookups`, `gamesplanet:sync-deals`, `quests:community`) record nothing: they would bury the log. `audit:prune` runs at 03:00 with the other prunes, behind the `jobs.pruneAudit` flag, and records `settings.activityPrune` with the number removed.

## Writing

`auditService.record(tx, { action, actor, targetUserId?, targetMinecraftUuid?, data? })` runs in the caller's transaction and returns the ID. The actor is `{ source: 'web', userId }` (a site admin or events manager; `userId` is null for an API key, which puts the key in `data.apiKey`), `{ source: 'minecraft', userId, minecraft }` or `{ source: 'system' }`. The old Warden sources map `web` to `site`, `minecraft` to `server`. `server/lib/ghosts.ts` is loaded by the Better Auth CLI without the `~~` alias, so it inserts its `people.ghost.claim` row directly.

## Reading it

`GET /api/admin/activity` (the four admin roles; `/api/admin/activity.csv` for site admins, at most 50,000 rows, with cells that start like a formula made into text). Filters: `q` (the actor's or target's name, or the in-game name), `areas` (comma-separated, cut to the areas the role can read), `from` and `to` (30 days back by default), `user` (about them or by them) and `cursor`, 50 at a time, newest first. A role only gets its own areas: site admins all, Warden admins `minecraft.*`, events managers `events.*`, `links.*` and `people.ghost.*`, economy admins `economy.*`, and a person with several roles the union. Entries that only feed the Minecraft server's stream (`minecraft.anticheat.verdict`, `minecraft.anticheat.alert`, `minecraft.playtime.warning`, `.grace`, `.update` and `.kick`) are left out of the log, as the old Warden log did.

The page, Settings › Activity, follows `docs/design.md`: rows with the sentence, names in semibold linking to `/admin/people/:id/summary`, the time muted on the right, the area as a pill, search, area chips, a date range and "Load more". The Person page's "See this person's activity" opens it with `?user=<id>`, where the range starts at the beginning, with a "Show everyone" banner. Home's "See all activity" link shows for every role.

The Minecraft server's event stream (`GET /api/warden/server/events`) numbers its events by `audit.id`. A `Last-Event-ID` above the newest ID (from before the IDs restarted in this migration) starts from the newest, so no old event is replayed.
