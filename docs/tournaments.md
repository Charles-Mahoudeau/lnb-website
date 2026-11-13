# Tournaments

A tournament is a normal event with an optional **team mode**. Players register to the event as usual, then form teams. Registration is all it does for now: brackets, scores, results, seeding and check-in are out of scope. Mocks: [tournament mocks](https://claude.ai/artifact/E3A6SSSDBLAqvq5tJXTEHi) (event page B, team panel A, admin A, form A). See `docs/events.md` for the rest of events and `docs/push.md` for notifications.

## The event

- The form's Teams section switches `team_mode` on and sets `team_min` and `team_max` (2 to 32). Team mode is **locked once anyone has registered**; the size stays editable, and teams are recomputed when it changes.
- In team mode **capacity counts validated teams**, not people. People never wait: `peopleCapacity()` (`server/services/events/shared.ts`) is `null` for them. The summary carries `teams: { min, max, registered, waitlist }`, and the agenda, the next-event card and the side panel show teams instead of people.
- Duplicating copies the team settings, not the teams. Cancelling cancels the teams and their invitations, read-only. Deleting still needs an event without registrations.
- The BDE push, the `.ics` file and posters don't change.
- Flag `events.teams` (a child of `events`) turns teams off: the list stays readable, player actions are refused. `events.registration` also pauses player team actions. Managers are never blocked by flags.

## Teams

- **One team per player.** Managers can bypass it: the player then counts for both teams.
- **Captain** (the creator) renames, invites, removes players, hands the role over, disbands, answers requests and switches "Accept requests". If the captain leaves, the player who joined first takes over. The last player out ends the team. A team can have no captain (made so by a manager, or after an account deletion); only managers fix that.
- **Name:** 3 to 30 characters, plain text, unique per event ignoring case and accents (`teamNameKey`).
- **A team is valid** with `team_min` to `team_max` players. A valid team takes a place if one is free, else it joins the waitlist of teams, ordered by `validated_at`. Dropping under the minimum loses the place and the position. A freed place goes to the first waiting team at once. A manager can **force** a team valid by hand; it stops being forced once valid by size.
- Every change locks the event row, then `eventTeamService.settle` (`server/services/events/teams.ts`) recomputes everything from the roster: empty teams go, a missing captain is replaced, teams that became valid take a place or wait, waiting teams move up. It's idempotent, and registrations, the admin and the event update call it too. The pure rules (`placeForNewTeam`, `teamsToPromote`, `isRosterLocked`, `invitesLeft`, `nextCaptain`) are in `team-rules.ts` and `shared/utils/event-teams.ts`.
- **The roster locks** when the registration window closes (at the start if it has no end). After that nobody can create a team, join, invite or ask; players can still leave, rename and disband until the start.

## Joining

- **Looking for a team.** Registered players in no team are listed on the event page, unless they hide themselves (`event_registration.looking_hidden`). There is no solo pool.
- **Invitations** go from the captain to a player, found by search (`GET /api/events/:id/team-players`): partial match on name or email, 3 characters at least, 8 results. Results show name, avatar, school and email, so they are for signed-in people, rate-limited (`team-search`, 30 per minute per account), and leave out people already in a team, other schools and banned accounts. A player usually has signed in, but a ghost account an events manager made for them (`docs/ghost-accounts.md`) shows in the search like anyone else, so a captain can invite someone who hasn't signed in yet. They see the invitation at their first sign-in.
- **Requests** go from a registered player to the captain, on teams that accept them and have room.
- Limits: a captain's pending invitations stay under the room left (`team_max` minus players), a player has at most 10 pending invitations per event and 3 pending requests. Accepting any invitation or request cancels the player's others. Nothing expires on its own: pending items end on joining, disbanding, the roster locking or the start.
- **Accepting an invitation registers an unregistered invitee**, school and window checked like any registration. Declined invitations and cancellations are silent; a declined request is answered by a notification.
- Both live in `event_team_invite`, told apart by `kind` (`invite`, `request`) and `status` (`pending`, `accepted`, `declined`, `cancelled`). Code: `server/services/events/team-invites.ts`.

## What people see

- Team names, states and player counts are public. **Player names, avatars and the looking list are for signed-in people**; visitors see counts and a sign-in hint.
- The team list is on the main column of the event page with players inline; the side column has the registration panel and a short "Looking for a team" list.

## Notifications

Push kind `team`, switched by the waitlist-places preference and the `push.spots` flag (`docs/push.md`). The text depends on `params.reason`: `invited`, `request` (to the captain), `accepted`, `declined`, `validated`, `waitlist`, `place`. Joins, leaves, kicks and manager changes send nothing. The capacity impact shown to managers counts the players of the waiting teams.

## Managers

The Teams tab of `/admin/events/<id>` (shown in team mode): tiles by state, every team with players, schools and emails, and the registered players without a team beside it.

- Create a team around a registered player (captain or not), rename, delete, validate by hand, change the captain, add and remove players.
- A manager can bypass the window, the start, the school, the maximum and the minimum, and put a player in two teams (the dialog warns and asks for a tick: `force`). A player still needs an account and a registration.
- Players are not notified of these changes, except by the usual places notifications when a team becomes valid.
- Each change is in `admin_audit` (`eventTeam.*`) and shows on the Overview. `registrations.csv` has a Team column (two teams are separated by a semicolon).

## API

Player routes are under `/api/events/:id` (`teams`, `looking`, `team-players`, `teams/:teamId/{invites,requests,leave,captain,members/:userId}`, `invites/:inviteId`); managers use `/api/admin/events/:id/teams`. They're all in `/api/docs`. Contracts: `shared/schemas/event-teams.ts`.

## Tests

`test/unit/event-teams-rules.test.ts` (rules), `test/server/event-teams*.test.ts` and `event-team-invites.test.ts` (services on PostgreSQL), `test/nuxt/event-teams.test.ts` and `admin-event-teams.test.ts` (components). Not covered by a test: the dialogs and their toasts, and the whole flow in a browser.
