# Quests: seasons removed, to-do for the mod (lnb-quests)

Contract for the mod developers. **The site side is built and matches this document.** The site no longer has seasons. Quests run until an admin resets them, and the mod learns about a reset from one new field in `GET /api/quests/server/config`. The routes and bodies are in `docs/quests.md` and in the OpenAPI reference at `/api/docs` (tag "Quests: server").

The change is **breaking**: the `season` object is gone from the config. A mod that still reads `config.season.number` fails on the first poll after the site is deployed.

## What changed on the site

- The `season` object (`{ id, number, startedAt }`) is **removed** from `GET /config`.
- A new field takes its place: `resetAt`, an ISO 8601 UTC date (`"2026-11-18T10:30:00.000Z"`), or `null` when the quests were never reset.
- No request or response carries a season any more. `POST /progress`, `/completions`, `/advancements`, `/flash`, `/daily` and `GET /players/:uuid` are unchanged, apart from the removed word "season" in their descriptions. Everything a player did counts without an end date.
- Past seasons are gone: the migration deleted everything that wasn't in the season running at deploy time.
- An admin can now **reset the quests** whenever they want (after a test in production, or to start over). Before, a new season did the same thing and the mod noticed the new number.

## What a reset does on the site

When an admin types `reset the quests`, the site deletes:

- every completion and rank (tiers and server quest podiums);
- every progress counter;
- every flash run, every daily completion and every community quest, with its contributions.

It keeps the catalogue, the categories, the settings, the daily draws, the community quest templates and the reward index. **LNBits already paid stay**, so players can earn them again.

Then it sets `resetAt` to the current time and sends a `config` event on `GET /events`, so the mod reads `/config` again at once.

## What the mod has to do

Keep the last `resetAt` it handled, in its own storage (a file next to `config/lnbquests/`), and compare it with every `GET /config` answer.

1. **First run, nothing stored.** Store the value from the config and do nothing else. This is the deploy case: the site may already have a `resetAt` from an earlier reset, and the players' state in the mod is already in line with it. Resetting here would wipe everyone by mistake.
2. **Same value as stored.** Nothing to do.
3. **A different value** (a later date, or a date where it was null before). Start every player over:
   - clear every player's **local counters** for individual quests (mined, killed, crafted, travelled and so on), and the flash and daily counters if the mod keeps any;
   - **take back the advancements** of the catalogue's server quests, from the players online now and, for the others, at their next login (the same job a new season used to start);
   - drop what the mod holds for the community quest that no longer exists (`communityClosed` handling already covers contributions the site refuses);
   - forget the claimed tiers the mod caches, and refresh each online player's quest screen and badge with `GET /players/:uuid`;
   - only after all of that, store the new `resetAt`.

Two details that matter:

- **Counters must go back to zero in the mod.** `POST /progress` sends absolute values and the site keeps the larger one. If the mod keeps its old counters, its next push puts the old progress back on the site's progress bars, and its tier checks would pay the same tiers again.
- **Store `resetAt` last, and make the job safe to run twice.** If the server stops in the middle, it runs again at the next start: the stored value is still the old one. Taking back an advancement a player no longer has is harmless.

For players who are offline, keep a list of the UUIDs still to clean (or compare their per-player stored `resetAt` at login: if it differs from the current one, clean them then). The second way survives a second reset happening before the player ever comes back.

## While the mod doesn't handle `resetAt` yet

An admin reset deletes the site's data but not the game's. Until the mod is updated:

- players keep their local counters and advancements;
- the next `POST /progress` brings the old progress back to the site;
- a tier whose threshold is already passed is reported again, and the site pays it again, because the completion was deleted. That is what a reset allows, but on the server's side it happens without anything starting over.

So **don't reset the quests in production before the mod handles `resetAt`**, apart from a test you accept the effects of.

## Checklist

- [ ] Stop reading `config.season`. Nothing else in the config changed.
- [ ] Read `config.resetAt` (a string or `null`) and keep the last handled value.
- [ ] First run: store it without resetting.
- [ ] On a change: zero the local counters, take back server quest advancements (online now, others at login), refresh quest screens, then store the new value.
- [ ] Test: complete a tier, claim it, reset from `/admin/economy/quests` (Settings tab), and check that the player starts over in the game and on `/minecraft/quests`.
