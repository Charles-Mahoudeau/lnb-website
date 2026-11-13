# Quests

Quests give players LNBits for what they do on the Minecraft server. The server (the `lnb-quests` mod, Kotlin for Forge) counts and reports; the site decides who gets what, prices every reward and pays it. This page is the contract between the two, and the rules behind the pages.

## Families

| Family       | Who wins                                                                      | When it pays                                                                    |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `individual` | Every player, once per tier and season. Tiers add up (10,000 includes 1,000). | When the player claims, in the game or on `/minecraft/quests`.                  |
| `server`     | Everyone who gets an advancement, paid by rank: 1st, 2nd, 3rd, then the rest. | At once, when the site gives the rank. Ranks count across every server.         |
| `community`  | Every contributor above a threshold, for each tier of the goal reached.       | When the quest ends, from the `quests:community` task.                          |
| `flash`      | The first to reach a goal drawn at random. Started by the server.             | At once, when the server reports the winner. A race without a winner just ends. |

Individual, server and flash quests form the **catalogue** (`quest`, its definition as JSON checked by `questDefinition` in `shared/schemas/quests.ts`). Community quests have their own table.

## Rewards

Rewards follow the economy spec (`lnb-economy`, "Spécification Technique — Économie Serveur"), so they keep up with the economy without feeding inflation:

- Every night at 04:00 (`quests:index`), the **index** I is computed from the personal balances of active players: seen in the last 48 hours, with at least an hour of play, without the `admin` or `economy-admin` role. I = 0.75 × median + 0.25 × Q3 (+ 0 × mean). With fewer than 5 active players, or a median of 0, the reference index I0 (1000) is used. Each day is kept in `quest_index_day`.
- **Kglobal** = (I / I0)^0.25, kept between 0.8 and 2: the richer the server, the more quests pay, slowly.
- **Kplayer** = 1 + 0.5 × (1 − balance / I) for a player below I, 1 above: a catch-up bonus of up to +50 %.
- A reward is round(Rbase × Kglobal × Kplayer), with Rbase the quest's base reward. Kplayer uses the player's personal balance when the reward is recorded: the tier reached, the rank given, the race won or the community quest paid. Claiming later doesn't change the amount.
- **Cap.** Over 30 rolling days, quests pay at most 5 % of the money in circulation, split between families (individual 40, server 30, community 20, flash 10). A reward past its family's budget is cut to what's left, possibly 0, and the answer says `capped`. Unclaimed tiers count from when they were reached.
- Money is created with one `mint` per reward, reason `questReward`, on the player's personal account, with the quest's French name as the memo. Items go to the economy mailbox (reason `questReward`) and are collected in the game.

Every number above is a setting (`quest_settings`, `/admin/economy/quests`, Settings tab).

## Seasons

Everything belongs to a season (`quest_season`). An admin starts a new one by typing `new season`. The server sees the new number in `GET /config` and starts every player over: its counters, and the advancements of the catalogue's server quests, taken back from players online now and from the others at their next login. LNBits already paid stay. The quests page can show past seasons.

## Minecraft server routes

Under `/api/quests/server`, with `Authorization: Bearer <WARDEN_SERVER_SECRET>`, behind `economy.serverApi` and `economy.quests` (`disabled`, 503). `player` is always a Minecraft UUID. Paying calls carry an `idempotencyKey`: the same key gives back the first answer with `replayed: true`, and the same key on another request is `idempotencyMismatch` (409).

