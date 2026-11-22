# Updater plan: syncing mod removals with a local journal

For the developer of `lnb-modsync-updater` (see `docs/modpack.md`). **No change is needed on the site.** The manifest already gives what the updater needs: a stable `id` per mod, `fileName`, `hashes.sha512`, `side`, `optional`, and `assets`.

## Goal

When an admin removes a mod from the Modlist, or switches it to another file (a new version has a new file name), the updater deletes the old file on every client and server. It never touches a file the updater didn't put there, so players can still add their own mods.

## The journal

A file next to the instance's `mods/` folder: `.lnb-modsync/journal.json`.

```json
{
  "schema": 1,
  "revision": 15,
  "entries": [
    {
      "id": "<manifest id>",
      "kind": "mod",
      "path": "mods/sodium-0.6.1.jar",
      "sha512": "…",
      "installedAt": "2026-11-22T10:00:00Z"
    }
  ],
  "declined": ["<manifest id of an optional mod the player deleted>"]
}
```

- `kind` is `mod` or `asset` (the manifest's `assets` list), so both are cleaned the same way.
- `path` is relative to the instance folder.
- The journal is written with a temporary file then a rename, after every file operation, so a crash leaves it true to the disk.
- The journal is the only thing the updater is allowed to delete from. A file not in it is the player's.

## The sync

Run after the updater has updated itself and the launcher, as today.

1. **Fetch the manifest** (`If-None-Match` as today). On any error, a 5xx, a 503 (flag off), an unknown `schema`, or an invalid body: stop. **Never delete anything on a failed or doubtful fetch.**
2. **Compute the wanted set**: manifest `mods` that apply to this side (client: `client` and `both`; server: `server` and `both`), plus `assets`.
3. **Install or update** each wanted entry:
   - Journal has the same `id` and `sha512`, and the file exists with that hash: nothing to do.
   - Otherwise download to a temporary file, check the SHA-512, then rename to the final path (a Windows lock means retry next run, not an error).
   - Update the journal entry, then delete the previous file of that `id` if its path differs (this is the version swap).
4. **Remove**: for each journal entry whose `id` is not in the wanted set, delete the file **only if its SHA-512 still equals the journal's**. Then drop the entry.
   - Hash differs: the player replaced or edited it. Leave the file, drop the entry, log it.
   - File already gone: drop the entry.
   - Delete fails (locked, permissions): keep the entry and retry next run.
5. Save the journal with the manifest's `revision`.

A mod whose side no longer applies (an admin changed `both` to `client` and this is a server) is removed by the same rule, since it leaves the wanted set.

## Safety rules

- **Paths.** `fileName` must be a plain name, with no `/`, `\` or `..`. Resolve the final path and refuse it if it is outside the instance folder. Same for `path` read from the journal.
- **Mass-delete guard.** If a run would delete more than half of the journal (and more than 5 files), do nothing and log it. A broken manifest is the likeliest cause. An admin can empty the pack on purpose by removing mods over several revisions, or the guard can be lifted with a `--force-removals` flag.
- **Name collision.** The target path exists and isn't in the journal:
  - Its hash equals the manifest's: adopt it (add to the journal).
  - Its hash differs: do not overwrite. Skip that mod, log "player file in the way", and retry next run. The player's file wins.
- **Same mod, different file.** Optional but recommended: before installing, read the mod id from the jar metadata of the other jars in `mods/` (`META-INF/neoforge.mods.toml`, `fabric.mod.json`, `quilt.mod.json`). If an unmanaged jar already declares the id the new jar would declare, skip the install and log it, to avoid a "duplicate mod" crash on launch.
- **Optional mods.** On the first install an optional mod is installed. If it is in the journal and the player deletes the file, record its `id` in `declined` and never reinstall it. Removing the mod from the manifest drops it from `declined` too.
- **Running game.** Don't replace or delete while the game or server runs (Windows locks). The updater runs only before launch, as now.

## First run and migration

There is no journal on installs made before this version. The first run with no journal must **delete nothing**: for each wanted file already on disk with the right hash, adopt it into the journal, then proceed. Mods installed before the journal and removed from the manifest before the first run stay on disk for good. For those, tell the team to ask players to delete them once, or give the updater a one-off list of names. It is a known limit, not a bug.

## Tests

Plain-file tests against a temp directory with a fake manifest:

- A removed mod is deleted; a custom jar next to it is kept.
- A version swap deletes the old file after the new one is in place; if the download fails, the old file stays.
- An edited journalled file (different hash) is kept and dropped from the journal.
- A collision with a player file isn't overwritten; one with the right hash is adopted.
- No journal: nothing is deleted, matching files are adopted.
- Manifest errors, a 503 and an unknown `schema` change nothing.
- The mass-delete guard.
- A `fileName` with `..` or a separator is refused.
- A side change removes the mod on the side that no longer applies.
- A declined optional mod isn't reinstalled.

## Open questions for the developer

- Where the journal lives on the Pelican server (the egg's working directory, outside any folder players can reach).
- Whether reading jar metadata for the duplicate check is in scope for the first version.
- What the updater prints, so a player can see what it removed and why (a `lnb-modsync.log` next to the journal would do).
