# Admin redesign

The admin (`/admin`) had 37 sidebar entries for a site admin, pages in an order nobody chose, and a Minecraft player's information spread over four places (Users, Warden players, Anticheat players, Economy accounts). This plan rebuilds the navigation around a few rooms, one page per person, one Settings area and one activity log for every area.

Approved mock (not code to port): [admin redesign mock](https://claude.ai/artifact/AYv9rt1UvwpUawUyShTYKJ), round 7. The visual rules are in the Admin section of `docs/design.md`. The activity log's table and actions are in `docs/activity-log.md`.

## How it is built

- One branch, `feat/admin-redesign`, from `main`. Five slices, in the order below. Each one works on its own and leaves nothing half-moved.
- No feature flag. The admin is internal and every old URL redirects, so a flag would mean keeping two navigations alive.
- Each slice is built by its own agent, which runs `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test`, and commits atomically with a DCO sign-off. Its diff is reviewed, and the admin is checked in a real browser for every role (forged sessions), in both color modes and at phone width, before the next slice starts.
- Each slice deletes the pages and components it replaces, adds the redirects for the URLs it moves, and updates the `docs/*.md` files that mention them. Nothing is left unused.
- Every new string is in `i18n/locales/en.json` and `fr.json`. Every new route gets its entry in `server/lib/openapi.ts`.
- Nothing is pushed until the owner says so.

## Roles

| Role                 | Sees                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site admin (`admin`) | Everything                                                                                                                                                |
| Warden admin         | Home, People (Minecraft tabs), the Minecraft group except Economy and Quests, Settings (Activity, Warden, Anticheat, Modpack, Playtime)                   |
| Events manager       | Home, People (read-only: Summary and Events, plus adding ghost accounts), Short links, the Events group, Settings (Activity, Rooms, Types, Notifications) |
| Economy admin        | Home, People (Summary and LNBits), Economy, Quests, Settings (Activity, Economy, Quests)                                                                  |

A person with several roles sees the union.

## Sidebar

From top to bottom:

1. **Home**, **People**, **Short links**, **Site**, outside any group.
2. The **Events** group: Events, Posters, Notifications, Partner events.
3. The **Minecraft** group: Moderation, Playtime, Anticheat, Modpack, Economy, Quests.
4. **Settings**, in the sidebar footer, above "Back to the site" and the signed-in user.

- Both groups fold. Each browser remembers which groups are folded (`localStorage`, wrapped in `try`). Both start open.
- Entries carry the same counts as the Home inbox, from one endpoint (`GET /api/admin/inbox`, see slice 3). A folded group shows the total of its entries. The anticheat badge in today's layout moves into that endpoint.
- Feature flags do what they do today in the admin: `modList` off hides the Vote part of Modpack. Every other entry stays while its feature is off, so it can be set up before it is switched on.

## Nesting

- One row of tabs per sidebar entry, and each tab is its own URL.
- A part inside a tab uses a small segmented switch (Modpack › Vote: Mods and Suggestions), also with its own URL.
- A single item (a person, an event, a shared account, a poster) gets its own page, with its own tabs.
- An entry with one part shows no tab row.
- The navbar shows where you are: `Moderation › Appeals`, `Events › LAN Smash Bros`. The group name is never in it.

## URLs

The group is never in the URL. Folding a group never changes one.

| Page           | URL                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home           | `/admin`                                                                                                                                                      |
| People         | `/admin/people`                                                                                                                                               |
| Person         | `/admin/people/:userId/:tab` (`summary`, `minecraft`, `moderation`, `playtime`, `anticheat`, `lnbits`, `events`, `account`)                                   |
| Short links    | `/admin/short-links`, `/admin/short-links/:id`                                                                                                                |
| Site           | `/admin/site/team`, `/admin/site/partners`, `/admin/site/gamesplanet`                                                                                         |
| Events         | `/admin/events`, `/admin/events/new`, `/admin/events/:id/:tab` (`details`, `registrations`, `teams`, `poster`)                                                |
| Posters        | `/admin/posters`, `/admin/posters/new`, `/admin/posters/:id`, `/admin/posters/:id/print`                                                                      |
| Notifications  | `/admin/notifications`                                                                                                                                        |
| Partner events | `/admin/partner-events`                                                                                                                                       |
| Moderation     | `/admin/moderation/appeals`, `/admin/moderation/bans`, `/admin/moderation/rules`                                                                              |
| Playtime       | `/admin/playtime/live`, `/admin/playtime/rules`, `/admin/playtime/closures`                                                                                   |
| Anticheat      | `/admin/anticheat/review`, `/admin/anticheat/files`                                                                                                           |
| Modpack        | `/admin/modpack/modlist`, `/admin/modpack/vote`, `/admin/modpack/vote/suggestions`, `/admin/modpack/files`, `/admin/modpack/downloads`                        |
| Economy        | `/admin/economy`, `/admin/economy/accounts`, `/admin/economy/accounts/:id`, `/admin/economy/ledger`                                                           |
| Market         | `/admin/economy/market`, `/admin/economy/market/catalog`, `/admin/economy/market/orders`, `/admin/economy/market/settings` (an item's drawer is `?item=<id>`) |
| Quests         | `/admin/quests/catalog`, `/admin/quests/community`, `/admin/quests/categories`                                                                                |
| Settings       | `/admin/settings/:section`                                                                                                                                    |

Settings sections: `activity`, `flags`, `rate-limit`, `api-keys`, `map`, `team`, `partners`, `gamesplanet` (site admins); `rooms`, `types`, `notifications` (events managers); `warden`, `anticheat`, `modpack`, `playtime` (Warden admins); `economy`, `quests` (economy admins). `/admin/settings` opens the first section the role may see.

### Redirects

Permanent (301), declared as `routeRules` in `nuxt.config.ts`, each tested.

| Old                                                       | New                               |
| --------------------------------------------------------- | --------------------------------- |
| `/admin/users`                                            | `/admin/people`                   |
| `/admin/warden`, `/admin/warden/players`                  | `/admin/people`                   |
| `/admin/warden/players/:userId`                           | `/admin/people/:userId/minecraft` |
| `/admin/warden/appeals`                                   | `/admin/moderation/appeals`       |
| `/admin/warden/activity`                                  | `/admin/settings/activity`        |
| `/admin/warden/playtime`                                  | `/admin/playtime/live`            |
| `/admin/warden/rules`                                     | `/admin/moderation/rules`         |
| `/admin/warden/settings`                                  | `/admin/settings/warden`          |
| `/admin/anticheat`                                        | `/admin/anticheat/files`          |
| `/admin/anticheat/players`                                | `/admin/people`                   |
| `/admin/anticheat/settings`                               | `/admin/settings/anticheat`       |
| `/admin/mods`                                             | `/admin/modpack/modlist`          |
| `/admin/mods/vote`                                        | `/admin/modpack/vote`             |
| `/admin/mods/suggestions`, `/admin/mods/vote/suggestions` | `/admin/modpack/vote/suggestions` |
| `/admin/mods/files`                                       | `/admin/modpack/files`            |
| `/admin/mods/downloads`                                   | `/admin/modpack/downloads`        |
| `/admin/mods/settings`                                    | `/admin/settings/modpack`         |
| `/admin/events/rooms`                                     | `/admin/settings/rooms`           |
| `/admin/events/types`                                     | `/admin/settings/types`           |
| `/admin/events/:id`                                       | `/admin/events/:id/details`       |
| `/admin/push`                                             | `/admin/notifications`            |
| `/admin/team`                                             | `/admin/site/team`                |
| `/admin/partners`                                         | `/admin/site/partners`            |
| `/admin/gamesplanet`                                      | `/admin/site/gamesplanet`         |
| `/admin/map`                                              | `/admin/settings/map`             |
| `/admin/flags`                                            | `/admin/settings/flags`           |
| `/admin/rate-limit`                                       | `/admin/settings/rate-limit`      |
| `/admin/api-keys`                                         | `/admin/settings/api-keys`        |
| `/admin/economy/quests`                                   | `/admin/quests/catalog`           |
| `/admin/economy/settings`                                 | `/admin/settings/economy`         |

Links the site sends out (push notifications, Minecraft server messages, emails) are checked for old admin URLs and updated in the same slice.

## Slice 1: shell, routes and Settings

- The new `app/layouts/admin.vue`: the sidebar above, groups that fold and remember it, the footer with Settings. Badges come in slice 3.
- Every page moves to its new URL, with its tabs and segmented switches, and the old pages go. The content of each page stays as it is, except where a tab row replaces sidebar entries.
- The Settings area: a section list on the left (a select at phone width), the section on the right, "Find a setting" filtering section names and field labels. Every settings form moves unchanged, including each feature's own settings card (Notifications, Team, Partners, Gamesplanet, Playtime mode, Quests). Warden's "Reset all sanctions" goes to Settings › Warden, still for site admins only.
- Settings › Activity showed the Warden activity view until slice 4 (built) replaced it with the one activity log.
- Every redirect in the table, each tested.
- Tests: which sidebar entries and Settings sections each role sees (Nuxt), the redirects.

## Slice 2: People and the Person page

- `GET /api/admin/people`: paged and filtered on the server. Search by name, email, Minecraft name or Minecraft UUID; quick filters (banned, flagged by the anticheat, over the playtime limit, ghost accounts, has a role); school. It returns only the columns the caller's role may see: Warden admins get Minecraft and anticheat data, economy admins get balances, events managers get name, school, avatar and event registrations. Events managers can search by email (to check before creating a ghost), but no email comes back to them.
- The People list replaces Users, Warden players and Anticheat players. The bulk actions of today's Users page (`AdminUsersBulkBar`, `AdminBulkModal`) stay, for site admins only. "Add a ghost account" stays for admins and events managers.
- The Person page, `/admin/people/:userId/:tab`. Each tab loads its own data when opened, from the routes that exist today. Only Summary gets a new endpoint (`GET /api/admin/people/:userId/summary`). A Minecraft name or UUID in the search opens the account that owns it.

| Tab          | Roles                | Content                                                             |
| ------------ | -------------------- | ------------------------------------------------------------------- |
| Summary      | everyone with People | "At a glance" rows linking to the other tabs, and the account facts |
| Minecraft    | admin, Warden        | linked accounts, devices, sessions, transfers, account limit        |
| Moderation   | admin, Warden        | bans, notes, warnings and appeals, in one timeline                  |
| Playtime     | admin, Warden        | today's playtime panel                                              |
| Anticheat    | admin, Warden        | today's anticheat panel and trust score                             |
| LNBits       | admin, economy       | the personal account, balance history, transactions                 |
| Events       | admin, events        | registrations, teams                                                |
| Site account | admin                | roles, site ban, sign out, delete                                   |

A ghost account only has Summary, Events and Site account.

- Header actions follow the person's state and the viewer's role (Warden actions for admins and Warden admins only):
  - Not banned: Add a note, Warn, Ban.
  - Banned: Add a note, Warn, Change the end, Lift the ban.
  - Ghost: Edit details, Register to an event (admins and events managers), Delete the ghost (admins).
  - Economy admins: Adjust balance. Events managers: Register to an event.
  - Destructive actions are outline buttons. The one solid crimson button, when there is one, is in the state callout (Answer the appeal, Review the file).
- "Warn" is the Warden note with `kind: 'warning'`: shown to the player on `/minecraft/account` and at their next login, can cite rules.
- "Change the end" is new: `PATCH /api/warden/admin/bans/:banId` sets a new end date (or none, for permanent), logged as `minecraft.ban.update`, and sent to the Minecraft server as an updated ban.
- "Kick now" is not built: the Minecraft server only knows the `banned` reason and the playtime kicks. It needs a mod change first (an admin kick event with its own reason), so it waits for the mod developers.
- The ⋯ menu: Copy the ID, See this person's activity (Settings › Activity filtered to them).
- Tests: the columns of `/api/admin/people` for each role (server), the Person tabs and actions for each role and state (Nuxt), the ban end change and its event.

## Slice 3: Home inbox and search

- `GET /api/admin/inbox`: the counts and short details of every queue the caller can act on, and nothing new:
  - ban appeals waiting (Warden);
  - anticheat files to review and alerts (Warden);
  - account takeovers to review (Warden);
  - mod suggestions waiting, and newer Modlist files found by the nightly check (Warden);
  - event waitlists (events managers);
  - today's Overview items: rate limit mode, inactive accounts, site bans, API keys about to expire (site admins).
- Home lists them as rows; an empty inbox says so and links to People.
- The sidebar badges read the same endpoint.
- Ctrl K (and a search button in the sidebar header) opens `UDashboardSearch` with three groups: People (from `/api/admin/people`, with the role's limits), pages and Settings sections (a fixed list in the app), and quick actions (Ban a player, New event, Adjust a balance, New short link). Each role sees only what it can open.
- Tests: the inbox for each role (server), the search groups for each role (Nuxt).

Built, with these choices the plan left open:

- The old Overview and `GET /api/admin/overview` are gone. The inbox gives each queue its count, its oldest date or first name, and the page that opens it. Events waitlists count upcoming, uncancelled events with someone on the waitlist (teams, for a tournament). The mod suggestions row only shows while the `modList` flag is on, like the Vote tab.
- Account takeovers have no page of their own: People gets a `transfer` quick filter (Warden admins), and the row opens it.
- Order of the rows: appeals, takeovers, anticheat, API keys about to expire, rate limit mode, event waitlists, suggestions, newer Modlist files, inactive accounts, site bans.
- Sidebar badges count work, not notices: Moderation (appeals), People (takeovers), Anticheat (files to review and alerts), Events (events with a waitlist) and Modpack (suggestions and newer files). Settings, inactive accounts and bans have none. The inbox loads on the client and refreshes on each navigation, no polling (the old anticheat badge didn't poll either). The anticheat's "waiting" files are no longer counted (only files to review and alerts, as the Overview did).
- Ctrl K: the pages of a role come from the same data as the sidebar and tab rows (`adminSearchPages`), the quick actions are `ADMIN_ACTIONS` in `app/utils/admin-nav.ts`. "Ban a player" opens People, and "New short link" opens the short links page with its create drawer (`?new`). People wait for two characters and a 250 ms pause.
- "See all activity" at the bottom of Home goes to Settings › Activity, for the roles that can open it.
- Home grew after the first build (2026-11-20, variant 1 + 2 + 3 of the Home mock): a "This week" strip at the top (`GET /api/admin/week`, a few counts per role from rows the site already keeps: new sign-ups, upcoming events, bans, appeals answered, event registrations, LNBits in circulation, quests completed, the reward index; site admins get the first four and others their own), the last six activity entries under the inbox, and the Ctrl K quick actions in a column beside it. "Players online now" was left out: it needs a presence count the admin doesn't read yet.

## Slice 4: one activity log

See `docs/activity-log.md` for the table, every action and who sees what. Built.
See `docs/activity-log.md` for the table, every action and who sees what.

- One migration: a new `audit` table, the rows of `warden_audit` and `admin_audit` copied in by date with fresh IDs and renamed actions, then both old tables dropped. IDs restart; nothing outside the site keeps an audit ID except the Minecraft server's last-seen event ID.
- `GET /api/warden/server/events`: a `Last-Event-ID` above the newest ID now means "start from the newest", so a server that kept an old ID doesn't miss events. Tested.
- One `auditService.record(tx, entry)` replaces `adminAuditService` and `wardenAuditService`.
- Every admin route that writes data, and every nightly job that changes data, records an action. A test lists the admin routes with a write method and fails when one records nothing.
- Every action has one sentence in English and French (`admin.activity.actions.<action>`). A test fails when one is missing. There is no generic fallback line.
- Settings › Activity: search by person or admin, area chips, a date range (30 days by default), 50 entries per page with "Load more", CSV export for site admins. Each role sees only its areas.
- The nightly `audit:prune` deletes entries older than 24 months.
- Deleting an account keeps its entries and empties who they were about (user IDs and Minecraft UUID). Bans, notes and warnings live in their own tables, so a person's record stays whole.
- Tests: the role filter, the prune, the account deletion, the copy migration on a sample.

## Slice 5: Economy accounts and shared accounts

- Economy › Accounts lists personal and shared accounts, with a type filter.
- A personal account opens the owner's Person page on the LNBits tab.
- A shared account opens `/admin/economy/accounts/:id`, with tabs Overview (balance, history), Members, Transactions, Licenses, and its actions (adjust, freeze, edit, licenses). It uses the economy admin routes that exist, and new ones where a tab needs them.
- The last commit of the branch rewrites the admin paragraph of `CLAUDE.md`.
- Tests: the accounts list filter, a shared account's members.

Built, with these choices the plan left open: the header holds Mint, Burn and Freeze; "edit" is the type, set in the Licenses tab; giving or taking back a license stays on the owner's LNBits tab (licenses belong to a person), which the shared account's Licenses tab links to. A personal account's old page URL goes to its owner's LNBits tab. See `docs/economy.md`.

## Not in this redesign

- Kicking a player by hand (needs the mod).
- New economy powers beyond what the tabs need.
- Any change to what a page does once it is open, beyond moving it.
