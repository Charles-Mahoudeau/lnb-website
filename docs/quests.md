# Quests

Quests give players LNBits for what they do on the Minecraft server. The server (the `lnb-quests` mod, Kotlin for Forge) counts and reports; the site decides who gets what, prices every reward and pays it. This page is the contract between the two, and the rules behind the pages.

## Families

| Family       | Who wins                                                                      | When it pays                                                                    |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `individual` | Every player, once per tier. Tiers add up (10,000 includes 1,000).            | When the player claims, in the game or on `/minecraft/quests`.                  |
| `server`     | Everyone who gets an advancement, paid by rank: 1st, 2nd, 3rd, then the rest. | At once, when the site gives the rank. Ranks count across every server.         |
| `community`  | Every contributor above a threshold, for each tier of the goal reached.       | When the quest ends, from the `quests:community` task.                          |
| `flash`      | The first to reach a goal drawn at random. Started by the server.             | At once, when the server reports the winner. A race without a winner just ends. |
| `daily`      | Every player who reaches one of the day's quests before midnight (Paris).     | At once, when the server reports it. Once per quest, day and person.            |

A server quest can be **secret** (`hidden`): the page and the game show it as "???" until someone takes first place. The game also treats advancements it hides itself as secret.

Individual, server, flash and daily quests form the **catalogue** (`quest`, its definition as JSON checked by `questDefinition` in `shared/schemas/quests.ts`). Community quests have their own table.

## Categories

Individual and server quests are sorted in **categories** (`quest_category`, checked by `questCategory`): the chapters of the quest book for `individual`, the groups of the Records tab for `server`. A category has an `id` (unique within its family), a French and English `name`, an item `icon` for the game, an optional Lucide `siteIcon` for the site, a `sortOrder`, and `subcategories` (`id` and `name`), shown as headings inside it in their order.

An individual quest names its `category` (required) and may name a `subcategory`; a server quest may name both, and without a category the game places it from its advancement (vanilla by dimension, mods by mod). The site refuses a quest that names a category or subcategory it doesn't know (400, `unknownCategory`), a category deletion while a quest uses it, and a change that drops a subcategory a quest uses (`categoryInUse`, 409). `quests.json` can list `categories` next to `quests`: the server sends them with its catalogue at start and the site adds the ones it doesn't know, like quests. The migration created the six chapters and the Records groups the game used to hard-code.

## Daily quests

Each Paris day, `daily.count` quests (3; 0 turns them off) are drawn from the enabled daily quests, by `weight`, without repeats, each with a quantity in its `range`. The draw is made the first time the day is asked for (`GET /config`, the quests page), stored in `quest_daily_draw`, and stays the same for everyone all day, even if the catalogue changes. A daily quest uses the flash objectives (kill, mine, fish, craft, travel). The server counts each player's progress on today's quests from midnight, and reports a player who reaches the quantity; the site pays `rewardPerUnit × quantity` through the formula at once, once per quest, day and LNB account (`quest_daily_completion`).

## Rewards

Rewards follow the economy spec (`lnb-economy`, "Spécification Technique — Économie Serveur"), so they keep up with the economy without feeding inflation:

- Every night at 04:00 (`quests:index`), the **index** I is computed from the personal balances of active players: seen in the last 48 hours, with at least an hour of play, without the `admin` or `economy-admin` role. I = 0.75 × median + 0.25 × Q3 (+ 0 × mean). With fewer than 5 active players, or a median of 0, the reference index I0 (1000) is used. Each day is kept in `quest_index_day`.
- **Kglobal** = (I / I0)^0.25, kept between 0.8 and 2: the richer the server, the more quests pay, slowly.
- **Kplayer** = 1 + 0.5 × (1 − balance / I) for a player below I, 1 above: a catch-up bonus of up to +50 %.
- A reward is round(Rbase × Kglobal × Kplayer), with Rbase the quest's base reward. Kplayer uses the player's personal balance when the reward is recorded: the tier reached, the rank given, the race won or the community quest paid. Claiming later doesn't change the amount.
- **Cap.** Over 30 rolling days, quests pay at most 5 % of the money in circulation, split between families (individual 40, server 30, community 20, flash 10, daily 10; shares are relative, so these add up to 110). A reward past its family's budget is cut to what's left, possibly 0, and the answer says `capped`. Unclaimed tiers count from when they were reached.
- Money is created with one `mint` per reward, reason `questReward`, on the player's personal account, with the quest's French name as the memo. Items go to the economy mailbox (reason `questReward`) and are collected in the game.

