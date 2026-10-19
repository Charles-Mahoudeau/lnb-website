# Events

Events are listed at `/events`, each with its page at `/events/<id>`. Students register from the event page. Events managers run them from the Events section of the admin area (`/admin/events`). An event can also be pushed to the BDE website (see `docs/bde/external_events_api.md`).

Notifications (waitlist places, reminders, cancellations and moves, announcements) are described in `docs/push.md`. Later, not built yet: team events, an iCal feed, and more image providers. The approved mocks are in the [events mocks](https://claude.ai/artifact/E7UkoDfz9U9uiYATh1gZYo): event page A, list A1, admin form with 2 tabs, picker A.

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
- **Capacity** is optional. Past it, registrations join a waitlist, promoted in order when a place frees up, until the event starts. Each promotion queues a notification.
- **Reminders** are set per event, as offsets before the start (default 1 hour). Managers can also announce a published event once, from the "..." menu.
- **BDE rules.** While an event is pushed to the BDE website, its name must be 3 to 100 characters and its description at least 10, since the BDE refuses anything else.
- Every manager change is written to `admin_audit` (`event.*`, `eventRoom.*`, `eventType.*`) and shows on the Overview.

## Registration

- One click registers, or joins the waitlist when the event is full. Registering twice changes nothing. Signed-out visitors are sent to sign in and come back to the event.
- Registration checks, in order: cancelled, started, the window (`notYet`, `closed`), the school (`wrongSchool`), then the limit (`full` still takes waitlist sign-ups). The rules live in `server/services/events/rules.ts`.
- Cancelling or leaving the waitlist is possible until the start. A freed place goes to the first person waiting, at once. Raising the capacity, removing someone and deleting an account promote too. Nobody is promoted once the event has started.
- Every change locks the event row (`SELECT … FOR UPDATE`) before counting, so the last place can't go twice.
- "Who's going" (first names and avatars of the first 6) is for signed-in members only.
- Managers see everyone with their email and school, add someone by hand (any school, any time; past the limit only with `force`), remove someone, and export the list as CSV. Adding and removing are written to `admin_audit`. Adding someone sends them a waitlist-place notification, removing sends nothing (see `docs/push.md`).
- `events.registration` pauses sign-ups and cancellations, without hiding the pages. Managers can still add and remove people.

## Admin pages

- `/admin/events`: upcoming, drafts and past events, with registrations and the waitlist at a glance.
- `/admin/events/new` and `/admin/events/<id>`: the form (one page of sections beside a preview of the site page, the agenda row and a Discord embed), and a Registrations tab. New events start as drafts. The menu views the page, duplicates, cancels or deletes. Times are typed in Paris time (`shared/utils/paris-time.ts`).

## Images

- The picker (`EventsAdminImagePicker`) works in two steps: the art, then the focal point. Art comes from SteamGridDB (a game's banners, 1920 × 620, or covers), an upload, or a link. Providers implement `ImageProvider` in `server/services/events/providers/`: adding one is a file there and a tab in the picker.
- The server keeps every picked image: decoded and re-encoded by sharp (WebP, at most 3840 wide, no metadata), stored under the SHA-256 of its bytes in the `event-images` Nitro storage (`.data/event-images`, on the VPS's disk), and served from `/api/media/<key>` with immutable caching, on our own domain as the BDE website requires.
- Saving an event cuts three crops around the focal point (`focalCrop` in `rules.ts`): the page banner (1920 × 620 WebP), the agenda thumbnail (640 × 360 WebP) and the embed (1200 × 630 JPEG, since some embeds refuse WebP). The embed uses its own image when one is picked, else the banner.
- Links are fetched over https only, up to 10 MB, within 10 seconds, never from a private, loopback or link-local address, and each redirect is checked again. Provider images are fetched from the provider's hosts only, and so are the picker's previews (`/api/admin/events/images/thumb`, cached a day).
- `events:prune-images` removes images no event uses, a day after they were stored, every night (`jobs.pruneEventImages`). `events.imageSearch` turns SteamGridDB off: uploads and links stay.

## BDE website

- With "Publish on the BDE website too" on, an event is pushed to the BDE's external events API (`docs/bde/external_events_api.md`) with `PUT /events/<our id>`: the name, the description as plain text, the room as location, the dates, our page as `url`, the embed image, the price, and `hidden` while it's a draft. Cancelling, deleting or turning the switch off sends `DELETE`. `server/services/events/bde.ts` does it, `toBdePayload` and `bdeProblems` in `rules.ts` map and check the fields.
- Saving marks the event `pending` and pushes at once. A network error, a 5xx or a 429 is retried by `events:bde-sync` (every minute) after 1, 5 and 30 minutes, then hourly. A refusal (422, a token problem, or our own check of the BDE's rules) is `failed`, with the BDE's messages on the form, until the event changes or a manager clicks Try again. A save during a push makes the next run send the new version.
- Deleting an event that is on the BDE website takes it down there first, and is refused while the BDE website can't be reached, since nothing could retry afterwards.
- The page and image URLs come from `BETTER_AUTH_URL`, which must be on `bde-teknantes.fr` for the BDE to accept them. `events.bdeSync` pauses the pushes: events wait as pending.
- If the API stays down, the LNB office can add the event by hand in the BDE admin panel, then delete it there before the API is back (see the API doc).

## Environment

| Variable              | Required | Use                                                                                    |
| --------------------- | -------- | -------------------------------------------------------------------------------------- |
| `STEAMGRIDDB_API_KEY` | No       | Turns on SteamGridDB in the image picker.                                              |
| `BDE_API_TOKEN`       | No       | From the BDE office. Turns on pushing events to the BDE website.                       |
| `BDE_API_URL`         | No       | The BDE API, `https://bde-teknantes.fr/api/v1` by default. Point it at a stub to test. |

## Pages

- `/events` lists upcoming events by month, opening on the next one as a larger card (`EventsNextCard`), with a Past tab and filters by type and school. Events under way count as upcoming, and cancelled ones stay listed with a badge.
- `/events/<id>` shows the banner with the type, name, date and room, then the description beside the registration panel (above it on phones). It sets OG and Twitter tags from the embed image and the start of the description, and offers an `.ics` file (`/api/events/<id>/calendar.ics`).
- The home hero shows the next event, the home agenda the 5 after it, and the sign-in banner the next one. With no upcoming event the home page shows an intro hero instead, and the last 3 past events as "Recent events" either way. `events.home` turns the home part off, and `events` the whole feature.
- Descriptions are rendered by `server/services/events/markdown.ts` and styled with the `event-prose` utility.

## Data

In `server/db/schema/events.ts`:

- `event_room` and `event_type`: archived with `archived_at`. Names are unique among those not archived, ignoring case.
- `event`: the event, keyed by a UUID that is also its `external_id` on the BDE website. It also holds its image keys and crops, and its BDE sync state.
- `event_registration`: one row per account and event, `registered` or `waitlist`. The waitlist is in order of creation. Rows go with the account.
