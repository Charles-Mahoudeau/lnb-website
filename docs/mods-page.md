# Mods page

The Mods page (`/minecraft/mods`) shows what the LNB launcher installs, so players can see which mods run and where. It is separate from the **Mod vote** (`/minecraft/mod-vote`, see `docs/mods.md`), which was the `/minecraft/mod-list` page and still redirects from there. A flag, `modsPage`, switches it off (the page, and the menu, footer and home entries).

Layout: proposition B, "Grouped by side", of [the Mods page mocks](https://claude.ai/artifact/WSoKzGU3iH2HYfCgixYhFg) (not code to port), with the mod logos added.

## Data

- **Client only.** The page reads `/modpack/manifest.json` in the browser (`useFetch` with `server: false`), the same public document the launcher reads, so nothing is rendered on the server and the first paint is the loading state. It uses the same origin: the manifest sends no CORS headers, so in local dev the page shows the local Modlist.
- The manifest is behind the `modpack` flag. Off, it answers 503 and the page shows its "can't be reached" state.
- Mods are grouped by `side`: **Everyone** (`both`), **Your computer only** (`client`), **The server only** (`server`). A group with no match is left out. Search matches names; the Optional chip keeps optional mods. Optional mods carry an Optional badge, and files of the Files library (`source: upload`) a neutral outline "Hosted by LNB" badge. A source link (Modrinth or CurseForge) ends each row.
- The summary line adds the sizes of the listed mods, so it matches what the launcher downloads.

## Logos

Each manifest mod has an `icon`: an absolute address on this site (`/api/minecraft/modpack/mods/<id>/icon?v=<key>`, public, cached for a year) or `null`. The site downloads the logo itself, from Modrinth or CurseForge, into the `mod-icons` storage and keeps its key in `modpack_mod.icon_key`, so visitors never contact the source.

- A Modrinth or CurseForge mod gets its logo when it is added.
- Mods that have none get it at the next check for updates (nightly `modpack:check-latest`, or the **Check for updates** button), which also fills the existing ones after this was added. A source that can't answer is retried at the next check.
- Mods from a link or an upload have no source, so they show their initials on a plain tile (`ModsIcon`).
- Removing a mod from the Modlist deletes its logo. A logo never changes the manifest's revision.
- The `modIcons` flag gates the route, like the vote's icons.