Every number above is a setting (`quest_settings`, Settings › Quests, `/admin/settings/quests`).

## Reset

There are no seasons: quests run until an admin resets them. **Reset the quests** (Settings › Quests, `POST /api/quests/admin/reset`, typing `reset the quests`) deletes what players did: completions and ranks, progress, flash runs, daily completions and community quests (with their contributions). The catalogue, categories, settings, daily draws, community templates and the reward index stay, and so do LNBits already paid, so players can earn them again. It is for the economy admin and site admins, and goes to the admin log as `economy.quests.reset` with the rows deleted per table. Use it after testing in production, or to start over.

The site stores the date of the last reset (`quest_settings.reset_at`) and sends it as `resetAt` in `GET /config`; the Minecraft server starts every player over when that date changes.

## Minecraft server routes

Under `/api/quests/server`, with `Authorization: Bearer <WARDEN_SERVER_SECRET>`, behind `economy.serverApi` and `economy.quests` (`disabled`, 503). `player` is always a Minecraft UUID. Paying calls carry an `idempotencyKey`: the same key gives back the first answer with `replayed: true`, and the same key on another request is `idempotencyMismatch` (409).

| Route                               | What it does                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /config`                       | `resetAt` (when an admin last reset the quests, or null), every enabled quest, the categories in order, today's daily draw (`daily`: `{ day, endsAt, quests: [{ quest, quantity }] }`), the flash and anti-cheat settings, the running community quest, today's index and `pollSeconds` (300). The server polls it, and again just after midnight.  |
| `POST /catalog`                     | `{ categories, quests }` from the server's `config/lnbquests/quests.json`, at start. Adds the categories and quest IDs the site doesn't know and never changes an existing one: edits on the site win. Answers `{ added, kept, categoriesAdded }`; a malformed quest is a 400 naming its index, a new quest in an unknown category a 400 naming it. |
| `POST /progress`                    | `{ items: [{ player, quest, value }] }`, the absolute counters, for the site's progress bars. 204. Unknown quests and players are skipped.                                                                                                                                                                                                          |
| `POST /completions`                 | `{ idempotencyKey, player, quest, tier }`: a tier reached. The amount is frozen and waits for a claim. 201 `{ completionId, replayed, quest, tier, amount, capped, claimable }`. Problems: `notLinked`, `unknownQuest` (404), `notEligible` (403), `tierLocked`, `alreadyCompleted` (409).                                                          |
| `POST /completions/:id/claim`       | `{ idempotencyKey, player }`: pays a tier. `{ transactionId, replayed, amount, to, mailboxItems }`. Problems: `notFound` (404, also someone else's), `alreadyClaimed`, `frozen` (409).                                                                                                                                                              |
| `GET /players/:uuid`                | The player's tiers, the podiums of server quests, their ranks, their Kplayer, their part in the running community quest and today's daily quests they finished (`daily`, with any account).                                                                                                                                                         |
| `POST /advancements`                | `{ idempotencyKey, player, quest }`: a server quest's advancement was granted. The next rank, paid at once. 201 with `rank`, `amount`, `podium`. `alreadyRanked` (409) when the person already has a rank there, with any Minecraft account.                                                                                                        |
| `POST /flash`                       | `{ idempotencyKey, quest, quantity, startedAt, endedAt, winner }`: a race ended. Stored; the winner, if any, is paid `rewardPerUnit × quantity` through the formula.                                                                                                                                                                                |
| `POST /daily`                       | `{ idempotencyKey, player, day, quest }`: a player reached one of `day`'s daily quests. Paid at once: 201 `{ replayed, completionId, quantity, amount, capped, transactionId, to }`. `day` must be today or yesterday (`expired`, 409) and the quest drawn that day (`notDrawn`, 404); `alreadyCompleted` (409) once the person was paid for it.    |
| `POST /community/:id/contributions` | `{ idempotencyKey, items: [{ player, amount }] }`: what players brought since the last call. `{ replayed, progress, goal }`. `communityClosed` (409) once the quest ended or was cancelled: the server drops what it held.                                                                                                                          |

`GET /events` is a Server-Sent Events stream, like `GET /api/economy/server/events` (`docs/economy.md`, topic `quests`): `config` when a quest, the settings, the reset date or the community quest changed on the site (an admin, or the community job starting or paying one), so the mod reads `/config` again at once; `player` `{ uuids }` when players claimed a reward on the site, so their quest screen and badge follow.

## Player routes

Behind `economy.quests`.

- `GET /api/quests`, public: the catalogue with today's amounts, the categories, today's daily quests with how many finished each, podiums, the community quest and past ones, the flash history, the leaderboard and the last 30 days of the index. Signed in with a linked Minecraft account, also `me`: progress, tiers, ranks, Kplayer, community contribution and today's daily quests done.
- `POST /api/quests/completions/:id/claim`, signed in: claims one of the caller's tiers, like the game does.

## Admin routes

Under `/api/quests/admin`, for `admin` and `economy-admin`, never behind a flag. Every change is written to `audit` (`economy.quests.*`).

| Route                                                                   | What it does                                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /quests`, `POST`, `PATCH /quests/:id`, `DELETE`                    | The catalogue. A quest someone completed or raced can't be deleted, only turned off (`questInUse`).                     |
| `GET /export`, `POST /import`                                           | The catalogue as `quests.json`, categories included; import adds new IDs and, with `overwrite`, replaces existing ones. |
| `GET /categories`, `POST`, `PATCH /categories/:family/:id`, `DELETE`    | Categories. One a quest uses can't be deleted, nor lose a subcategory a quest uses (`categoryInUse`).                   |
| `GET /settings`, `PATCH /settings`                                      | Formula, active players, cap, flash, daily count, anti-cheat, rotation, polling.                                        |
| `GET /reward-index?days=60`                                             | Index history, today's preview with the current settings, and the cap used per family.                                  |
| `GET /community`, `POST`, `GET`/`PATCH /community/:id`, `POST …/cancel` | Community quests and their contributors.                                                                                |
| `POST /community/templates`                                             | Adds or changes a template the weekly rotation can draw.                                                                |
| `POST /reset`                                                           | `{ confirmation: "reset the quests" }` deletes what players did and changes `resetAt`. 204.                             |

## Community quests

One runs at a time. `quests:community` (every 5 minutes) starts a planned one once its time comes and nothing else runs, and pays the ones that ended: for each tier reached, every contributor with at least `thresholdPercent` of the goal gets the tier's reward through the formula, the top contributor `topBonusPercent` more, in one mint each. With the rotation on, when nothing is planned, a quest is drawn from the active templates for the next Monday 00:00 (Paris), for `days` (7) days.

## Pages

- `/minecraft/quests` (Minecraft menu): the player's summary, then pill tabs for personal tiers (by category and subcategory), today's daily quests, server podiums (by category), the community quest, flash races and the leaderboard with how rewards are computed.
- The home page shows the running community quest as a band under the hero.
- `/admin/quests/catalog`, `/admin/quests/community`, `/admin/quests/categories` and `/admin/quests/reward-index`: Catalogue (table, editor drawer, JSON import and export), Community, Categories and Reward index. Settings (with a live preview and the reset) are in Settings › Quests (`/admin/settings/quests`).
