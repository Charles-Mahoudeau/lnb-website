# Anticheat

The anticheat checks the files in a player's Minecraft client (mods, resource packs, shaders) and keeps a trust score per player. The Minecraft server reports the files by SHA-512 hash. The site scores each file from Modrinth and CurseForge data and from admin decisions, keeps the trust score, and answers with a verdict (allow, flag, warn, hold, refuse, kick or ban) that the server applies. This page is the contract between the site and the server, and the rules behind it.

Only the Minecraft server calls the anticheat API. The LNB Warden mod never does, and players see nothing about the anticheat on the site. The Minecraft mod and server plugin are not in this repository: it only defines what they follow.

## How it fits together

1. A player joins and the server logs them in (`POST /api/warden/server/login`, see `docs/warden.md`). The answer holds a `sessionId`.
2. The server lists the files of the client and sends them in a report. Every report and event is keyed by that `sessionId`: the site derives the account from the session and ignores any identity in the payload.
3. The site stores the files, scores the ones it knows, starts a Modrinth and CurseForge lookup for the others, and answers with a verdict. A file still waiting for its lookup is `pending` and counts as allowed until it times out (60 seconds by default).
4. When a lookup finishes, or an admin decides on a file, the verdicts of the open sessions that hold it are worked out again. A change is sent to the server as an `anticheatVerdict` event on `GET /api/warden/server/events`.
5. The server applies the verdict, and reports what it did (`actions`). It also reports what it saw: wrong challenge answers, a changed mod set, a channel mismatch (`events`).

The site owns the points, the thresholds and the table of actions. The server applies them. A ban by the server goes through the existing `POST /api/warden/server/players/:uuid/bans`: the site never decides a ban by itself.

## Mode

Settings has three modes, changed from `/admin/anticheat/settings`:

| Mode      | What happens                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `off`     | Nothing is stored. Every report is answered with `allow` and no files.                                                                                                                            |
| `observe` | The default. Everything is scored and logged. The verdict's `action` is always `allow`, with `wouldBe` holding the real one. Player trust events are recorded but not applied (`applied: false`). |
| `enforce` | The verdict is the real one, and trust events move the score.                                                                                                                                     |

Admin actions (adjusting a score, holding or clearing a hold, a bulk penalty) apply in every mode.

## Scoring a file

Every file has a score from 0 to 100 and a band:

| Band       | Score    |
| ---------- | -------- |
| `approved` | 100      |
| `accepted` | 75 to 99 |
| `middle`   | 40 to 74 |
| `low`      | 1 to 39  |
| `banned`   | 0        |

A file is scored in this order, and the first rule that matches wins:

1. Kind `client` (the mod, game jar and loader): never scored, never looked up. Shown and logged.
2. **Banned**: the file or its project has the decision `banned`, or the file declares a banned mod ID. Score 0. A ban always wins over an approval.
3. **Approved**: the file or its project has the decision `approved`, or a visible entry of the official mod list matches it (by Modrinth or CurseForge project, or by file hash). Score 100.
4. **Pending**: the lookup has not finished. No score yet.
5. Otherwise the score is computed from the criteria below.

### Criteria

Each criterion is `earned`, `notEarned` or `unavailable`. The points are the defaults of rules version 1:

| Criterion            | Kinds        | Points | Earned when                                                                                                 |
| -------------------- | ------------ | ------ | ----------------------------------------------------------------------------------------------------------- |
| `moderationApproved` | all          | 20     | Modrinth's `status` for the project is `approved`. Unavailable when the file is on CurseForge only.         |
| `downloadsHigh`      | all          | 20     | The highest download count across platforms is at least 10,000 (`downloadsHighMin`).                        |
| `downloadsMid`       | all          | 10     | Otherwise, at least 1,000 (`downloadsMidMin`). One criterion: at most `downloadsHigh` points.               |
| `projectAge`         | all          | 15     | The earliest project creation date is more than 182 days ago.                                               |
| `versionAge`         | all          | 15     | This file's publication date is more than 14 days ago.                                                      |
| `bothPlatforms`      | all          | 10     | The hash was found on both platforms. Unavailable when no CurseForge API key is set.                        |
| `identityMatch`      | mod          | 10     | The declared loader is among the version's loaders and the declared version equals or is within its number. |
| `serverSide`         | mod          | 10     | Modrinth's `server_side` is `required`. Unavailable with no Modrinth record or `unknown`.                   |
| `texturesClean`      | resourcepack | 60     | The reported facts say no texture was altered, and the reports agree.                                       |
| `noCoreShaders`      | resourcepack | 40     | The reported facts say no core shaders, and the reports agree.                                              |

