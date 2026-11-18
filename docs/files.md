# Files library

`/admin/mods/files` is where Warden admins upload the jars and assets the Minecraft launcher downloads: custom mod jars, mods mirrored from CurseForge (whose projects often forbid third-party downloads), the Prism wrapper jar and a few launcher files. It's the first half of the modpack work: the Modlist and the manifest, which point at these files, come next. The page layout is "Drop first": the design mock is [the Files mocks](https://claude.ai/artifact/CsGMnjAhpLs9uRk4aeEpsp), proposition C.

## Model

- `stored_file` (`server/db/schema/files.ts`): the SHA-256 (unique) and SHA-512 of the bytes, the name, the kind, the size, who uploaded it and when. The bytes live on disk, under `.data/files/<sha256>`.
- The kind is one of `FILE_KINDS` (`shared/schemas/files.ts`): `mod` (a mod's jar), `wrapper` (the launcher's own jar), `updater` (the updater's jar, see the tools in `docs/modpack.md`), `download` (a file for the Minecraft download page, see `docs/downloads.md`) or `asset` (anything else). It decides which extensions are accepted: `.jar` for mods, wrappers and updaters, `.zip`, `.txt`, `.json`, `.dat`, `.toml`, `.properties` or `.cfg` for assets, and `.zip`, `.exe`, `.msi`, `.dmg`, `.pkg`, `.appimage` or `.gz` for downloads. A download never reaches the launcher's manifest, which lists only assets.
- The same bytes are stored once: uploading a file that is already there is refused (`fileDuplicate`), whatever its name. Files are never edited, so a new version of a jar is a new file. A file can only be deleted, with its row.

## Uploading

`POST /api/admin/files?name=…&kind=…`, with the file as the **raw request body** (not multipart), up to 100 MB (`MAX_FILE_BYTES`). The route streams the body to a temporary file on the volume while it computes both hashes, so a 100 MB jar never sits in memory. That is also why the files aren't in a Nitro storage: those read and write whole files. The page sends the body with `XMLHttpRequest`, because `fetch` can't report an upload's progress.

- The name is cleaned: no path, accents dropped, and anything other than letters, digits and `._+-` becomes `_`. It needs an extension the kind accepts (`fileBadName`, `fileBadType`).
- The browser's content type is ignored. A `.jar` or `.zip` must start like a zip archive (`PK`), so a renamed text file is refused (`fileBadType`).
- The size is counted while it streams, so a request without a `Content-Length`, or with a false one, is cut off at 100 MB (`fileTooLarge`, 413). An empty body is refused (`fileEmpty`).
- The page uploads one file at a time, picked or dropped, with a progress bar, and the kind can be left on "Automatic" (a jar is a mod jar, anything else an asset) or set for the batch.
- Uploads are in the `write-heavy` rate limit (20 a minute per account). Every upload and delete is written to `warden_audit` (`file.upload`, `file.delete`), and shows in Warden's activity log.

If the reverse proxy limits request bodies (Traefik in Coolify doesn't by default), it has to allow 100 MB on this route.

## Changing the type

`PATCH /api/admin/files/<id>` with `{kind}`, from a "Type" selector in the file's drawer. The new kind has to accept the file's extension (`fileBadType`), and a file that a mod or a tool uses keeps its kind (`fileInUse`), since that use depends on it. So in practice only jars move, between mod jar, wrapper and updater, and a zip moves between asset and download. No extension is accepted by both a jar kind and another kind. It is written to `warden_audit` (`file.kind`). Use it when a jar was uploaded as the wrong kind, instead of deleting and uploading it again.

## Downloading

`GET /api/files/<sha256>/<name>`, without sign-in, so the launcher can fetch it. The address holds the hash of the bytes, which never change, so it is cached for a year (`ETag` is the hash). The name after it is only there so the link reads well: the response always uses the name stored with the file. Every file is sent as `application/octet-stream`, as an attachment, with `nosniff`, so nothing in a file runs in a browser, whatever it is.

Anyone with a link can download a file, and links can be guessed only by knowing the hash. Upload only what is meant to be shared.

## Deleting

A file that something points at can't be deleted (`fileInUse`): the page shows what uses it in the drawer, and the delete button is off. Mods pinned to a file and the launcher's current tools point at files; `usageOfFiles` in `server/services/modpack/usage.ts` says so. Deleting asks first, removes the row and the file, and the download link stops working at once.

## Flag

`files` switches the public downloads off (503 `disabled`). Admins can still upload and manage files, since admin routes are never gated.

## Storage

`.data/files` on the persistent volume (see `docs/deployment.md`). `FILES_DIR` overrides it, for the tests. The database rows point at the files by hash, so the volume and the database have to be restored together. Interrupted uploads leave a `.upload-*` file there; they are removed as soon as the request fails, and any that remain after a crash can be deleted by hand.
