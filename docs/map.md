# Minecraft map

`/minecraft/map` shows the live map of the Minecraft server inside the site, in a frame, so people keep the header. It is public (no sign-in), like the mod list. The map itself is not ours: it is a separate site (`https://mc.lnb.bde-teknantes.fr/map/` by default).

## How it works

- The address is in `map_setting` (a single row, id 1). No row, or a null address, means the default in `shared/schemas/map.ts` (`DEFAULT_MAP_URL`).
- Admins change it at `/admin/map` (full admins only). It has to be an `https://` address. An empty field goes back to the default. A change is logged in `admin_audit` (`map.settings`).
- `GET /api/map` returns the address (flag `map`). `GET` and `PATCH /api/admin/map` read and change it. The admin routes are never gated.
- The page holds a slim bar (in the site's container, with 2rem above and below the page) (the title, "Full screen" and "Open in a new tab") and a frame that takes the rest of the screen (`h-map` in `app/assets/css/main.css`). "Full screen" uses the browser's Fullscreen API and is hidden where it isn't available.
- Before showing the frame, the page asks `GET /api/map/status`. The server fetches the map (5 second timeout, redirects followed) and answers `ok` only for a 200, and keeps the answer for 10 seconds. A browser can't read the status of a framed page, which is why the server does it. Any other status, or no answer, shows the error screen (an `IconTile`, a title, one line and "Try again", which asks again). While it checks, and while the frame loads, a spinner shows. A frame that doesn't finish loading within 15 seconds also gets the error screen.
- The server fetches an address an admin chose, so the address is limited to https and set by full admins only.
- Feature flag `map` switches the page, its API and its menu and footer links off. The saved address stays.

## The map site must allow framing

The frame only works while the map's site allows being shown inside `lnb.bde-teknantes.fr`. It must not send `X-Frame-Options: DENY` or `SAMEORIGIN`, and any `Content-Security-Policy: frame-ancestors` must include the site's address. Our own site sets no frame-related CSP of its own. If the map refuses, the "Open in a new tab" button is the way in.

## Design

Mock (not code to port): the Minecraft map mocks, proposition D, "A with B's buttons": see `docs/design.md`.
