# Deployment

The site is deployed with Coolify on an OVHcloud VPS, from the `main` branch. There is no preprod environment.

## Persistent storage

Uploads and caches are written to the container's filesystem, in Nitro `fs` storages whose base is `./.data/<name>` (see `nitro.storage` in `nuxt.config.ts`). The path is relative to the working directory of the Node process, so a container rebuilt on every deploy loses them unless they sit on a volume.

Add **one** persistent storage in Coolify (Application → Persistent Storage → Add → Volume Mount):

| Name               | Destination path (in the container) |
| ------------------ | ----------------------------------- |
| `lnb-website-data` | `/app/.data`                        |

`/app` is the working directory of Coolify's default Nixpacks build. If the app gets a Dockerfile, or the build pack changes, use that image's `WORKDIR` followed by `/.data`. To check, open the container's terminal in Coolify and run `pwd`, then `ls -a`: `.data` appears after the first upload.

One mount on `.data` covers every storage below, and any storage added later, so a new one needs no change in Coolify. Mounting each folder separately only adds places to forget.

| Folder                | Holds                                       | If lost                                                                                    |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `.data/event-images`  | Event images, picked or uploaded, and crops | Event pages and the BDE push show broken images. Not recoverable except by picking again.  |
| `.data/partner-logos` | Partner logos uploaded by admins            | Partners show without a logo until it is uploaded again.                                   |
| `.data/mod-icons`     | Mod icons, downloaded when a mod is added   | Mods fall back to initials until the icon is fetched again.                                |
| `.data/avatars`       | Profile photos fetched from Microsoft Graph | Initials show until the next sign-in of each account.                                      |
| `.data/warden-heads`  | Cache of Minecraft skin heads from Crafatar | Nothing: it refills by itself. It is a cache, but kept so a deploy doesn't start it empty. |

The database rows point at these files by key, so the volume and the PostgreSQL database have to be restored together. The VPS's daily backup is the only backup (no off-site copy), so check that it covers the Docker volumes' directory (`/var/lib/docker/volumes/`) as well as the database.

## Health check

Set the health check on `/api/health`. The server applies pending migrations at startup; if they fail it stays up and the route answers 503, so Coolify keeps the previous container serving. See `server/plugins/migrate.ts`.
