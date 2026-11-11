# Partner events

Pages for events that another organization runs, where LNB only helps its students find the event, say they are interested and form teams. They are not events (`docs/events.md`): no date, no capacity, no registration window. The first one is **Arena League University 2027**, at `/special/arena-league-university-2027`: an inter-school esports league run by Arena League, from January to May 2027 (the date is not fixed). Mocks: [Arena League mocks](https://claude.ai/artifact/XvHUjSdFhA2ZQ6bdkY5KHM) ("Art cards"). The design is in `docs/design.md` (Partner event page).

Status: slices 1 (the page, the games and interest) and 2 (teams) are built. The admin, notifications and the home card follow, in that order.

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

## Teams

- Only confirmed games take teams. Tables: `partner_event_team` (name and `abbreviation`, both unique per game; the name ignores case and accents), `partner_event_team_member` (one team per student and game, `role` starter or substitute, `birth_date`) and `partner_event_team_invite` (invitation or request, one pending row per team and student).
- A student needs interest in the game (that is where the consent is given) to create a team, ask or accept. Withdrawing interest in a game also leaves its team and cancels the pending items.
- Names are 3 to 30 characters, abbreviations 2 to 5 letters or digits, kept in capitals. The date of birth is asked when creating a team, asking to join (kept on the request) or accepting an invitation.
- Roles: the captain is always a starter. A joiner is a starter while a starter place is free, then a substitute, and refused once both are full. The captain moves players between the two roles, hands over captaincy (the new captain becomes a starter, the old one steps down if the starters are full), or removes a player. When the captain leaves, the member who joined first takes over as starter, and the last one out ends the team. Nobody is promoted on their own. A team is "complete" once its starters are filled: it is informational, there is no capacity and no waitlist.
- Students are found in the looking-for-a-team list: those with interest in the game, in no team, not hidden and not banned. There is no free-text search, so the list is the only way to invite. A team can have at most its free places in pending invitations, a student at most 10 invitations and 3 requests per game.
- The page's Teams section has a tab per confirmed game, the invitations the student received, the teams with their actions, the looking list, and one dialog for creating, editing and giving a date of birth. Visitors only see counts.
- Notifications for invitations and requests come with the push slice.
- Code: `server/services/partner-teams.ts` (copied from the tournament teams rather than shared, since those hang on event registrations; it reuses `nextCaptain` and the name rules), pure rules in `shared/utils/partner-teams.ts`, routes under `server/api/partner-events/[slug]/games/[game]/`.

## Admin

`/admin/partner-events` (events managers, `app/components/admin/PartnerEvents.vue`) has a list on the left, "Event and export" then one entry per game, and the selected panel on the right.

- Event panel: date wording in both languages, the organizer's links, the switches (date confirmed, interest open, teams open), the hero image, the `.xlsx` export, and Close event.
- Game panel: status, starters and substitutes (refused with `gameHasTeams` or `placesInUse` when teams exist or would not fit), card art, the referent the organizer's spreadsheet asks for (the Manager sheet), the teams with a per-team referent override and Disband, and the interest list with search.
- Export (`GET /api/admin/partner-events/:slug/export`): sheets `Manager` (one row per team), `Joueur` (one per player, with role Capitaine, Joueur or Remplaçant) and `Intérêt`, mirroring the organizer's template. Each export is logged.
- Close event makes the page read-only. `server/tasks/partner-events/purge.ts` (nightly, flag `jobs.purgePartnerEvents`) deletes interest, teams, invitations and dates of birth 60 days later. Reopening before then cancels it. Accounts are untouched.
- Every change is in the admin log (`partnerEvent.*`). Code: `server/services/partner-events-admin.ts`, `server/services/partner-events-export.ts`, routes under `server/api/admin/partner-events/`.

## Flags

`partnerEvents` turns the pages and their API off, `partnerEvents.interest` pauses saving interest (withdrawing stays possible), `partnerEvents.teams` pauses creating teams, inviting, asking and accepting (leaving stays possible). See `docs/feature-flags.md`.

## API

`GET /api/partner-events/:slug` (public, with `mine` for signed-in students), `PUT /api/partner-events/:slug/interest` (replaces the student's whole set of games), and under `/games/:game`: `GET` (teams and looking list), `POST /teams`, `PATCH` and `DELETE /teams/:teamId`, `POST /teams/:teamId/leave`, `PATCH` and `DELETE /teams/:teamId/members/:userId`, `POST /teams/:teamId/invites` and `/requests`, and `POST` and `DELETE /invites/:inviteId`. All are in `/api/docs`. Code: `server/services/partner-events.ts`, contracts in `shared/schemas/partner-events.ts`.

## Tests

`test/unit/partner-events.test.ts` (contracts and messages), `test/server/partner-events.test.ts` and `test/server/partner-teams.test.ts` and `test/server/partner-events-admin.test.ts` (the services on PostgreSQL) and the partner event case in `test/server/poster-images.test.ts` (pruning). Not covered: the pages in a browser (public and admin), the team dialogs and the signed-in flow end to end.

## Still to do

The `partner-event` push kind with its opt-in and the Announce button. A card on the home page and a line in the events listing while the event is open. The organizer's agreement before using their hero image.