Penalties are never scaled: `unknown` (-50, found on neither platform), `suspectedModified` (-40, found on neither platform but declaring a mod ID that a platform project uses), `texturesAltered` (-100) and `coreShaders` (-40).

```
fullMax      = the positive criteria that apply to this kind
availableMax = fullMax - the criteria that are unavailable
earned       = the earned points
scaled       = availableMax > 0 ? round(earned * fullMax / availableMax) : 0
score        = clamp(scaled + penalties, 1, 99)
```

For a file found on neither platform, every platform criterion is `notEarned`, never `unavailable`. When two reports disagreed about a resource pack's facts (`factsDisputed`), neither the points nor the penalties from the facts apply, and an alert is raised. The admin shows the stored breakdown of each file, never a recomputation.

### Effective score and action

The **effective score** is the file score moved by the player's trust: `clamp(round(file + (player - 50) * 0.2), 1, 99)`, for scores from 1 to 99 only. A mod found on neither platform keeps its own score when the adjustment would raise it. Scores 0 and 100 never change.

The action of a file comes from the policy table, by kind and band of the effective score:

| Kind           | approved | accepted | middle  | low      | banned |
| -------------- | -------- | -------- | ------- | -------- | ------ |
| `mod`          | `allow`  | `flag`   | `hold`  | `refuse` | `ban`  |
| `resourcepack` | `allow`  | `flag`   | `warn`  | `refuse` | `kick` |
| `shader`       | `allow`  | `allow`  | `allow` | `allow`  | `kick` |

Actions run from the least to the most severe: `allow`, `flag`, `warn`, `hold`, `refuse`, `kick`, `ban`. The **verdict** is the most severe action over the session's files and the player, with its reasons (`fileBanned`, `fileRefused`, `fileHeld`, `packWarning`, `fileFlagged`, `playerHeld`, `playerZero`, `manualHold`).

### Status (admin label)

Derived, never stored: `pending` while the lookup runs; `banned` at 0; `approved` at 100; `refused` in band `low` (mods and resource packs); `review` in band `middle`, or in band `accepted` when nobody has reviewed it at this band; `accepted` otherwise. "Reviewed, keep the score" lasts while the file stays in the same band.

## The trust score

Each LNB account (not each Minecraft account) has a trust score from 0 to 100, starting at 50.

| Band      | Score     | Action |
| --------- | --------- | ------ |
| `trusted` | 70 to 100 |        |
| `normal`  | 30 to 69  |        |
| `held`    | 1 to 29   | `hold` |
| `zero`    | 0         | `kick` |

