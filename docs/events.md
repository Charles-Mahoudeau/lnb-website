# Events

Events are listed at `/events`, each with its page at `/events/<id>`. Students register from the event page. Events managers run them from the Events section of the admin area (`/admin/events`). An event can also be pushed to the BDE website (see `docs/bde/external_events_api.md`).

The feature is built in slices. Done: the role, the data, rooms, types and the admin API. Still to do, in order: mocks of the pages, the public pages (replacing the placeholders in `app/utils/events.ts`), registrations, images and the BDE sync.

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

## Data

In `server/db/schema/events.ts`:

- `event_room` and `event_type`: archived with `archived_at`. Names are unique among those not archived, ignoring case.
- `event`: the event, keyed by a UUID that is also its `external_id` on the BDE website. It also holds its image keys and crops, and its BDE sync state.
- `event_registration`: one row per account and event, `registered` or `waitlist`. The waitlist is in order of creation. Rows go with the account.