| Route                               | What it does                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /config`                       | The season, every enabled quest, the flash and anti-cheat settings, the running community quest, today's index and `pollSeconds` (300). The server polls it.                                                                                                                               |
| `POST /catalog`                     | `{ quests }` from the server's `config/lnbquests/quests.json`, at start. Adds the IDs the site doesn't know and never changes an existing one: edits on the site win. Answers `{ added, kept }`; a malformed quest is a 400 naming its index.                                              |
| `POST /progress`                    | `{ items: [{ player, quest, value }] }`, the absolute counters of the season, for the site's progress bars. 204. Unknown quests and players are skipped.                                                                                                                                   |
| `POST /completions`                 | `{ idempotencyKey, player, quest, tier }`: a tier reached. The amount is frozen and waits for a claim. 201 `{ completionId, replayed, quest, tier, amount, capped, claimable }`. Problems: `notLinked`, `unknownQuest` (404), `notEligible` (403), `tierLocked`, `alreadyCompleted` (409). |
| `POST /completions/:id/claim`       | `{ idempotencyKey, player }`: pays a tier. `{ transactionId, replayed, amount, to, mailboxItems }`. Problems: `notFound` (404, also someone else's), `alreadyClaimed`, `frozen` (409).                                                                                                     |
| `GET /players/:uuid`                | The player's tiers this season, the podiums of server quests, their ranks, their Kplayer and their part in the running community quest.                                                                                                                                                    |
| `POST /advancements`                | `{ idempotencyKey, player, quest }`: a server quest's advancement was granted. The next rank, paid at once. 201 with `rank`, `amount`, `podium`. `alreadyRanked` (409) when the person already has a rank there, with any Minecraft account.                                               |
| `POST /flash`                       | `{ idempotencyKey, quest, quantity, startedAt, endedAt, winner }`: a race ended. Stored; the winner, if any, is paid `rewardPerUnit × quantity` through the formula.                                                                                                                       |
| `POST /community/:id/contributions` | `{ idempotencyKey, items: [{ player, amount }] }`: what players brought since the last call. `{ replayed, progress, goal }`. `communityClosed` (409) once the quest ended or was cancelled: the server drops what it held.                                                                 |

## Player routes

Behind `economy.quests`.

- `GET /api/quests?season=<n>`, public: the catalogue with today's amounts, podiums, the community quest and past ones, the flash history, the leaderboard and the last 30 days of the index. Signed in with a linked Minecraft account, also `me`: progress, tiers, ranks, Kplayer and community contribution.
- `POST /api/quests/completions/:id/claim`, signed in: claims one of the caller's tiers, like the game does.

## Admin routes

Under `/api/quests/admin`, for `admin` and `economy-admin`, never behind a flag. Every change is written to `admin_audit` (`quests.*`).

| Route                                                                   | What it does                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /quests`, `POST`, `PATCH /quests/:id`, `DELETE`                    | The catalogue. A quest someone completed or raced can't be deleted, only turned off (`questInUse`). |
| `GET /export`, `POST /import`                                           | The catalogue as `quests.json`; import adds new IDs and, with `overwrite`, replaces existing ones.  |
| `GET /settings`, `PATCH /settings`                                      | Formula, active players, cap, flash, anti-cheat, rotation, polling.                                 |
| `GET /reward-index?days=60`                                             | Index history, today's preview with the current settings, and the cap used per family.              |
| `GET /community`, `POST`, `GET`/`PATCH /community/:id`, `POST …/cancel` | Community quests and their contributors.                                                            |
| `POST /community/templates`                                             | Adds or changes a template the weekly rotation can draw.                                            |
| `GET /seasons`, `POST /seasons`                                         | Seasons; `{ confirmation: "new season" }` closes the current one and opens the next.                |

## Community quests

One runs at a time. `quests:community` (every 5 minutes) starts a planned one once its time comes and nothing else runs, and pays the ones that ended: for each tier reached, every contributor with at least `thresholdPercent` of the goal gets the tier's reward through the formula, the top contributor `topBonusPercent` more, in one mint each. With the rotation on, when nothing is planned, a quest is drawn from the active templates for the next Monday 00:00 (Paris), for `days` (7) days.

## Pages

- `/minecraft/quests` (Minecraft menu): the player's season, then pill tabs for personal tiers, server podiums, the community quest, flash races and the leaderboard with how rewards are computed.
- The home page shows the running community quest as a band under the hero.
- `/admin/economy/quests`: Catalogue (table, editor drawer, JSON import and export), Community, Settings (with a live preview and seasons) and Reward index.
