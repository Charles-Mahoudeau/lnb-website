# Partner events

Pages for events that another organization runs, where LNB only helps its students find the event, say they are interested and form teams. They are not events (`docs/events.md`): no date, no capacity, no registration window. The first one is **Arena League University 2027**, at `/special/arena-league-university-2027`: an inter-school esports league run by Arena League, from January to May 2027 (the date is not fixed). Mocks: [Arena League mocks](https://claude.ai/artifact/XvHUjSdFhA2ZQ6bdkY5KHM) ("Art cards"). The design is in `docs/design.md` (Partner event page).

Status: slice 1 (the page, the games and interest) is built. Teams, the admin, notifications and the home card follow, in that order.

## Page and URL

- Each partner event is one page file under `/special/` (`app/pages/special/<slug>.vue`) that reads its data by slug. A top-level `[slug]` page is avoided: it would swallow every future route.
- Tables, services and components are generic (`partner_event`). The texts (description, notice, game names) are in i18n, English and French, and live under `partnerEvents.<slug>`.
- The organizer's website (`https://arenaleague.tv`) and Discord (`https://discord.gg/wjv9NN7DGg`) are columns of the event, shown as plain links in the hero.
- The hero art (`hero_key`) and each game's card art (`art_key`) are files in the `event-images` storage, served from `/api/media/<key>`, and `eventImageService.prune` counts them as used. Without them the page shows the tinted fallback. There is no upload yet: it comes with the admin. The organizer's panoramic visual (1179 × 302, `arenaleague.tv/promo/alu/visuel-esport-panoramique.webp`) is the planned hero. It is small for a full-width banner and carries the organizer's logo, so we should have their agreement before using it.
- Visitors see the description and the counts per game. Names, avatars and lists are for signed-in students.

## Games

- `partner_event_game`: a `key` (`lol`, `valorant`, `rocket-league`, `cs2`), a `status` (`confirmed` or `study`), a number of `starters` (5, 5, 3, 5), a maximum number of `substitutes` (2) and a position.
- LoL and VALORANT are confirmed. Rocket League (3v3) and CS2 (5v5) are under study by the organizer: they take interest only, with no teams, until an admin confirms them.

## Interest

- `partner_event_interest`: one row per student and game, with an in-game name and a rank (free text, 40 characters, both optional), `hidden` (leave the looking-for-a-team list), `consented_at` and the usual timestamps. Unique on `(game, user)`.
- A student can be interested in several games. Saving takes one consent for what the organizer receives: name, school email, game, in-game name and rank (and the date of birth once a team is involved). Withdrawing deletes the rows.
- Sign-in with a school account is required, and `interest_open` on the event can pause it.
- Counts per game are public.

## Flags

`partnerEvents` turns the pages and their API off, `partnerEvents.interest` pauses saving interest (withdrawing stays possible). See `docs/feature-flags.md`.

## API

`GET /api/partner-events/:slug` (public, with `mine` for signed-in students) and `PUT /api/partner-events/:slug/interest` (replaces the student's whole set of games). Both are in `/api/docs`. Code: `server/services/partner-events.ts`, contracts in `shared/schemas/partner-events.ts`.

## Tests

`test/unit/partner-events.test.ts` (contracts and messages), `test/server/partner-events.test.ts` (the service on PostgreSQL) and the partner event case in `test/server/poster-images.test.ts` (pruning). Not covered: the page in a browser and the signed-in flow end to end.

## Still to do

Teams with captain, starters and substitutes, invitations and requests. The admin (settings, referent, lists, `.xlsx` export mirroring the organizer's template with `Manager` and `Joueur` sheets, close event and the 60-day purge). The `partner-event` push kind with its opt-in and the Announce button. A card on the home page and a line in the events listing while the event is open. Per-game artwork picked in the admin.
