# Modlist and modpack manifest

The Modlist at `/admin/mods` is the list of mods the Minecraft launcher downloads. It is **separate from the mod vote** (`docs/mods.md`): the vote is about what players want, the Modlist is what the launcher installs. The two meet in an "Export to manifest" button (not built yet). The page layout is "Manifest first" with the filters of "Table and drawer", from [the Modlist mocks](https://claude.ai/artifact/Qs6v2HynjKZ3ugYZcEEhXu).

Built so far: the Modlist itself, the nightly check and Adopt. Still to do: the export from the vote, and the public manifest.

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

## Page

Four numbers (revision, mods, download size, last change), then a search, the filters **All**, **Updates** and **Needs attention** with their counts, and the mods. A row shows the name, a line of what to do next, the source, the side, the pinned version and the status. It opens a drawer with what the manifest lists now, the newest file found, the details to edit, the switch to a library jar, and remove.
