# Anticheat: website implementation plan

This plan builds the website side of the LNB anticheat: the API the Minecraft server calls, the scoring, the platform lookups, the player trust score and the admin section. The Minecraft mod and server plugin are out of scope: this repo only defines the contract they follow.

Source design: [LNB Anticheat: File Verification & Trust System](https://claude.ai/artifact/LDWevkQ3CKH8LhgumbP9Wr). Approved mocks: [Anticheat admin mocks](https://claude.ai/artifact/8f2BCEe7yXvjdpNNeWhEEx), Files proposition A ("Table and drawer") and Player proposition A ("One page"). The mocks are layout references, not code to port.

## How to work through this plan

- Read `CLAUDE.md`, `docs/architecture.md`, `docs/design.md`, `docs/warden.md`, `docs/mods.md` and `docs/feature-flags.md` first. Their rules apply to every slice and are not repeated here.
- Work on the branch `feat/anticheat`. Do the slices in order. One slice per session works best.
- Each slice ends with: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (start PostgreSQL with `docker compose up -d` first), then one or more atomic commits with `git commit -s`, Conventional Commits subjects, and no AI attribution. Never push: ask the user.
- If a step contradicts the code you find, stop and ask the user instead of guessing. Do not widen the scope.
- When a step says "mirror X", open X and copy its structure, naming and error handling.

Rules that are easy to miss:

- Server code imports framework helpers from `nuxt/server`. Use `parseBody`, `parseParams`, `parseQuery` from `server/utils/validation.ts`, never `readValidatedBody` or `getRouterParams`.
- Every new file in `server/api/` needs an entry in `server/lib/openapi.ts`, or `test/unit/openapi.test.ts` fails. Request and response shapes are Zod schemas in `shared/schemas/anticheat.ts`.
- Every user-facing string goes in both `i18n/locales/en.json` and `i18n/locales/fr.json`. Write "LNB", never "La LNB". French uses the typographic apostrophe.
- No monospace font anywhere, including hashes: show them in the body font with `tabular-nums`, shortened to the first 10 and last 4 characters, with a ghost copy button.
- No raw palette classes or arbitrary values. Status pills use the status colors. Scores are text in the display font, never colored.
- Handlers stay 5 to 10 lines: guard, flag, validate, call a service, return.

## Decisions already made

These were settled with the user. Do not reopen them.

| Topic               | Decision                                                                                                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caller              | Only the Minecraft server calls the anticheat API, with `WARDEN_SERVER_SECRET` (`requireWardenServer`). The mod never calls it. Routes live under `/api/warden/server/anticheat/**`.                                                                                        |
| Session binding     | Every report and event is keyed by the Warden `sessionId` returned by `/api/warden/server/login`. The site derives the account from the session and ignores any identity in the payload.                                                                                    |
| Policy              | The site owns the points, thresholds and the action table, and returns a score, a band and a suggested action per file plus one verdict. The server applies it and reports what it did. Bans by the server go through the existing `/api/warden/server/players/:uuid/bans`. |
| Challenges          | The Minecraft server runs challenge-response and the channel cross-check, and sends events to the site. The site keeps the player trust score and timeline.                                                                                                                 |
| Player score owner  | One trust score per LNB account, not per Minecraft account.                                                                                                                                                                                                                 |
| Domain              | Its own `anticheat` domain. Admin access: site admins and `warden-admin` (`requireWardenAdmin`). No new role. Admin actions are audited in `warden_audit`.                                                                                                                  |
| Official modlist    | Extend the existing `mod` table (an admin-only `optional` flag and a file hash for hand-added mods). Visible official entries count as approved at scoring time. Nothing is copied.                                                                                         |
| Lookups             | Started in-process right after a report, with state in the database and a per-minute task that retries and expires. No Redis, no queue library.                                                                                                                             |
| Re-scores           | Reach the server as events on the existing `/api/warden/server/events` stream.                                                                                                                                                                                              |
| Cut from V1         | CurseForge moderation status, publisher history, lookalike detection. Criteria are data-driven so they can be added later.                                                                                                                                                  |
| Players on the site | Players see nothing about anticheat on the site in V1.                                                                                                                                                                                                                      |
| Retention           | Reports, usage links and trust data are deleted with the account. Usage links and reports not seen for 12 months are pruned nightly, except links to a banned file.                                                                                                         |
| Player view         | A new Anticheat section on the existing `/admin/warden/players/:userId` page. `/admin/anticheat/players` is only a list that links there.                                                                                                                                   |
| Join sequence       | The report is a separate call after `/login` returns `allowed`. `/login` is unchanged.                                                                                                                                                                                      |
| Mode                | Settings has `off`, `observe`, `enforce`. Default `observe`: everything is scored and logged, the suggested action is always `allow`, and player trust changes are recorded but not applied.                                                                                |
| Site unavailable    | The contract tells the server to fail open: let the player in and log it.                                                                                                                                                                                                   |
| Holds               | File holds and trust holds are derived from scores on each report. Only the manual "hold the next join" is stored on the player.                                                                                                                                            |
| Review outcomes     | Approve, ban, or "Reviewed, keep the score" (per hash, cleared when the file changes band).                                                                                                                                                                                 |
| Alerts              | In-admin only: a badge on the Anticheat nav entry, a tile on the Overview, and an event on the Warden stream. No email, push or webhook.                                                                                                                                    |
| Client entries      | The mod, game jar and loader are stored as kind `client`: shown and logged, never scored or looked up.                                                                                                                                                                      |
| Rule changes        | Saving new rules creates a new rules version. Files are re-scored lazily (next report or weekly job), with a "Score everything again" button.                                                                                                                               |

Assumptions to confirm with the user before slice 6 (the plan follows the recommended answer):

1. Project linking: automatic when one hash is found on both platforms, plus manual link and unlink by an admin. Suggestions from a shared declared mod ID are left out of V1.
2. A report holds at most 1,000 files. More is a 400.
3. "Players waiting" on a file means: distinct accounts whose latest report in the last 7 days was held or refused because of that file.
4. Trust gains use UTC days for the daily cap.

## Vocabulary

- **File**: one hash. Kinds: `mod`, `resourcepack`, `shader`, `client`.
- **Project**: a group of files. It has a Modrinth ID, a CurseForge ID, or both; or, for files unknown to both platforms, only a declared mod ID.
- **Decision**: an admin override on a file or a project: `approved` or `banned`. A ban always wins over an approval.
- **Band**: where a score falls. File bands: `approved` (100), `accepted` (75 to 99), `middle` (40 to 74), `low` (1 to 39), `banned` (0). Player bands: `trusted` (70 to 100), `normal` (30 to 69), `held` (1 to 29), `zero` (0).
- **Status** (admin label): `approved`, `accepted`, `review`, `refused`, `banned`, `pending`. Derived, never stored: see "Status" below.
- **Action**: `allow`, `flag`, `warn`, `hold`, `refuse`, `kick`, `ban`, from least to most severe.
- **Verdict**: the most severe action over a session's files and the player, with its reasons.

## Target files

```
shared/schemas/anticheat.ts            Zod contracts (server API, admin API, rules)
shared/flags.ts                        new flags
shared/utils/anticheat.ts              band and status helpers used by both sides
server/db/schema/anticheat.ts          tables (export from schema/index.ts)
server/lib/anticheat-rules.ts          default rules object (no Nuxt imports)
server/services/anticheat/
  rules.ts        pure scoring, bands, verdict, player math (no db import)
  settings.ts     mode and rules versions
  platforms.ts    Modrinth and CurseForge hash lookups
  lookup.ts       claim pending files, look up, link projects, expire, retry
  scoring.ts      score a file from the database and store its breakdown
  reports.ts      take a report, usage links, verdict, re-evaluation
  players.ts      trust score, events, holds, playtime gains
  modpack.ts      the official modlist as approvals, and the missing-mods check
  admin.ts        registry lists, detail, decisions, review, bulk actions
  alerts.ts       alerts and the badge counts
  shared.ts       refuse(), actor types
server/api/warden/server/anticheat/    reports.post.ts, events.post.ts, actions.post.ts,
                                       sessions/[sessionId].get.ts
server/api/anticheat/admin/            the admin routes (slice 6)
server/tasks/anticheat/                lookups.ts, rescore.ts, prune.ts
app/pages/admin/anticheat/             index.vue, review.vue, players.vue, settings.vue
app/components/admin/anticheat/        Files.vue, FileDrawer.vue, Criteria.vue, ScorePill.vue,
                                       Players.vue, PlayerPanel.vue, Settings.vue, modals
app/composables/useAnticheatAdmin.ts
docs/anticheat.md                      the contract and the rules, like docs/warden.md
test/unit/anticheat-rules.test.ts
test/server/anticheat-*.test.ts
scripts/anticheat-simulate.ts          a local client for the server routes
```

## Data model

All tables go in `server/db/schema/anticheat.ts`, mirroring the style of `server/db/schema/warden.ts` (comments on each table, `$type<>` on text enums, check constraints for enums, indexes named `<table>_<columns>_idx`). SHA-512 values are stored as 128 lowercase hex characters.

**`anticheat_settings`** (single row, `id = 1`, check constraint like `warden_settings`)

- `mode` text `'off' | 'observe' | 'enforce'`, default `'observe'`
- `rulesVersion` integer, references `anticheat_rules.version`
- `updatedAt`, `updatedByUserId` (set null)

**`anticheat_rules`** (one row per saved rules version, never updated)

- `version` serial primary key, `rules` jsonb (`AnticheatRules`), `createdAt`, `createdByUserId` (set null)
- The migration inserts version 1 with the default rules and the settings row. Since `drizzle-kit generate` only writes DDL, add the two `INSERT` statements by hand at the end of the generated SQL file, with the rules JSON copied from `server/lib/anticheat-rules.ts`. A unit test compares the two so they can't drift.

**`anticheat_project`**

- `id` uuid primary key
- `kind` text (`mod | resourcepack | shader`)
- `name` text
- `modrinthId` text, unique when not null; `curseforgeId` text, unique when not null
- `modIds` text array, default empty: declared mod IDs seen on files whose hash a platform confirmed
- `declaredModId` text, unique when not null: set only on projects with no platform ID
- `modrinth` jsonb and `curseforge` jsonb: the stored metadata (see `platforms.ts`), each with `fetchedAt`
- `decision` text (`approved | banned`, nullable), `decidedAt`, `decidedByUserId` (set null), `decisionNote`
- `createdAt`, `updatedAt`
- Check: at least one of `modrinthId`, `curseforgeId`, `declaredModId` is set.

**`anticheat_file`**

- `sha512` text primary key
- `kind` text (`mod | resourcepack | shader | client`)
- `fingerprint` bigint nullable (the CurseForge fingerprint the client sent)
- `filename` text; `declared` jsonb `{ modId?, name?, version?, loader? }` (first values seen)
- `projectId` uuid nullable, references `anticheat_project` (set null)
- `platformVersion` jsonb nullable: `{ modrinth?: { versionId, versionNumber, loaders, publishedAt }, curseforge?: { fileId, publishedAt } }`
- `lookupState` text: `pending | found | notFound | timedOut | skipped` (`skipped` for kind `client`)
- `lookupStartedAt`, `lookedUpAt`, `lookupRetryAt` timestamps, nullable
- `facts` jsonb nullable `{ coreShaders: boolean, alteredTextures: boolean }`; `factsDisputed` boolean default false
- `decision`, `decidedAt`, `decidedByUserId`, `decisionNote` (same as project)
- `reviewedAt`, `reviewedByUserId`, `reviewedBand`
- `score` smallint nullable, `band` text nullable, `breakdown` jsonb nullable, `rulesVersion` integer nullable, `scoredAt`, `rescoreAt`
- `firstSeenAt`, `lastSeenAt`
- Indexes: `projectId`; `(lookupState, lookupStartedAt)`; `(kind, score)`; `rescoreAt`.

**`anticheat_mod_id_ban`**: `modId` text primary key (lowercase), `reason`, `createdAt`, `createdByUserId`.

**`anticheat_history`** (scores and admin actions on a file or project, for the detail view)

- `id` bigserial, `sha512` nullable, `projectId` nullable (both cascade), `kind` text (`score | approve | ban | clear | reviewed | note | link | unlink`), `actorUserId` (set null), `data` jsonb, `at`
- Indexes on `(sha512, id)` and `(projectId, id)`.

**`anticheat_report`**

- `id` uuid, `sessionId` uuid references `warden_session` (cascade), `userId` references `user` (cascade), `minecraftUuid` uuid
- `seq` integer (1 for the join report, then 2, 3… in the session); unique `(sessionId, seq)`
- `mode` text, `rulesVersion` integer
- `verdict` jsonb (`AnticheatVerdict`, see the contract), `playerScore` smallint
- `modlistChecked` boolean default false, `modlistMissing` jsonb nullable (array of mod names)
- `createdAt`, `evaluatedAt`
- Index `(userId, createdAt)`.

**`anticheat_report_file`**

- `reportId` (cascade), `sha512` references `anticheat_file`, primary key on both
- `kind`, `filename`, `declared` jsonb (as reported this time)
- `score`, `effectiveScore`, `band`, `action` (nullable while pending); these are the snapshot the verdict used
- Index on `sha512`.

**`anticheat_usage`** (player and file link)

- `userId` (cascade), `sha512` (cascade), primary key on both
- `firstSeenAt`, `lastSeenAt`, `sessionCount` integer, `lastSessionId` uuid nullable, `lastVersion` text nullable, `lastMinecraftUuid` uuid
- Index on `sha512`.

**`anticheat_player`**

- `userId` primary key (cascade), `score` smallint default 50
- `manualHold` boolean default false, `holdReason`, `holdAt`, `holdByUserId`
- `updatedAt`

**`anticheat_player_event`**

- `id` bigserial, `userId` (cascade), `sessionId` uuid nullable (set null)
- `eventId` uuid nullable, unique when not null (the server's idempotency key)
- `kind` text: `challengeWrong | challengeMissed | modSetChanged | channelMismatch | modlistIncomplete | playtime | adminAdjust | bulkPenalty | holdSet | holdCleared`
- `delta` smallint, `applied` boolean, `scoreAfter` smallint, `data` jsonb, `actorUserId` (set null), `at`
- Index `(userId, id)`.

**`anticheat_action`** (what the server did)

- `id` bigserial, `userId` (cascade), `sessionId` nullable (set null), `reportId` nullable (set null), `action` text, `reason` text (a rule code), `sha512` nullable, `at`
- Index `(userId, id)`.

**`anticheat_alert`**

- `id` bigserial, `kind` text (`fileRefused | bannedFileSeen | playerHeld | factsDisputed | banAffectsPlayers`), `userId` nullable (cascade), `sha512` nullable (cascade), `data` jsonb, `createdAt`, `dismissedAt`, `dismissedByUserId`
- An alert of the same kind, user and file that is still open is not created twice (partial unique index where `dismissedAt is null`, with `coalesce` on the nullable columns, or check in the service inside the transaction).

**Changes to existing tables**

- `mod`: add `optional` boolean default false not null, and `fileSha512` text nullable.
- `WARDEN_AUDIT_ACTIONS` in `server/db/schema/warden.ts`: add `anticheat.approve`, `anticheat.ban`, `anticheat.clear`, `anticheat.reviewed`, `anticheat.link`, `anticheat.unlink`, `anticheat.modIdBan`, `anticheat.modIdUnban`, `anticheat.playerAdjust`, `anticheat.hold`, `anticheat.holdClear`, `anticheat.bulk`, `anticheat.settings`, `anticheat.verdict`, `anticheat.alert`. The last two are written by the system and only exist to feed the event stream.

Generate with `pnpm db:generate --name anticheat`. Add a case to the migration tests in `test/db/` if the existing ones enumerate tables.

## Rules and scoring

`server/lib/anticheat-rules.ts` exports `DEFAULT_ANTICHEAT_RULES`. Its Zod schema `anticheatRules` lives in `shared/schemas/anticheat.ts` so the settings form and the server share it.

```ts
{
  criteria: {
    moderationApproved: 20,
    downloadsHigh: 20, downloadsHighMin: 10000,
    downloadsMid: 10, downloadsMidMin: 1000,
    projectAge: 15, projectAgeDays: 182,
    versionAge: 15, versionAgeDays: 14,
    bothPlatforms: 10,
    identityMatch: 10,          // mods only
    serverSide: 10,             // mods only
    texturesClean: 60,          // resource packs only
    noCoreShaders: 40,          // resource packs only
    unknown: -50,
    suspectedModified: -40,     // mods and resource packs
    texturesAltered: -100,      // resource packs only
    coreShaders: -40,           // resource packs only
  },
  bands: { accepted: 75, middle: 40 },
  policy: {
    mod:          { approved: 'allow', accepted: 'flag', middle: 'hold', low: 'refuse', banned: 'ban' },
    resourcepack: { approved: 'allow', accepted: 'flag', middle: 'warn', low: 'refuse', banned: 'kick' },
    shader:       { approved: 'allow', accepted: 'allow', middle: 'allow', low: 'allow', banned: 'kick' },
  },
  player: {
    start: 50, trusted: 70, held: 30,
    challengeWrong: -25, challengeMissed: -5, challengeMissedSessionCap: -15,
    modSetChanged: -30, channelMismatch: -30, modlistIncomplete: -40,
    playPerHour: 1, playDailyCap: 5, adjustFactor: 0.2,
  },
  lookup: { pendingTimeoutSeconds: 60, notFoundRetryHours: 6, rescoreDays: 7 },
}
```

`server/services/anticheat/rules.ts` holds pure functions only (no database import), all covered by `test/unit/anticheat-rules.test.ts`.

### `scoreFile(input, rules): FileScore`

Input: the file's `kind`, `decision`, its project's `decision`, whether its declared mod ID is in the mod-ID ban list, whether it is in the official modpack, its `lookupState`, the platform metadata, `facts`, `factsDisputed`, whether its declared mod ID belongs to a known platform project, and `now`.

Order of evaluation:

1. Kind `client`: no score. Return `{ score: null, band: null, path: 'client' }`.
2. Banned: the file's decision is `banned`, or its project's is, or its declared mod ID (lowercased) is in `anticheat_mod_id_ban`. Score 0, band `banned`, path `banned`, with which of the three matched.
3. Approved: the file's decision is `approved`, or its project's is, or it is in the official modpack. Score 100, band `approved`, path `approved` (`hash`, `project` or `modpack`).
4. `lookupState` is `pending`: no score yet. Return `{ score: null, band: null, path: 'pending' }`.
5. Otherwise compute.

Computation. Each criterion evaluates to `earned`, `notEarned` or `unavailable`, with its points:

| Criterion                        | Kinds        | Earned when                                                                                                                                                                  | Unavailable when                                                                |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `moderationApproved`             | all          | Modrinth project `status` is `approved`                                                                                                                                      | the file is found on CurseForge only                                            |
| `downloadsHigh` / `downloadsMid` | all          | the highest download count across platforms is at least `downloadsHighMin` (20), else at least `downloadsMidMin` (10). They are one criterion worth at most `downloadsHigh`. | never                                                                           |
| `projectAge`                     | all          | the earliest project creation date is more than `projectAgeDays` ago                                                                                                         | never                                                                           |
| `versionAge`                     | all          | this file's publication date is more than `versionAgeDays` ago                                                                                                               | never                                                                           |
| `bothPlatforms`                  | all          | the hash was found on both platforms                                                                                                                                         | no CurseForge key is configured                                                 |
| `identityMatch`                  | mod          | the declared loader is in the platform version's loaders and the declared version equals the platform version number, or is contained in it                                  | the file declared no version or loader, or the file is found on CurseForge only |
| `serverSide`                     | mod          | Modrinth `server_side` is `required`                                                                                                                                         | no Modrinth record, or `server_side` is `unknown`                               |
| `texturesClean`                  | resourcepack | `facts.alteredTextures === false` and not disputed                                                                                                                           | never (no facts means not earned)                                               |
| `noCoreShaders`                  | resourcepack | `facts.coreShaders === false` and not disputed                                                                                                                               | never                                                                           |

For a file found on neither platform (`notFound` or `timedOut`), every platform criterion is `notEarned`, never `unavailable`.

Penalties (never scaled): `unknown` when found on neither platform; `suspectedModified` when found on neither platform and the declared mod ID is in some platform project's `modIds`; `texturesAltered` when `facts.alteredTextures === true`; `coreShaders` when `facts.coreShaders === true`. Penalties from facts apply even when the facts are disputed only if every report agreed on that value; when disputed, neither the content points nor the content penalties apply.

Formula:

```
fullMax      = sum of the positive criteria that apply to this kind
availableMax = fullMax - sum of the criteria that are unavailable
earned       = sum of the earned points
scaled       = availableMax > 0 ? round(earned * fullMax / availableMax) : 0
score        = clamp(scaled + sum of penalties, 1, 99)
```

The breakdown stored on the file is `{ path, rulesVersion, criteria: [{ key, state, points }], fullMax, availableMax, earned, scaled, penalties, raw, score }`. The admin shows exactly this, never a recomputation.

Unit tests must include the doc's examples: a mod on neither platform scores 1; an unknown resource pack with clean facts scores 50; an unknown resource pack with altered textures and no core shaders scores 1 (raw −110); a banned project scores 0 even with an approved hash; an approved file scores 100; a CurseForge-only mod is scaled.

### Bands, effective score, actions, verdict

- `bandOf(score, rules)`: 0 is `banned`, 100 is `approved`, at least `bands.accepted` is `accepted`, at least `bands.middle` is `middle`, else `low`.
- `effectiveScore(fileScore, playerScore, rules)`: for scores from 1 to 99 only, `clamp(round(fileScore + (playerScore - 50) * adjustFactor), 1, 99)`. A mod found on neither platform keeps its own score if the adjustment would raise it. Scores 0 and 100 are returned unchanged.
- `fileAction(kind, effectiveBand, rules)`: from `policy`. Pending files get `allow` until they time out.
- `playerBandOf(score, rules)` and `playerAction`: `held` gives `hold`, `zero` gives `kick`, a stored manual hold gives `hold`.
- `verdictOf(files, player, mode)`: the most severe action, with `reasons: [{ code, sha512?, name?, action }]`. Reason codes: `fileBanned`, `fileRefused`, `fileHeld`, `packWarning`, `playerHeld`, `playerZero`, `manualHold`. In `observe` mode the verdict's `action` is `allow` and `wouldBe` holds the real one. In `enforce` mode `wouldBe` is absent.

### Status (admin label)

`shared/utils/anticheat.ts` exports `fileStatus(file)`: `pending` when `lookupState` is `pending`; `banned` at 0; `approved` at 100; `refused` in band `low` for mods and resource packs; `review` when the band is `middle`, or `accepted` and not yet reviewed (`reviewedBand` differs from the current band), for mods and resource packs; `accepted` otherwise.

### Player math

- `applyPlayerEvent(score, kind, sessionEvents, rules)` returns the delta. `challengeMissed` stops at `challengeMissedSessionCap` per session. `modlistIncomplete` applies once per session. The score stays between 0 and 100.
- `playtimeGain(sessionSeconds, gainedToday, hadPenalty, rules)`: 0 when the session had an applied or recorded penalty; otherwise `min(floor(seconds / 3600) * playPerHour, playDailyCap - gainedToday)`, never negative.

## Contract with the Minecraft server

All routes: `requireWardenServer(event)`, then `await requireFlag(event, 'anticheat.serverApi')`. OpenAPI tag: a new `anticheatServer: 'Anticheat: Minecraft server'`, access `wardenServer`. Problems use a new `AnticheatProblem` union in the shared schemas and a `refuse()` in `server/services/anticheat/shared.ts` (mirror the Warden one).

### `POST /api/warden/server/anticheat/reports`

Sent right after an allowed login, and again in the same session whenever the client's file set changes.

```json
{
  "sessionId": "uuid",
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

- `kind`: `mod | resourcepack | shader | client`. `sha512` is lowercased by the schema. `fingerprint` is an optional unsigned 32-bit integer. `filename` 1 to 255 characters. `modId`, `name`, `version`, `loader` are optional strings up to 128 characters. `facts` is optional and only read for resource packs.
- 1 to 1,000 files, unique by `sha512` (duplicates are a 400).
- Problems: `unknownSession` (404) when the session doesn't exist or has ended.

Response:

```json
{
  "reportId": "uuid",
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

`state` is `scored`, `pending` or `ignored` (kind `client`). With mode `off` the route stores nothing and answers `{ "mode": "off", "verdict": { "action": "allow", "reasons": [] }, "files": [], "pending": 0 }` with a null `reportId` and no `player`.

### `POST /api/warden/server/anticheat/events`

```json
{ "sessionId": "uuid", "events": [{ "id": "uuid", "kind": "challengeWrong", "data": {} }] }
```

`kind`: `challengeWrong | challengeMissed | modSetChanged | channelMismatch`. `id` makes the call idempotent: an event already stored is skipped. Response: `{ "player": { "score", "band" }, "verdict": { … } }` (the session's current verdict, recomputed with the new player score). Problem: `unknownSession` (404).

### `POST /api/warden/server/anticheat/actions`

```json
{
  "sessionId": "uuid",
  "reportId": "uuid or null",
  "action": "refuse",
  "reason": "fileRefused",
  "sha512": "… or null"
}
```

Records what the server did. Returns 204. An ended session is accepted here, since a refusal ends it.

### `GET /api/warden/server/anticheat/sessions/:sessionId`

The latest report's response body for that session, re-read from the database. For a server that missed stream events. Problem: `unknownSession` (404), `noReport` (404).

### Events on `/api/warden/server/events`

Add two event types to `WardenEvent` in `shared/schemas/warden.ts` and to `EVENT_ACTIONS` and `toEvent` in `server/services/warden/events.ts`:

| Event              | From audit action   | Data                                                                                                   |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `anticheatVerdict` | `anticheat.verdict` | `{ "sessionId", "uuid", "reportId", "verdict", "files": [the entries whose score or action changed] }` |
| `anticheatAlert`   | `anticheat.alert`   | `{ "kind", "userId", "uuid", "sha512", "name" }` (nullable fields)                                     |

The audit rows carry the full event data in `data`, written with actor `{ source: 'system' }`, so `toEvent` only reshapes it. Exclude `anticheat.verdict` and `anticheat.alert` from the admin activity log's default list (`server/services/warden/admin.ts`, wherever the audit list is queried) so the log stays readable.

### What the contract tells the server

Write these in `docs/anticheat.md`:

- Keep the player in the configuration phase until the report answers. Apply `verdict.action`. On `hold` and `refuse`, disconnect with a message that names the files in `reasons`. Never show whether a modlist entry is optional.
- On a 503, a timeout or any 5xx, let the player in and log it.
- Bans are the server's call: on `ban`, call the existing ban route, then report the action.
- Send a new report in the same session when the file set changes. For a changed mod set also send a `modSetChanged` event; pack changes need no event.
- Listen for `anticheatVerdict` and apply the new action to an online player.

## Services

### `settings.ts`

- `get()`: mode, current rules version and rules, through a 10 second in-memory cache like `flagService`.
- `rulesFor(version)`: for explaining old breakdowns.
- `update({ actorId, mode?, rules? })`: in a transaction; a changed `rules` object inserts a new `anticheat_rules` row and points the settings at it; audits `anticheat.settings`; clears the cache.

### `platforms.ts`

Before writing this file, check the current API references (Modrinth: `docs.modrinth.com`, CurseForge: `docs.curseforge.com`) and confirm the endpoints and field names below. If one differs, follow the reference and tell the user in the slice summary.

- Reuse the constants, headers, timeout and `getJson` pattern of `server/services/mods/catalog.ts` (export what you need from it instead of duplicating). Add a `postJson` beside it.
- `modrinthByHashes(sha512s)`: `POST /v2/version_files` with `{ hashes, algorithm: 'sha512' }`, in chunks of 200. Returns a map from hash to `{ versionId, projectId, versionNumber, loaders, publishedAt }`. Then `GET /v2/projects?ids=[…]` for the distinct projects: `{ id, slug, title, projectType, status, downloads, publishedAt, serverSide }`.
- `curseforgeByFingerprints(fingerprints)`: only when `CURSEFORGE_API_KEY` is set. `POST /v1/fingerprints` with `{ fingerprints }`; exact matches give `{ fingerprint, modId, fileId, publishedAt }`. Then `POST /v1/mods` with `{ modIds }`: `{ id, slug, name, downloadCount, dateCreated }`.
- A network error or a non-2xx answer throws `CatalogUnavailableError`; "not found" is a normal result. Never log hashes with player identities.
- Unit-test the response mapping with fixture objects. Do not call the real APIs in tests: `lookup.ts` takes the platform client as a parameter with the real one as default.

### `lookup.ts`

- `claim(limit = 200)`: one `UPDATE … RETURNING` that sets `lookupStartedAt = now()` on files where `lookupState` is `pending` or `timedOut`, or `notFound` with `lookupRetryAt < now()` and `lastSeenAt` within 7 days, and `lookupStartedAt` is null or older than 30 seconds. This is the lock: two runs never take the same file.
- `resolve(files, client)`: calls both platforms, then for each file in one transaction per file:
  - Found: upsert the project. Find it by `modrinthId` or `curseforgeId`. Found on both platforms with two different existing projects: merge them (move the files of the second to the first, copy its platform ID and metadata, keep a `banned` decision over an `approved` one, delete the second, write a `link` history row). Set the file's `projectId`, `platformVersion`, `lookupState = 'found'`, `lookedUpAt`. Add the file's declared mod ID (lowercased) to the project's `modIds`.
  - Not found on either: `lookupState = 'notFound'`, `lookupRetryAt = now + notFoundRetryHours`. If the file has a declared mod ID, attach it to the project whose `declaredModId` matches, creating it if needed.
  - A platform that was unavailable: leave the file `pending` and clear `lookupStartedAt`, so the next sweep retries.
  - Then `scoring.scoreAndStore(tx, sha512)`.
- `expire()`: files `pending` whose `firstSeenAt` (or last `lookupStartedAt`) is older than `pendingTimeoutSeconds` become `timedOut` and are scored as unknown. They stay claimable.
- `run()`: `claim`, `resolve`, `expire`, then `reportService.reevaluateFor(sha512s)` for every file whose score or state changed. Returns counts.
- `kick()`: `void run().catch(log)`, called after a report is stored. In tests, call `run()` directly.

### `scoring.ts`

- `scoreAndStore(tx, sha512)`: loads the file, its project, the mod-ID ban, the modpack membership (`modpack.ts`) and the current rules, calls `scoreFile`, and stores `score`, `band`, `breakdown`, `rulesVersion`, `scoredAt`, `rescoreAt = now + rescoreDays`. When the score or path changed, insert an `anticheat_history` row of kind `score` with the old and new score. When the band changed, clear `reviewedAt`, `reviewedByUserId`, `reviewedBand`.
- `rescoreProject(tx, projectId)`: every file of the project. Used after a decision.
- `rescoreStale(limit)`: files whose `rulesVersion` is not the current one or whose `rescoreAt` has passed. For found files older than `rescoreDays`, refresh the project metadata first through `platforms.ts`.

### `modpack.ts`

- `isInModpack(tx, file, project)`: true when a visible official `mod` row matches: `source = 'modrinth'` and `sourceId = project.modrinthId`, or `source = 'curseforge'` and `sourceId = project.curseforgeId`, or `fileSha512 = file.sha512`.
- `missing(tx, reportFiles)`: the visible official, non-optional entries with no matching reported file. Manual entries without `fileSha512` are skipped. Returns their names.
- When an official mod is added, removed, edited or its `optional` flag changes (`server/services/mods/admin.ts`), re-score the files of the matching project. Find the place where each of those writes commits and call `scoring.rescoreProject` there.

### `reports.ts`

`submit({ sessionId, files })`, in one transaction:

1. Load the open `warden_session` (not ended), or refuse `unknownSession`. Take `userId` and `minecraftUuid` from it.
2. With mode `off`, return the off answer without writing.
3. Upsert each file into `anticheat_file`: new rows get `lookupState = 'pending'` (`skipped` for `client`) and `firstSeenAt`; existing rows get `lastSeenAt`. Store `fingerprint` if it was missing.
4. Resource pack facts: if the file has no stored facts, store them. If it has stored facts that differ from the reported ones, set `factsDisputed = true` and create a `factsDisputed` alert. Either change re-scores the file.
5. Score new non-pending files and any file with no score (`scoring.scoreAndStore`).
6. Ensure the `anticheat_player` row (start score from the rules).
7. Insert the report (`seq` = previous max + 1) and its `anticheat_report_file` rows.
8. Upsert `anticheat_usage`: first report of a file in this session increases `sessionCount` (compare `lastSessionId`), and always updates `lastSeenAt`, `lastVersion`, `lastMinecraftUuid`.
9. `evaluate(tx, reportId)` (below), then return the response.

After the transaction commits, call `lookupService.kick()` when any file is pending.

`evaluate(tx, reportId)`:

- Recomputes each report file's `score`, `effectiveScore`, `band`, `action` from the current file rows and the player's score, and the verdict.
- Modlist check: when the report has no pending file and `modlistChecked` is false and this is a report with `seq = 1`, run `modpack.missing`. Store the result, set `modlistChecked`, and when something is missing record a `modlistIncomplete` player event (which changes the player score before the verdict is computed).
- Alerts: `fileRefused` when a file's action is `refuse`, `bannedFileSeen` on `kick` or `ban` from a file, `playerHeld` when the player band is `held`.
- Returns whether the verdict or any file entry changed.

`reevaluateFor(sha512s)`: for each open session whose latest report contains one of the files, run `evaluate`. When it changed, write a `warden_audit` row `anticheat.verdict` (system actor, `targetUserId`, `targetMinecraftUuid`, and the event data), which the stream sends. Also used after admin decisions and player score changes (`reevaluateForUser(userId)`).

`current(sessionId)`: the response body rebuilt from the stored snapshot, for the `GET` route.

### `players.ts`

- `ensure(tx, userId)`, `get(userId)`.
- `record(tx, { userId, sessionId, kind, eventId?, data?, actorUserId? })`: computes the delta with `applyPlayerEvent`. In `enforce` mode it updates the score and stores `applied = true`; in `observe` mode it stores the event with `applied = false` and leaves the score. Admin kinds (`adminAdjust`, `bulkPenalty`, `holdSet`, `holdCleared`) always apply.
- `serverEvents({ sessionId, events })`: for the events route. Skips known `eventId`s, records the rest, then `reportService.reevaluateForUser`.
- `creditPlaytime(tx, session)`: called from `closeSessions` in `server/services/warden/sessions.ts` for each closed session (extend its `returning` with `id`, `userId` and the seconds it already computes). Uses `playtimeGain`; "gained today" is the sum of applied `playtime` deltas since 00:00 UTC. Skip when mode is `off`. Watch for an import cycle between the Warden and anticheat services: if one appears, pass the function in through a small registration like `server/plugins/avatars.ts` does.
- `adjust({ actorId, userId, score, reason })`, `setHold({ actorId, userId, hold, reason })`: each writes a player event, an audit row, and re-evaluates the player's open session. Clearing a hold on a player in the `held` band also sets the score to `rules.player.held`.

### `admin.ts` and `alerts.ts`

Described with their routes in slice 6.

## Flags

Add to `shared/flags.ts`, with labels in both locales (`admin.flags.items`): `anticheat`, `anticheat.serverApi`, `anticheat.lookups`, and `jobs.anticheatLookups`, `jobs.anticheatRescore`, `jobs.anticheatPrune`. `anticheat.lookups` off means `lookup.run()` returns at once (files stay pending, then time out). Admin routes are never gated. Update `docs/feature-flags.md`.

## Slices

### Slice 0: branch and API check

1. `git switch -c feat/anticheat`.
2. Read the Modrinth and CurseForge references for the four endpoints in `platforms.ts`. Note any difference in the commit message of slice 4.

### Slice 1: schema, rules, shared schemas

1. `shared/schemas/anticheat.ts`: the rules schema, the server contract schemas, the enums (`kind`, `band`, `status`, `action`, `mode`, problem codes).
2. `server/lib/anticheat-rules.ts` and `shared/utils/anticheat.ts`.
3. `server/db/schema/anticheat.ts`, the `mod` columns, the audit actions, the export in `schema/index.ts`, the migration with its two seed inserts.
4. `server/services/anticheat/rules.ts` with `test/unit/anticheat-rules.test.ts`.
5. The flags, their translations, `docs/feature-flags.md`.

Commits: `feat: add the anticheat schema`, `feat: add the anticheat scoring rules`, `feat: add the anticheat flags`.

### Slice 2: reports from the database

1. `settings.ts`, `shared.ts`, `modpack.ts` (`isInModpack` and `missing`), `scoring.ts`, `players.ts` (`ensure`, `get`, `record`), `alerts.ts` (`raise`), `reports.ts`. In this slice every unknown hash stays `pending`: `lookupService.kick` is a stub that does nothing.
2. The `reports.post.ts` and `sessions/[sessionId].get.ts` routes with their OpenAPI entries.
3. `test/server/anticheat-reports.test.ts`, mirroring the setup helpers of `test/server/warden-login.test.ts` (create a user, a device, a ticket, log in, then report). Cover: unknown session; mode off writes nothing; a banned project gives `ban` in enforce and `allow` with `wouldBe: 'ban'` in observe; an approved hash gives 100; an official modlist project gives 100; usage link counts one session for two reports in the same session; a second report gets `seq` 2; disputed facts raise an alert; more than 1,000 files is refused by the schema.

Commit: `feat: take anticheat file reports from the Minecraft server`.

### Slice 3: platform lookups and re-evaluation

1. `platforms.ts` and `lookup.ts`, the real `kick`.
2. The stream events (`shared/schemas/warden.ts`, `server/services/warden/events.ts`), and the exclusion from the activity log.
3. `server/tasks/anticheat/lookups.ts` (mirror `server/tasks/warden/close-stale-sessions.ts`, flag `jobs.anticheatLookups`), scheduled every minute in `nuxt.config.ts`.
4. `test/server/anticheat-lookup.test.ts` with a fake platform client: a found mod is scored from metadata and linked to a project; the same hash on both platforms merges two projects and keeps a ban; not found sets the retry time and scores 1; a platform outage leaves the file pending; `expire` turns an old pending file into `timedOut`; `claim` never returns the same file to two callers (run two claims with `Promise.all`); a resolved lookup writes an `anticheat.verdict` audit row only when the verdict changed.
5. Unit tests for the mapping in `platforms.ts`.

Commits: `feat: look up anticheat files on Modrinth and CurseForge`, `feat: send anticheat verdict changes to the Minecraft server`.

### Slice 4: player trust

1. The rest of `players.ts`, the `events.post.ts` and `actions.post.ts` routes, the hook in `closeSessions`.
2. The modlist check inside `evaluate`.
3. `test/server/anticheat-players.test.ts`: each event kind and its cap; idempotency by event ID; observe mode records without applying; the playtime gain, its daily cap, and no gain after a penalty; the modlist penalty applies once per session and waits for pending files; a held player gets `hold`; a manual hold gives `hold` until cleared; the effective score moves a middle file by the player adjustment and never lifts an unknown mod.

Commit: `feat: keep a trust score per player`.

### Slice 5: official modlist merge

1. `server/services/mods/admin.ts` and the mod schemas: accept `optional` on official mods and `fileSha512` on manual ones (128 hex, lowercased). Check every public view in `server/services/mods/views.ts` and the public schemas: neither field may reach `/api/minecraft/mods/**` public responses. Add a test for that.
2. Re-score hooks from `modpack.ts`.
3. `/admin/mods`: an "Optional" switch and, for manual mods, a file hash field in the existing edit dialog; an "Optional" neutral badge on the admin row. Translations in both locales.
4. Update `docs/mods.md`.

Commit: `feat: mark official mods optional and tie them to the anticheat`.

### Slice 6: admin API

Confirm the four assumptions at the top with the user first. All routes use `requireWardenAdmin`, live under `server/api/anticheat/admin/`, and get OpenAPI entries with a new tag `anticheatAdmin: 'Anticheat: admins'`. Lists take `cursor` and return `{ items, nextCursor }` like Warden's. Every write runs in a transaction, writes an `anticheat_history` row where a file or project is concerned, writes a `warden_audit` row, and re-scores and re-evaluates what it touched.

| Route                                                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /files?kind=&status=&q=&userId=&sort=&cursor=`                   | Registry rows grouped by project: one row per project (with its file count, both platform labels, the lowest score among its files), and one row per file without a project. Each row has name, status, score, `usingNow` (open sessions whose latest report has it), `everUsed` (usage rows), `waiting`, first seen, last scored. `q` searches hash prefix, filename, declared mod ID and project name. `userId` limits to files that player used. `sort=queue` orders by `waiting` descending, then score ascending. |
| `GET /projects/:id`                                                   | The project, its decision, its metadata and its files (versions).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GET /files/:sha512`                                                  | The detail view: score, band, status, path, the stored breakdown with its rules version, identity (hashes, declared values, filename, matched project and version), dates (scored, next re-score), history (from `anticheat_history`), and the first page of players.                                                                                                                                                                                                                                                  |
| `GET /files/:sha512/players?cursor=`                                  | Usage rows with the player's public profile, first and last seen, session count, version, and whether they used it after the ban date. With `?project=1`, across every file of the project.                                                                                                                                                                                                                                                                                                                            |
| `POST /files/:sha512/decision`                                        | `{ "decision": "approved" \| "banned" \| null, "note"? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /projects/:id/decision`                                         | Same body. A ban answers with `affectedPlayers` and raises a `banAffectsPlayers` alert when it is above 0.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /projects`                                                      | `{ "source": "modrinth" \| "curseforge", "sourceId", "kind", "decision" }`: decide on a project nobody reported yet. Fetch its name with `modCatalog.project`. 409 `exists` when it is already there.                                                                                                                                                                                                                                                                                                                  |
| `POST /files/:sha512/reviewed`                                        | Marks the file reviewed at its current band.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /files/:sha512/notes`                                           | `{ "body" }`, 1 to 1,000 characters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /files/:sha512/rescore`, `POST /rescore`                        | Score one file again now, or mark every file stale (set `rescoreAt = now()`), which the task then works through.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /projects/:id/link`, `POST /projects/:id/unlink`                | `{ "otherProjectId" }` merges two projects (same rule as the automatic merge). `{ "platform" }` splits a platform off into its own project again, moving the files found on that platform only.                                                                                                                                                                                                                                                                                                                        |
| `GET /mod-id-bans`, `POST /mod-id-bans`, `DELETE /mod-id-bans/:modId` | The mod-ID ban list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /files/:sha512/players/bulk`                                    | `{ "userIds": [...], "action": "ban" \| "hold" \| "penalty", "reason", "durationSeconds"?, "points"? }`. `ban` calls the existing Warden ban service for each player; `hold` sets the manual hold; `penalty` records a `bulkPenalty` event (1 to 50 points). Answers `{ "applied", "skipped": [{ "userId", "why" }] }`. At most 200 players per call.                                                                                                                                                                  |
| `GET /players?q=&band=&cursor=`                                       | Players with a trust row: profile, score, band, manual hold, last seen, sorted by score ascending.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /players/:userId`                                                | Score, band, the standing adjustment to file scores, manual hold, the event timeline (first page), the files of the latest report with score, effective score and action, the usage history sorted by fewest other users then most recent first seen, and the action history.                                                                                                                                                                                                                                          |
| `GET /players/:userId/events?cursor=`                                 | More of the timeline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST /players/:userId/score`                                         | `{ "score": 0-100, "reason" }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `POST /players/:userId/hold`                                          | `{ "hold": boolean, "reason" }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GET /settings`, `PATCH /settings`                                    | `{ mode, rulesVersion, rules }`. The patch validates `rules` with the shared schema.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GET /alerts?cursor=`, `POST /alerts/:id/dismiss`                     | Open alerts first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /summary`                                                        | `{ "review": n, "waiting": n, "alerts": n, "mode" }` for the nav badge and the Overview tile.                                                                                                                                                                                                                                                                                                                                                                                                                          |

Tests in `test/server/anticheat-admin.test.ts`: a project ban scores every version 0 and wins over an approved hash; clearing it restores computed scores; "reviewed" removes an accepted file from the queue and comes back when the band changes; the bulk ban skips already banned players; the registry groups versions and counts waiting players; a non-admin gets 403 (one route-level check is enough if the other suites do the same).

Commits: one per group (`files and decisions`, `players`, `settings and alerts`).

### Slice 7: admin UI, files

Read `docs/design.md` and open the mock (Files, proposition A) first. Mirror the Short links admin (`app/pages/admin/short-links/index.vue`, `app/components/admin/ShortLinks.vue`, `Form.vue`) for the table and drawer.

1. `useAnticheatAdmin.ts`: reads with `useFetch` and explicit keys, writes as plain `$fetch` functions that throw.
2. Nav in `app/layouts/admin.vue`: an "Anticheat" group inside `wardenItems` (icon `i-lucide-shield-check`) with Files, Review queue, Players, Settings. Show the `summary.alerts + summary.waiting` count as a badge on the group when above 0.
3. `/admin/anticheat` (`definePageMeta({ wardenAdmins: true })`): pill tabs Mods, Resource packs, Shaders with counts (the tab is the `kind` query parameter); a search field; filter chips for status (toggle chips with the second accent, like the push reminders); the table on one raised section with rows separated by dividers. Columns: file or project (name in semibold, small platform labels as neutral outline badges, a muted second line with the version count or filename), status pill, score, using now, ever used, waiting (warning color when above 0). "Approve a project" is the page's one solid button; "Ban a project" is neutral soft. Both open a small dialog that searches Modrinth and CurseForge through the existing mod search route.
4. The drawer (`USlideover` through `useOverlay`): the score large in the display font, name, band and path sentence, the waiting note (warning tint), the actions (Approve project solid, Approve this hash soft, Ban outline destructive, Score again and Add a note ghost, and "Reviewed, keep the score" soft when the file is in the queue), then Criteria, Identity, Players, History. A project row opens the same drawer in project mode: the decision, the metadata, and its versions as rows that open the file.
5. `Criteria.vue`: every criterion of the stored breakdown with a check, a dash or a cross icon (Lucide), its label and its points, then the arithmetic line (earned, scaled, penalties, final). For an override, one sentence instead. Labels come from i18n keys named after the criterion keys.
6. Players in the drawer: rows with avatar, name, first and last seen, sessions; a checkbox per row and the bulk bar pattern from `docs/design.md` ("Bulk actions on accounts") with Ban, Hold next join and Penalty, each through a confirm dialog that states how many players it applies to. Reuse `AdminBulkModal` if its props fit; otherwise add a small anticheat one that follows the same rules.
7. `/admin/anticheat/review`: the same table component with `sort=queue`, all kinds, status fixed to `review` and `refused`.
8. Status and score specimens on `/styleguide`. A `test/nuxt/anticheat.test.ts` that mounts the table with fixture rows and checks the status pills and the waiting count render.
9. Add an "Anticheat" section to `docs/design.md`: the mock link and the patterns used (table and drawer, criteria checklist, hash display, score as text).

Check both color modes in the browser at `/admin/anticheat` with seeded data (`scripts/anticheat-simulate.ts` from slice 9 can come forward if needed).

### Slice 8: admin UI, players and settings

1. `/admin/anticheat/players`: a table (avatar, name, score in the display font, band pill, manual hold badge, last seen); a row links to `/admin/warden/players/:userId#anticheat`.
2. `AdminAnticheatPlayerPanel` on `app/pages/admin/warden/players/[userId].vue`, as a section after the existing ones, following mock "One page": a raised band with the score, a neutral meter, the band sentence, the standing adjustment, and the actions (Clear the hold solid when a hold exists, Adjust score soft; the Ban button stays the page's existing one); then Timeline beside Files loaded now; then Every file used beside Actions taken. Timeline rows show the delta with a real minus sign, muted when it was recorded but not applied, with a "Not applied (observe)" hint. The panel does its own fetch on the client (`lazy: true`), so the page keeps its single blocking request.
3. `/admin/anticheat/settings`: the mode as three selectable cards (second accent when selected) with one line each; thresholds and points as number fields grouped by Files, Resource packs, Player, Lookups, in a `UForm` with the shared rules schema; the policy table as selects; "Save" is the solid button and says a new rules version will be created; "Score everything again" is neutral soft with a confirm; the mod-ID ban list as rows with a ghost remove.
4. Overview tile: add the review and alert counts to `app/components/admin/Overview.vue` for Warden admins, linking to the review queue.
5. Alerts: a list at the top of the review queue page, each with a ghost "Dismiss".
6. Tests in `test/nuxt/` for the panel (timeline rendering, not-applied hint).

### Slice 9: jobs, docs, simulation

1. `server/tasks/anticheat/rescore.ts` (nightly at 03:00: `scoring.rescoreStale` in batches until done or 5 minutes) and `prune.ts` (nightly: delete reports older than 12 months; delete usage rows with `lastSeenAt` older than 12 months unless the file or its project is banned; delete dismissed alerts older than 90 days; delete files with no usage, no decision and `lastSeenAt` older than 12 months). Flags `jobs.anticheatRescore` and `jobs.anticheatPrune`. Schedule both in `nuxt.config.ts`. Test the prune rules in `test/server/anticheat-prune.test.ts`.
2. Check `users:delete-inactive`: cascades already remove a deleted account's anticheat rows. Add a test that deleting a user removes its reports, usage, player row and events.
3. `scripts/anticheat-simulate.ts`: a Node script (run with `node --experimental-strip-types` or the repo's existing way to run TypeScript scripts, check first) that takes `--session <id>` and a JSON file of files, calls the reports route with `WARDEN_SERVER_SECRET` from `.env`, and prints the verdict. Document in `docs/anticheat.md` how to get a session locally (the forged-session trick in the Warden tests).
4. `docs/anticheat.md`: rules, flows, the full server contract with examples, the admin routes table, the data, the environment (none new), known limits copied from the design doc. Update `docs/architecture.md` (services, tasks, components, composables), `docs/warden.md` (the two new stream events), `docs/deployment.md` if it lists jobs, and the Status paragraph of `CLAUDE.md` with one sentence on the anticheat and its doc.
5. Final check of the whole branch: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`. Then ask the user whether to push and open a pull request.

## Not in this plan

- The NeoForge mod and the server plugin.
- Lookalike detection, publisher history, CurseForge moderation status.
- Anything shown to players on the site.
- Automatic bans decided by the site, and automatic bulk actions.
- Pinning approved builds of the LNB mod.
- Server-side behavior checks.

## Suggested model and effort

Claude Sonnet 5.5 at medium effort for slices 0 to 2 and 5 to 9. Use high effort for slices 3 and 4 (lookups, re-evaluation and the trust score), where concurrency and ordering mistakes are most likely.
