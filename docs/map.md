# Minecraft map

`/minecraft/map` shows the live map of the Minecraft server inside the site, in a frame, so people keep the header. It is public (no sign-in), like the mod list. The map itself is not ours: it is a separate site (`https://mc.lnb.bde-teknantes.fr/map/` by default).

## How it works

- The address is in `map_setting` (a single row, id 1). No row, or a null address, means the default in `shared/schemas/map.ts` (`DEFAULT_MAP_URL`).
- Admins change it at `/admin/settings/map` (full admins only). It has to be an `https://` address. An empty field goes back to the default. A change is logged in `admin_audit` (`map.settings`).
- `GET /api/map` returns the address (flag `map`). `GET` and `PATCH /api/admin/map` read and change it. The admin routes are never gated.
- The page holds a slim bar (1rem all around the page, and 1rem between the bar and the frame, full width instead of the site's container) (the title, "Full screen" and "Open in a new tab") and a frame that takes the rest of the screen (`h-map` in `app/assets/css/main.css`). "Full screen" uses the browser's Fullscreen API and is hidden where it isn't available.
- Before showing the frame, the page asks `GET /api/map/status`. The server fetches the map (5 second timeout, redirects followed) and answers `ok` only for a 200, and keeps the answer for 10 seconds. A browser can't read the status of a framed page, which is why the server does it. Any other status, or no answer, shows the error screen (an `IconTile`, a title, one line and "Try again", which asks again). While it checks, and while the frame loads, a spinner shows. A frame that doesn't finish loading within 15 seconds also gets the error screen.
- The server fetches an address an admin chose, so the address is limited to https and set by full admins only.
- **Opening.** `map_setting` also holds who can see the map: `mode` (`open`, the default, `date` or `closed`), `opens_at` (an instant, entered in Paris time) and `locked_at` (when it was last closed, kept while it stays closed, for the progress). `date` hides the map until `opens_at` and then opens by itself, with nothing to switch back. `closed` hides it until an admin opens it. Admins always see the map.
- While the map is closed, `GET /api/map` gives visitors a null `url` (so the address never leaves the server) with `locked`, `opensAt` and `lockedAt`, and `GET /api/map/status` asks nothing and answers `ok: false`. A signed-in admin still gets the address with `locked: true`, and the page shows the map under a note saying players can't see it yet, with a button to `/admin/settings/map`.
- The page then shows the wait page: a countdown sentence ("The map opens in 15 days", "tomorrow", "in 3 hours"; Paris calendar days, see `shared/utils/map-opening.ts`), a neutral meter with "Day 3 of 17" and the opening date, and "While you wait" links to the Minecraft account, bank and quests (each hidden by its own flag). Without a date (`closed`) it says the map is closed for now and shows no meter. It counts by the minute and loads the map itself when the time comes. "Full screen" and "Open in a new tab" are hidden.
- `/admin/settings/map` has an "When players can see the map" section above the address: three cards (Always open, Opens on a date, Closed), a Paris date and time under the middle one, a sentence saying what players will see, and Save. A change is logged in `admin_audit` (`map.settings`, with the mode and date).
- Feature flag `map` switches the page, its API and its menu and footer links off. The saved address stays.

## The map site must allow framing

The frame only works while the map's site allows being shown inside `lnb.bde-teknantes.fr`. It must not send `X-Frame-Options: DENY` or `SAMEORIGIN`, and any `Content-Security-Policy: frame-ancestors` must include the site's address. Our own site sets no frame-related CSP of its own. If the map refuses, the "Open in a new tab" button is the way in.

## Design

Mock (not code to port): the Minecraft map mocks, proposition D, "A with B's buttons": see `docs/design.md`. The wait page is from the [map opening mocks](https://claude.ai/artifact/6dLDAYg8TQ3gLc8t4CMgk3), visitor C and admin A.
