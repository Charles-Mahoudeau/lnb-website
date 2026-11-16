# Modlist and modpack manifest

The Modlist at `/admin/mods` is the list of mods the Minecraft launcher downloads. It is **separate from the mod vote** (`docs/mods.md`): the vote is about what players want, the Modlist is what the launcher installs. The two meet in an "Export to manifest" button (not built yet). The page layout is "Manifest first" with the filters of "Table and drawer", from [the Modlist mocks](https://claude.ai/artifact/Qs6v2HynjKZ3ugYZcEEhXu).

Everything is built: the Modlist, the nightly check and Adopt, the export from the vote, and the public manifest. Not verified against the real thing: the Prism wrapper jar reading the manifest.

## Model

- `modpack_mod` (`server/db/schema/modpack.ts`): one row per mod. `source` is `modrinth`, `curseforge`, `url` (a link the site downloaded and hashed) or `upload` (a jar of the Files library). A project is in the pack once (`source`, `source_id`).
- **Pinned file** (`pinned_*` columns): the one file the manifest lists, with its version label, name, link, SHA-256 (when known), SHA-512 and size. Only an admin changes it, never a job. A Files library file is kept by `pinned_file_id`, which the library's delete respects (`fileInUse`), and its link is this site's own.
- **Latest file** (`latest_*`): what the nightly check found, for the update badge. Filled when a Modrinth or CurseForge mod is added, then by the check (see below). A mod has an **update** when its latest SHA-512 differs from the pinned one.
- `modpack_state`: the manifest's **revision**, a single row. Adding, editing, switching or removing a mod raises it by one, in the same transaction as the change.
- A mod needing attention (`attention`: `noCompatibleFile`, `downloadBlocked`, `urlChanged`), or with no pinned SHA-512, is **out of the manifest** and out of the download size until an admin fixes it.

## Adding a mod

`POST /api/minecraft/admin/modpack/mods`, with a `source`:

- **Modrinth / CurseForge** (from the search, which here also shows mods already in the vote): the project is read fresh and must run on the server's version and loader (the mod list settings). The newest compatible file is pinned, a release before a newer beta. Modrinth gives a SHA-512. CurseForge gives only a SHA-1, so the site downloads the file (CurseForge hosts only) to compute its SHA-512 and SHA-256. A CurseForge file with distribution disabled has no download link: the mod is added flagged `downloadBlocked`, and an admin uploads the jar to the Files library and switches the mod to it. A mod with no compatible file is added flagged `noCompatibleFile`.
- **Custom URL**: the site downloads the file once to hash it and keeps the hash and the link, not the bytes. https only, public hosts only (a private, loopback or link-local address is refused, and each redirect is checked again), 100 MB at most, and it must start like a zip archive. The version is typed by hand.
- **Files library**: a file of kind "mod jar", with the name and version typed.

CurseForge needs `CURSEFORGE_API_KEY`; without it those lookups answer `sourceUnavailable`.

## Editing

`PATCH .../mods/{id}` changes the name, side (`both`, `client`, `server`) and optional flag, and the version label of custom and uploaded mods (the others come from their source). `PUT .../mods/{id}/file` points a mod at a library jar, with its version, and clears its flag. `DELETE .../mods/{id}` removes the mod from the pack; a library file it used stays in the library. Every change is written to `warden_audit` (`modpack.add`, `.edit`, `.pin`, `.remove`) and the routes are in the `write-heavy` rate limit, since an add can download a file.

## Checking for newer files, and Adopt

`modpack:check-latest` runs every night at 03:00 (flag `jobs.modpackLatest`), and the page's **Check for updates** button runs the same check (`POST .../mods/check`). For each mod that isn't uploaded it looks up the newest compatible file and writes it to the `latest_*` columns, with the check's date. **A check never changes the manifest**: only Adopt does.

- Modrinth and CurseForge: the same lookup as when adding. A CurseForge file already hashed under the same link isn't downloaded again. If the source can't be reached, the mod keeps what was known and the check counts it as failed. A project that no longer has a compatible file loses its "latest".
- A CurseForge file that is newer but has downloads blocked is shown as the latest without a hash, and can't be adopted: upload the jar and switch the mod to it.
- Custom links: the file is downloaded again and its SHA-512 compared with the pinned one. If it differs, the mod is flagged `urlChanged` and **leaves the manifest** (launchers could not verify it), which raises the revision; the new file is kept as the latest. If it matches again later, the flag clears by itself.
- Uploaded files are the team's own, and aren't checked.

**Adopt** (`POST .../mods/{id}/adopt`, from the drawer) pins the latest file and raises the revision. For a changed link it accepts the new file and puts the mod back. **Adopt all** (`POST .../mods/adopt-all`, shown on the Updates filter) adopts every update in one change with one revision bump, and leaves the mods needing attention alone. Both are written to `warden_audit` (`modpack.adopt`, with the old and new versions).

## Exporting from the vote

**Export from the vote** (shown while the vote feature is on) copies the vote's official list to the Modlist. Pick a mode, review the diff, tick what to apply:

- **Add missing**: official mods whose project isn't in the Modlist yet.
- **Sync removals**: also removes Modrinth and CurseForge mods that left the vote list, and copies the optional flag.
- **Replace**: the Modlist becomes the vote list. Links and uploaded entries are dropped too, but unticked by default.

`GET .../export?mode=` returns the diff and writes nothing. `POST .../export` takes `{mode, keys}` and recomputes the diff, so only ticked changes of a real diff apply. Added mods get the newest compatible file pinned (or are flagged and left out of the manifest) and are linked to their vote mod. A mod whose source can't be reached is counted as failed and not added. The whole export raises the revision once and is audited as `modpack.export`. Official mods added by hand have no source and are listed as skipped.

## The public manifest

`GET /api/minecraft/modpack/manifest`, also at `/modpack/manifest.json`: the shorter address is the one the wrapper jar should hardcode, since it isn't tied to the API's layout. No sign-in. Behind the `modpack` flag (off: 503, launchers keep what they have).

```json
{
  "schema": 1,
  "revision": 15,
  "updatedAt": "2026-11-16T19:53:16.729Z",
  "gameVersion": "1.21.1",
  "loader": "neoforge",
  "mods": [
    {
      "id": "…",
      "name": "Sodium",
      "side": "client",
      "optional": false,
      "version": "0.6.1",
      "fileName": "sodium-0.6.1.jar",
      "size": 1160000,
      "hashes": { "sha512": "…" },
      "downloads": ["https://cdn.modrinth.com/…"],
      "source": "modrinth",
      "projectUrl": "https://modrinth.com/mod/sodium"
    }
  ],
  "assets": [
    {
      "name": "wrapper.jar",
      "kind": "wrapper",
      "size": 5,
      "hashes": { "sha256": "…", "sha512": "…" },
      "url": "https://…/api/files/<sha256>/wrapper.jar"
    }
  ]
}
```

- Mods with an attention flag, or no pinned hash, are left out. Files of the library are served from this site's own `/api/files/<sha256>/<name>` (absolute address, from `BETTER_AUTH_URL`).
- `hashes.sha512` is always there. `sha256` only when the site knows it (uploaded files and downloaded ones).
- `assets` lists the library's wrapper and asset files. The game version and loader come from the Mods settings.
- The `ETag` is a hash of the content, so it also changes when the settings or an asset change, not only when `revision` does. A launcher sends `If-None-Match` and gets a 304. `Cache-Control` is 60 seconds.
- `revision` goes up with every change an admin makes to the mods. A launcher can compare it to know whether its pack is current.
- Change the format only by adding fields. A break means a new `schema` number.

The Modlist page shows the address with Copy and Open buttons.

## Page

Four numbers (revision, mods, download size, last change), then a search, the filters **All**, **Updates** and **Needs attention** with their counts, and the mods. A row shows the name, a line of what to do next, the source, the side, the pinned version and the status. It opens a drawer with what the manifest lists now, the newest file found, the details to edit, the switch to a library jar, and remove.