Events reported by the server change it: `challengeWrong` -25, `challengeMissed` -5 (at most -15 per session), `modSetChanged` -30, `channelMismatch` -30. A report that finds the official modlist incomplete adds `modlistIncomplete` -40, once per session. A session with no penalty earns +1 per hour played, at most +5 per UTC day. Admins can set a score, hold the next join, clear a hold (a held player's score then goes up to 30), and apply a bulk penalty to the players of a file. All of these go to the player's timeline.

Only the manual "hold the next join" is stored on the player. Holds from low scores are worked out from the scores on each report.

## Lookups

A new hash starts `pending` and a lookup runs in the site's process right after the report. State lives in the database, and a task each minute (`anticheat:lookups`) retries and expires. There is no queue and no Redis.

- Modrinth: files by SHA-512 (`POST /v2/version_files`), then the projects.
- CurseForge: files by fingerprint, then the mods. Only when `CURSEFORGE_API_KEY` is set (see `docs/mods.md`). Without it, `bothPlatforms` is unavailable.
- Found on both platforms under two different projects: the projects are merged, and a ban wins over an approval. Admins can link and unlink projects by hand.
- Found on neither: `notFound`, tried again after 6 hours while the file is still being seen. Files with no answer after 60 seconds are scored as unknown (`timedOut`) and stay claimable.
- A platform that is down leaves the file pending, so the next sweep tries again.

The flag `anticheat.lookups` off makes the lookup return at once: files stay pending, then time out.

## Nightly jobs

Both run at 03:00, server time, behind a flag, and report `skipped` when the flag is off.

- **`anticheat:rescore`** (`jobs.anticheatRescore`): scores again the files whose re-score time has come (7 days after their last score, or now for every file after a rules change or "Score everything again"), in batches of 200, for up to 5 minutes. Before scoring a batch it fetches again the platform data of projects older than the re-score time, so downloads and moderation status don't stay as they were at the first lookup. A platform that can't be reached leaves the stored data. Verdicts are worked out again for the files that changed. A file still waiting for its lookup has no score and is left to the lookup. What is left at the end of the 5 minutes waits for the next night.
- **`anticheat:prune`** (`jobs.anticheatPrune`): deletes reports older than 12 months; usage links not seen for 12 months, except links to a banned file or a file of a banned project; dismissed alerts older than 90 days; and files with no usage, no decision and nothing seen for 12 months.

Deleting an account (by hand, or by `users:delete-inactive`) deletes its reports, usage links, trust score, timeline and actions with it.

## Contract with the Minecraft server

Every route needs `Authorization: Bearer <WARDEN_SERVER_SECRET>` and the flag `anticheat.serverApi`. A request for an unknown or ended session is a 404 with `data.problem` `unknownSession`.

### `POST /api/warden/server/anticheat/reports`

Sent right after an allowed login, and again in the same session whenever the client's file set changes.

```json
{
  "sessionId": "5f0c6a4e-8d0b-4f0e-9a52-2f4f7a1a9c11",
  "files": [
    {
      "kind": "mod",
      "sha512": "128 hex characters",
      "fingerprint": 3921004187,
      "filename": "sodium-neoforge-0.6.0.jar",
      "modId": "sodium",
      "name": "Sodium",
      "version": "0.6.0",
      "loader": "neoforge",
      "facts": { "coreShaders": false, "alteredTextures": false }
    }
  ]
}
```

`kind` is `mod`, `resourcepack`, `shader` or `client`. `sha512` is lowercased. `fingerprint` is an optional unsigned 32-bit integer (the CurseForge fingerprint). `filename` is 1 to 255 characters; `modId`, `name`, `version` and `loader` are optional strings up to 128 characters. `facts` is read only for resource packs. A report holds 1 to 1,000 files, unique by hash (more, or a duplicate, is a 400).

```json
{
  "reportId": "0d4c2b1e-3a77-4f5b-8c1a-6b1f0b1c2d3e",
  "mode": "observe",
  "verdict": {
    "action": "allow",
    "wouldBe": "hold",
    "reasons": [{ "code": "fileHeld", "sha512": "…", "name": "Freecam", "action": "hold" }]
  },
  "player": { "score": 50, "band": "normal" },
  "files": [
    {
      "sha512": "…",
      "kind": "mod",
      "name": "Freecam",
      "state": "scored",
      "score": 60,
      "effectiveScore": 60,
      "band": "middle",
      "status": "review",
      "action": "hold"
    }
  ],
  "pending": 2,
  "pendingTimeoutSeconds": 60
}
```

`state` is `scored`, `pending` or `ignored` (kind `client`). With the mode `off`, nothing is stored and the answer is `{ "reportId": null, "mode": "off", "verdict": { "action": "allow", "reasons": [] }, "files": [], "pending": 0 }`, with no `player`.

### `POST /api/warden/server/anticheat/events`

```json
{
  "sessionId": "5f0c6a4e-8d0b-4f0e-9a52-2f4f7a1a9c11",
  "events": [{ "id": "7a1c0e52-6f1d-4d3e-8f55-1f0d9c3b2a10", "kind": "challengeWrong", "data": {} }]
}
```

`kind` is `challengeWrong`, `challengeMissed`, `modSetChanged` or `channelMismatch`, from 1 to 50 events. `id` makes the call safe to repeat: an event already stored is skipped. The answer is `{ "player": { "score", "band" }, "verdict": { … } }`, the session's verdict worked out again with the new player score.

### `POST /api/warden/server/anticheat/actions`

```json
{
  "sessionId": "5f0c6a4e-8d0b-4f0e-9a52-2f4f7a1a9c11",
  "reportId": "0d4c2b1e-3a77-4f5b-8c1a-6b1f0b1c2d3e",
  "action": "refuse",
  "reason": "fileRefused",
  "sha512": "…"
}
```

Records what the server did (`reportId` and `sha512` may be `null`). Answers 204. A session that has ended is accepted here, because a refusal ends it.

### `GET /api/warden/server/anticheat/sessions/:sessionId`

The latest report's answer for that session, read again from the database, for a server that missed stream events. A 404 with `data.problem` `unknownSession` or `noReport`.

### Events on `GET /api/warden/server/events`

| Event              | Data                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `anticheatVerdict` | `{ "sessionId", "uuid", "reportId", "verdict", "files": [the entries whose score or action changed] }` |
| `anticheatAlert`   | `{ "kind", "userId", "uuid", "sha512", "name" }`, with nullable fields                                 |

### What the server should do

- Keep the player in the configuration phase until the report answers. Apply `verdict.action`. On `hold` and `refuse`, disconnect with a message that names the files in `reasons`. Never show whether a modlist entry is optional.
- On a 503, a timeout or any 5xx, let the player in and log it: the site fails open.
- Bans are the server's call. On `ban`, call the existing ban route, then report the action.
- Send a new report in the same session when the file set changes. For a changed mod set also send a `modSetChanged` event. Pack changes need no event.
- Listen for `anticheatVerdict` and apply the new action to a player who is online.

## Alerts

In the admin only, never sent to players, by email or by push: a badge on the Anticheat entry of the nav, an item on the Overview, a list at the top of the review queue, and an `anticheatAlert` event on the Warden stream. Kinds: `fileRefused`, `bannedFileSeen`, `playerHeld`, `factsDisputed`, `banAffectsPlayers`. An open alert of the same kind, player and file is not raised twice. The audit rows that feed the stream (`anticheat.verdict`, `anticheat.alert`) are left out of the Warden activity log's default list.

## Admin

Access is for site admins and `warden-admin`, like Warden. Every admin action goes to `warden_audit` (see `docs/warden.md`), except notes, re-scores and dismissing alerts, which are not audited.

| Page                        | What it does                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/admin/anticheat`          | Files: the registry with filters, a drawer per file (score breakdown, history, players), approve, ban, review, notes. |
| `/admin/anticheat/review`   | The queue of files to review and refused files, with the open alerts above it.                                        |
| `/admin/anticheat/players`  | Players by trust score, lowest first. A row opens the Warden player page.                                             |
| `/admin/warden/players/:id` | The Anticheat section (`#anticheat`): score, timeline, files loaded now, files used, actions taken, hold and adjust.  |
| `/admin/anticheat/settings` | The mode, the rules (a save creates a new version), the policy table, "Score everything again", and the mod-ID bans.  |

Routes, all under `/api/anticheat/admin` (see `/api/docs` for the bodies):

| Route                                                         | What it does                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /files`, `GET /files/:sha512`                            | The registry (filters, cursor) and one file.                             |
| `GET /files/:sha512/players`                                  | The players who used a file, or its project.                             |
| `POST /files/:sha512/decision`                                | Approve or ban a file, or clear the decision.                            |
| `POST /files/:sha512/reviewed`, `/notes`, `/rescore`          | Mark reviewed at the current band, add a note, score again.              |
| `POST /files/:sha512/players/bulk`                            | Ban, hold or penalize several players of a file (up to 200).             |
| `GET /projects/search`, `POST /projects`, `GET /projects/:id` | Search the platforms, decide on a project nobody reported, and read one. |
| `POST /projects/:id/decision`, `/link`, `/unlink`             | Approve or ban a project, merge two, split a platform off.               |
| `GET/POST /mod-id-bans`, `DELETE /mod-id-bans/:id`            | The banned declared mod IDs.                                             |
| `GET /players`, `GET /players/:userId`                        | Players with a score, and one player's panel.                            |
| `GET /players/:userId/events`                                 | More of the timeline.                                                    |
| `POST /players/:userId/score`, `/hold`                        | Set a score, hold or release a player. Applies in every mode.            |
| `GET/PATCH /settings`, `POST /rescore`                        | The mode and rules, and marking every file stale.                        |
| `GET /alerts`, `POST /alerts/:id/dismiss`                     | Alerts, and dismissing one.                                              |
| `GET /summary`                                                | Counts for the nav badge.                                                |

## Data

All tables are in `server/db/schema/anticheat.ts`.

| Table                                        | Holds                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `anticheat_settings`, `anticheat_rules`      | The mode (one row), and every saved version of the rules, never updated.                            |
| `anticheat_project`, `anticheat_file`        | Projects (Modrinth, CurseForge, or a declared mod ID) and files by hash, with scores and decisions. |
| `anticheat_mod_id_ban`, `anticheat_history`  | Banned mod IDs, and the scores and admin actions on a file or project.                              |
| `anticheat_report`, `anticheat_report_file`  | What the server reported per session, with the snapshot each verdict used.                          |
| `anticheat_usage`                            | Which player used which file, and when.                                                             |
| `anticheat_player`, `anticheat_player_event` | The trust score and manual hold, and the timeline.                                                  |
| `anticheat_action`, `anticheat_alert`        | What the server did, and what admins should look at.                                                |

The `mod` table (the official list, `docs/mods.md`) has two columns for the anticheat: `optional` (admin only) and `fileSha512`, for hand-added mods. Visible official entries count as approved at scoring time, and a visible non-optional entry the client lacks counts against the first report of a session.

Reports, usage links and trust data are deleted with the account. The data is personal: it ties a LNB account, a Minecraft UUID and file hashes together, and shows only in the admin. No IP address is stored.

## Flags

| Flag                    | Effect                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `anticheat`             | Parent of the next two.                                     |
| `anticheat.serverApi`   | The routes under `/api/warden/server/anticheat` answer 503. |
| `anticheat.lookups`     | Lookups return at once: files stay pending, then time out.  |
| `jobs.anticheatLookups` | The per-minute lookup task skips its run.                   |
| `jobs.anticheatRescore` | The nightly re-score skips its run.                         |
| `jobs.anticheatPrune`   | The nightly prune skips its run.                            |

Admin routes are never gated. See `docs/feature-flags.md`.

## Environment

Nothing new. `WARDEN_SERVER_SECRET` authenticates the server (`docs/warden.md`), and the optional `CURSEFORGE_API_KEY` turns on the CurseForge lookups (`docs/mods.md`).

## Trying it locally

`scripts/anticheat-simulate.ts` plays the server's part: it sends one report for a session and prints the verdict. It runs TypeScript as is (Node 26 is pinned), reads `WARDEN_SERVER_SECRET` from `.env`, and needs the dev server (`pnpm dev`) and PostgreSQL.

```sh
node scripts/anticheat-simulate.ts --session <sessionId> --files files.json
# --url http://localhost:3000 is the default
```

`files.json` is an array of files, as in the contract:

```json
[
  {
    "kind": "mod",
    "sha512": "<128 hex characters>",
    "filename": "some-mod.jar",
    "modId": "some-mod"
  },
  { "kind": "client", "sha512": "<128 hex characters>", "filename": "minecraft.jar" }
]
```

A session needs a player. The Warden tests build one through the real login (`session()` in `test/server/anticheat-helpers.ts`: a user, a device, a join ticket, then `wardenSessionService.login`). On a local database the shortest way is to open a session by hand for an account that exists (sign in on the dev site first). In `psql` (`docker compose exec postgres psql -U lnb`):

```sql
insert into minecraft_account (uuid, user_id, username)
  values ('00000000-0000-4000-8000-000000000001', '<user id>', 'SimPlayer')
  on conflict do nothing;
insert into warden_session (minecraft_uuid, user_id)
  values ('00000000-0000-4000-8000-000000000001', '<user id>') returning id;
```

The `id` is the `--session`. The task `anticheat:lookups` runs each minute in a running server, and the lookups call the real Modrinth, so use real hashes if you want a file found. Fake hashes end as unknown after 60 seconds. Ask again with `GET /api/warden/server/anticheat/sessions/<id>`. Remove the player and session when you are done: they are real rows in your development database.

The server's stream events are easiest to watch with `curl -N -H "Authorization: Bearer $WARDEN_SERVER_SECRET" http://localhost:3000/api/warden/server/events`.

## Known limits

- The anticheat checks files, not behavior. A client that lies about its files, or a player who uses a cheat that isn't a file the client reports, is not caught by it. The trust score only moves on what the server reports.
- Scoring goes by hash, then by what Modrinth and CurseForge say about it. There is no lookalike detection, no publisher history and no CurseForge moderation status. The criteria are data, so they can be added.
- The site never bans by itself, and never acts on players in bulk without an admin. Bans go through Warden, by the server's call or by an admin.
- The site is not on the join path in a way that blocks players: when it is down, the server lets players in.
- Players see nothing about the anticheat on the site.
- There is no pinning of approved builds of the LNB mod.
- A change of rules marks every file stale. The nightly job scores up to 5 minutes' worth each night, so a very large registry can take several nights to catch up. "Score everything again" only marks files stale: it doesn't score them at once.
- Lists in the admin use offset cursors, except the player timeline, so a long list can shift while someone pages through it.
