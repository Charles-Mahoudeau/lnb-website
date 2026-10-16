# Events

Events are listed at `/events`, each with its page at `/events/<id>`. Students register from the event page. Events managers run them from the Events section of the admin area (`/admin/events`). An event can also be pushed to the BDE website (see `docs/bde/external_events_api.md`).

The feature is built in slices. Done: the role, the data, rooms, types, the public pages (`/events`, `/events/<id>`, the home hero and agenda, the sign-in banner), registrations with the waitlist, and the admin event pages. Still to do, in order: images (the picker, SteamGridDB, crops) and the BDE sync. The approved mocks are in the [events mocks](https://claude.ai/artifact/E7UkoDfz9U9uiYATh1gZYo): event page A, list A1, admin form with 2 tabs, picker A.

## Roles

- `events-manager` opens the Events section of the admin area and nothing else. Site admins have it implicitly. It's set from the Roles modal on `/admin/users`.
- Routes check it with `requireEventsManager`. Admin pages that managers can open set `definePageMeta({ eventsManagers: true })`.

## Rules

- **Visibility.** Events are public: the list and event pages need no account. A hidden event is a draft: only managers see it.
- **Lifecycle.** An event with registrations is cancelled rather than deleted: its page stays with a notice, and registrations close. Cancelling can't be undone, and a cancelled event can't be edited. Only drafts and events nobody registered to can be deleted.
- **Duplicating** creates a draft copy at new dates, without registrations. The registration window moves with the start.
- **Dates.** The end comes after the start. The registration window is optional: by default it opens at publication and closes at the start, and it can't close after the start. Times are entered and shown in Europe/Paris and stored in UTC.
- **Content.** The name and description are written once, in any language. The description is Markdown, rendered without raw HTML or images. The price is informational, in whole euros.
- **Schools.** The schools an event names limit who can register, not who can see it.
- **Rooms and types** are picked from lists the managers keep. A type has a name in each UI language and a Lucide icon, never a colour (`docs/design.md`). Rooms and types are archived rather than deleted: events keep them, and the form stops offering them. An event can keep an archived room or type, but can't switch to one.
- **Capacity** is optional. Past it, registrations join a waitlist, promoted in order when a place frees up, until the event starts.
- **BDE rules.** While an event is pushed to the BDE website, its name must be 3 to 100 characters and its description at least 10, since the BDE refuses anything else.
- Every manager change is written to `admin_audit` (`event.*`, `eventRoom.*`, `eventType.*`) and shows on the Overview.

## Registration

- One click registers, or joins the waitlist when the event is full. Registering twice changes nothing. Signed-out visitors are sent to sign in and come back to the event.
- Registration checks, in order: cancelled, started, the window (`notYet`, `closed`), the school (`wrongSchool`), then the limit (`full` still takes waitlist sign-ups). The rules live in `server/services/events/rules.ts`.
- Cancelling or leaving the waitlist is possible until the start. A freed place goes to the first person waiting, at once. Raising the capacity, removing someone and deleting an account promote too. Nobody is promoted once the event has started.
- Every change locks the event row (`SELECT … FOR UPDATE`) before counting, so the last place can't go twice.
- "Who's going" (first names and avatars of the first 6) is for signed-in members only.
- Managers see everyone with their email and school, add someone by hand (any school, any time; past the limit only with `force`), remove someone, and export the list as CSV. Adding and removing are written to `admin_audit`. People aren't notified of any of it yet: that waits for Push.
- `events.registration` pauses sign-ups and cancellations, without hiding the pages. Managers can still add and remove people.

## Admin pages

- `/admin/events`: upcoming, drafts and past events, with registrations and the waitlist at a glance.
- `/admin/events/new` and `/admin/events/<id>`: the form (one page of sections beside a preview of the site page, the agenda row and a Discord embed), and a Registrations tab. New events start as drafts. The menu views the page, duplicates, cancels or deletes. Times are typed in Paris time (`shared/utils/paris-time.ts`).

## Pages

- `/events` lists upcoming events by month, opening on the next one as a larger card (`EventsNextCard`), with a Past tab and filters by type and school. Events under way count as upcoming, and cancelled ones stay listed with a badge.
- `/events/<id>` shows the banner with the type, name, date and room, then the description beside the registration panel (above it on phones). It sets OG and Twitter tags from the embed image and the start of the description, and offers an `.ics` file (`/api/events/<id>/calendar.ics`).
- The home hero shows the next event, the home agenda the 5 after it, and the sign-in banner the next one. `events.home` turns the home part off, and `events` the whole feature.
- Descriptions are rendered by `server/services/events/markdown.ts` and styled with the `event-prose` utility.

## Data

In `server/db/schema/events.ts`:

- `event_room` and `event_type`: archived with `archived_at`. Names are unique among those not archived, ignoring case.
- `event`: the event, keyed by a UUID that is also its `external_id` on the BDE website. It also holds its image keys and crops, and its BDE sync state.
- `event_registration`: one row per account and event, `registered` or `waitlist`. The waitlist is in order of creation. Rows go with the account.
