# People

`/admin/people` lists everyone, for the four admin roles (site admins, Warden admins, events managers, economy admins). A row opens the Person page, `/admin/people/:userId/:tab`. It replaces the Users list, the Warden players list and the Anticheat players list (the plan is in `docs/plans/admin-redesign.md`).

## The list

`GET /api/admin/people` (`server/services/people/`), 50 per page by name, with a keyset cursor. It filters, searches and counts on the server, and loads each column with one query for the whole page (no per-row queries).

- Search: name for everyone. Email for Warden admins, events managers and site admins. Minecraft name or UUID for Warden admins, economy admins and site admins. When the search is exactly a Minecraft name or UUID, `match` carries the owning account and the page offers to open it.
- Quick filters, all of which must match, in `filters=banned,flagged`: `banned` (a Warden ban in force, or a site ban for site admins), `flagged` (the anticheat holds the player, or they use a file that needs a look: review, refused or banned), `overLimit` (past the playtime allowance this week), `ghost`, `hasRole`, and `inactive` (no sign-in for 24 months, site admins). Plus `tenantId` for the school, and `role` for site admins (Feed announcers among the choices). A filter the role can't use is refused with 403 `notAllowed`.
- Columns depend on the role: Warden admins get emails, roles, Minecraft accounts, the ban, the anticheat brief and the playtime limit; site admins also get the sign-in date and the site ban; economy admins get the personal balance and no email; events managers get registrations and no email.

Bulk actions (`AdminUsersBulkBar`, `AdminBulkModal`) are for site admins. "Select all matching" sends the list's filters as the selection (`q`, `tenantId`, `role`, `filters`). "Create ghost" is for site admins and events managers.

## The Person page

Tabs: Summary, Minecraft, Moderation, Playtime, Anticheat, LNBits, Events, Site account. A role sees only the tabs it may use (`personTabs` in `app/utils/admin-nav.ts`), a ghost only Summary, Events and Site account, and an unknown or forbidden tab goes back to Summary.

Only Summary has its own endpoint, `GET /api/admin/people/:userId/summary`, cut by role like the list. The other tabs load the routes they always did: `GET /api/warden/admin/players/:userId` for Minecraft and Moderation, the playtime and anticheat panels, the economy account for LNBits. The Events tab reads the registrations list of the summary. The Minecraft tab ends with the "Feed announcer" switch (`GET` and `PUT /api/feed/admin/announcers/:userId`, see `docs/feed.md`), on and disabled for a moderator, who announces by role; a ghost has no Minecraft tab, so no switch.

The header shows an "Announcer" pill beside the roles, for Warden admins, when the person holds the `feed-announcer` role or a moderator role. It has the actions the state and the role allow, all as outline buttons: Add a note, Warn, Ban or (when banned) Change the end and Lift the ban, for Warden admins; Edit details, Register to an event and Delete the ghost for a ghost; Adjust balance for economy admins; Register to an event for events managers. Callouts above the tabs: an appeal waiting ("Answer the appeal"), a file to look at ("Review the file", which opens the Anticheat tab) and time past the playtime limit. On a phone the actions fold into the ⋯ menu, which also holds "Copy the ID" and "See this person's activity" (`/admin/settings/activity?user=<id>`, which the activity view honours).

## Moderation > Bans

`/admin/moderation/bans` (`GET /api/warden/admin/feed`) lists every ban in force and the latest 50 warnings and notes, with a kind filter. A row opens the person's Moderation tab.

## Moderation > Feed

`/admin/moderation/feed` (`GET /api/feed/admin/posts`, see `docs/feed.md`) lists Feed posts and replies, live and deleted, with their real authors. A row opens a drawer (`?post=<id>`) whose author band links to the person's Summary.
