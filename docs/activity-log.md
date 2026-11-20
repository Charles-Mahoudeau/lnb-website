# Activity log

Status: planned, built in slice 4 of `docs/plans/admin-redesign.md`. Until then, `warden_audit` and `admin_audit` are the two logs.

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

- Every admin route that writes data records one action, in the same transaction as the change. A test lists the admin routes with a write method and fails when one records nothing.
- Every nightly job that changes data records one action with `source: 'system'` and no actor, with counts in `data`.
- Reads record nothing.
- Every action has one sentence in English and French, `admin.activity.actions.<action>` in `i18n/locales/`. A test fails when one is missing. There is no generic fallback.
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
