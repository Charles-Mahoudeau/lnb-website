# Push notifications

Notifications about events, and nothing else: no ads, no news, no other feature. They are opt-in, per device, for signed-in accounts. The promise people read is "Only about events. No ads. About 3 a week at most."

Design: see Notifications in `docs/design.md` and the [push mock](https://claude.ai/artifact/B9QVfPJbgPRYARQ1hjmN6A).

## What is sent

| Kind          | When                                                                                    | Who                                 | Switch (`/account`)  | Flag             |
| ------------- | --------------------------------------------------------------------------------------- | ----------------------------------- | -------------------- | ---------------- |
| `newEvent`    | A manager announces a published event, once                                             | Accounts of the event's schools     | New events           | `push.newEvents` |
| `reminder`    | Before the start, at each offset set on the event (15 min, 1 h, 3 h, 1, 2 days, 1 week) | Registered people, not the waitlist | Reminders            | `push.reminders` |
| `spot`        | A place opens for someone on the waitlist, or a manager adds them                       | That account                        | Waitlist places      | `push.spots`     |
| `cancelled`   | The event is cancelled                                                                  | Registered and waitlisted           | Changes to my events | `push.changes`   |
| `rescheduled` | A published event's start time changes                                                  | Registered and waitlisted           | Changes to my events | `push.changes`   |

Removing someone by hand sends nothing. Events default to one reminder, 1 hour before. A moved event reminds again at its new time.

## The weekly limit warns, it never blocks

The limit (3 by default, an admin setting) is not enforced. `/admin/push` shows the notifications sent in the last 7 days, the most one person received, and a warning when someone is over. Before any manager action that sends notifications, a dialog says how many people it would notify and how many already received the limit or more (`POST /api/admin/events/:id/push-impact`, the same code that picks the real recipients). People see only how many they received in the last 7 days.

## Timing

- Reminders, waitlist spots, cancellations and moves go out at once, at their real time.
- New-event announcements wait during the quiet hours, and go out when they end. The default is 22:00 to 08:00 in Paris time. Admins change the two hours, or switch the quiet hours off, in `/admin/push`; with them off, announcements go out at once at any hour. The confirmation and the toast after announcing say when it will go out.
- A moved or cancelled event drops its pending reminders. A reminder is dropped too if the person left the event before it went out, or the event has started.

## How it works

- Services in `server/services/push/`: `queue` (writes `push_notification` rows in the caller's transaction, after checking flags, devices and the person's switch), `deliver` (sends to every device with `web-push`), `reminders`, `subscriptions`, `settings`, `stats`, and the pure `rules` and `messages` that unit tests load.
- `push_notification` is both the outbox and the log. `push:deliver` runs every minute: it queues the due reminders, claims due rows (`FOR UPDATE SKIP LOCKED`, moving `send_at` forward so a crash retries), and sends. A failure retries after 1, 5 and 30 minutes, then hourly, up to 6 attempts. A 404 or 410 from the push service deletes that device. `push:prune` removes rows after 90 days, every night.
- An announced event can be announced again from its menu ("Resend notification", `POST /api/admin/events/:id/announce-resend`). The dialog is the usual impact one, in the destructive style, and warns that people who already got it get it again. The rows carry their own dedupe key, so the first announcement doesn't swallow them; quiet hours apply; it is audited as `event.announceResend`. Devices show it in place of the first one (same tag).
- Events call the queue from `registrations.promote` and `add`, and from `admin.update` and `admin.cancel` through `events/push.ts`. The announcement is `POST /api/admin/events/:id/announce`.
- Text comes from `push.message.*` in the locale files, in the language saved on each device (kept up to date from `/account`). A tag per event makes the latest notification replace the earlier ones.
- `public/sw.js` is the service worker: it shows the notification and opens the event page on tap. It caches nothing. Its icon is `public/notification-icon.png` (192 px, the LNB logo) and its Android status-bar badge is `public/notification-badge.png` (a white silhouette, the fox cut out of the moon). Both are rendered from `public/logo.svg` with `sharp`, since notifications can't use an SVG: change the logo, regenerate them.
- The browser side is `usePush` (`app/composables/usePush.ts`). `PushPrePrompt` is offered after a registration or joining the waitlist: a bottom sheet on phones, a centered dialog on desktop, `PushSettings` is the card on `/account`.

## Asking

Never cold. The sheet appears right after a registration, including for someone who switched notifications off on this device (the browser keeps the permission, so it doesn't prompt twice; only a blocked browser can't be asked), and the settings are always on `/account`. Only "Notify me" triggers the browser's own prompt, which can't be asked twice. "Not now", or dismissing the sheet, stores a mark on that device (`lnb_push_snooze` in `localStorage`) for as long as the admin chose: 7 days, 30 days or never. iPhone only allows web push once the site is on the home screen, so `/account` shows how instead of the switch.

## Admin

`/admin/push`: counts for admins and events managers. Admins also see who turned notifications on (name, school, switches, devices, date, received in the last 7 days) and set the limit, the silence, and the quiet hours. Turning notifications on is visible to admins, and the settings card says so. Changes to the settings are written to `admin_audit` (`push.settings`), announcements as `event.announce`.

## Flags

`push` turns off sending and the prompt: the settings stay visible but off, and queued notifications wait. `push.subscribe` stops new devices. `push.newEvents`, `.reminders`, `.spots` and `.changes` stop one kind (nothing is queued while off). `jobs.pushDeliver` and `jobs.pushPrune` pause the jobs.

## Setup

| Variable            | Required | Notes                                                                                                             |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | No       | Generate the pair once with `npx web-push generate-vapid-keys`.                                                   |
| `VAPID_PRIVATE_KEY` | No       | Stays on the server. Without the three variables, push is off and `/account` says it is not set up on the server. |
| `VAPID_SUBJECT`     | No       | A `mailto:` or `https:` address the push services can reach, such as `mailto:bde@example.com`.                    |

Keep the same keys for good: changing them cuts every device off.

## Testing locally

Chrome needs a secure origin: `localhost` counts. Without a real device, point a local HTTPS stub at test subscriptions and run the dev server with `NODE_TLS_REJECT_UNAUTHORIZED=0`. The stub only has to answer 201, or 410 to see a device being dropped. Set `BDE_API_URL` to a dead address, so saving events can't reach the real BDE website.
