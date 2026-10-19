# Architecture

The server has three layers: thin handlers, services that own the business rules, and Drizzle. One set of Zod contracts is shared with the client. Pages stay thin, with one composable per resource. There is no mapper layer: queries select exactly what the response needs.

Folders marked _(planned)_ don't exist yet. Create them as the work reaches them, following this layout.

## File structure

```
app/                  Nuxt app (client and SSR)
  app.vue             root: UApp, head tags, then the page's layout
  layouts/            default.vue (the site: header, main, footer), admin.vue (/admin: sidebar)
  assets/css/main.css Tailwind and Nuxt UI entry point
  pages/              thin: one composable call, then components
  pages/admin/        the admin area. pages/admin.vue sets the admin layout and middleware on
                      every page under it: site admins only, unless a page sets `wardenAdmins: true`
                      or `eventsManagers: true`
  components/         by domain: admin/ (AdminPage, the frame of an admin page), warden/, mods/,
                      events/ (events/admin/ for managers), team/ (the public team page), admin/team/, later event teams/ account/. Primitives come
                      from Nuxt UI; don't rebuild them.
  composables/        one per resource: useAuth, useLinkCode, useModList, useEvents (useEventList,
                      useEvent, useMyEvents), useEventAdmin, later useEventTeams, useAccount
  middleware/         auth.global.ts (public pages opt out with `auth: false`), admin.ts
  utils/              small client helpers (safeRedirect, the Better Auth client), event dates in
                      Paris time and event display helpers (events.ts)

server/               Nitro server, picked up by Nuxt automatically
  api/                handlers of 5 to 10 lines: guard, validate, call a service, return
    auth/[...all].ts  Better Auth's routes under /api/auth
    docs.get.ts       the API reference (Scalar), from openapi.json.get.ts
  services/           business rules, one file per domain: links (app link codes), warden/
                      (Minecraft link, see docs/warden.md), mods/ (the mod list, see
                      docs/mods.md), users (accounts, for admins), avatars (profile photos),
                      admin-audit and admin-overview (the admin log and Overview), events/
                      (see docs/events.md: admin, public, registrations, rooms, types, images,
                      bde, push, markdown, and rules.ts for the pure rules), push/ (see docs/push.md:
                      queue, deliver, reminders, subscriptions, settings, stats), team (the team page, see docs/team.md), later event teams, files
  db/
    index.ts          Drizzle client (node-postgres), and the Tx and Db types
    schema/           Drizzle tables, one file per domain. auth.ts is generated.
    migrations/       generated and committed
    seed.ts           (planned)
  tasks/              scheduled jobs, timed in nuxt.config.ts: events/bde-sync (every minute),
                      warden/close-stale-sessions, users/delete-inactive, users/prune-avatars and
                      events/prune-images and push/prune (every night at 03:00), push/deliver (every minute,
                      with the event reminders)
  plugins/            Nitro plugins: migrate.ts applies pending migrations at startup (its state feeds /api/health), avatars.ts
                      gives server/lib/ the avatars service
  utils/              auth guards (requireUser, requireAdmin, requireWardenAdmin,
                      requireEventsManager, requireWardenServer), body and
                      params validation (parseBody, parseParams, parseQuery), later typed errors
  lib/                code without Nuxt imports, loaded by the Better Auth CLI too:
    auth.ts           Better Auth setup: Microsoft provider, tenant allowlist, admin plugin
    auth-env.ts       auth environment variables, validated with Zod
    tenants.ts        AUTH_ALLOWED_TENANTS parsing and checks
    avatars.ts        moves the Microsoft photo to storage, through the service the plugin sets
    openapi.ts        the OpenAPI document: one entry per route, schemas from shared/schemas/
    site.ts           absolute URLs on this site, from BETTER_AUTH_URL
    *-env.ts          one Zod-checked reader per domain: mods, warden, images, bde

i18n/locales/         UI strings: en.json (default) and fr.json, with the same keys

shared/               code imported by both app/ and server/
  schemas/            Zod contracts: bodies, params and queries checked by the server, and
                      responses, whose types the app uses. All of them feed the API reference.
  utils/              auto-imported: school names by tenant ID, auth error codes, apps that can link,
                      Paris wall-clock time for forms (paris-time.ts)

modules/              local Nuxt modules: scalar.ts serves Scalar's script for /api/docs
public/               static files served as-is
test/
  unit/               plain Node tests (Vitest project "unit")
  nuxt/               tests that need the Nuxt runtime (Vitest project "nuxt")
docs/                 project documentation
.github/workflows/    CI
```

Root files: `nuxt.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `compose.yaml` (local PostgreSQL), `.env.example`, `renovate.json`, and `pnpm-workspace.yaml` (pnpm settings, audit exceptions and security overrides).

## Server rules

- Import framework helpers (`defineEventHandler`, `createError`, `readBody`, ...) from `nuxt/server`, because Nitro auto-imports are off in compatibility mode 5. Exports from `server/utils/` are still auto-imported. `shared/utils/` is auto-imported in the app only, so server code imports it from `#shared/utils/...`.
- Don't use `readValidatedBody` or `getRouterParams` from `nuxt/server` for now. In Nuxt 4.6 they pull `app.config.ts` into the server bundle, and every request then fails with `defineAppConfig is not defined`. Use `parseBody(event, schema)` and `parseParams(event, schema)` from `server/utils/validation.ts` instead: they check with the shared Zod schema and throw a 400 or a 404.
- Services take explicit inputs (such as `actorId`), run multi-step writes in a transaction, and throw typed errors (`NotFoundError`, `ForbiddenError`, `ConflictError`). These are turned into HTTP errors in one place.
- Every team action checks that the team belongs to the event and that the user is registered. Size limits come from the event and are enforced inside the transaction, backed by a unique `(eventId, userId)` constraint.
- Every route is documented in `server/lib/openapi.ts`: who may call it, its parameters, body, response and problem codes. `test/unit/openapi.test.ts` fails when a file in `server/api/` has no entry. Define response shapes as Zod schemas in `shared/schemas/` and infer their types, so the reference can't drift from the code. The reference is at `/api/docs`, and Better Auth's routes are added from its own schema.
- Lists expose public profiles only (name, avatar). Email appears only on the user's own account endpoint, and in admin routes, where admins need it to find people.
- Files: metadata goes in a `files` table and content in Nitro storage on the VPS's disk (object storage later, if ever), behind the files service. Files are served with `Content-Type`, `nosniff` and long caching. Uploads are checked for type and size. Event images already work this way, without the table: see docs/events.md.

A handler looks like this:

```ts
// server/api/events/[eventId]/teams/[teamId]/members.post.ts
import { defineEventHandler } from 'nuxt/server';
import { teamParams } from '#shared/schemas/teams';
import { teamService } from '~~/server/services/teams';

// requireUser and parseParams come from server/utils/, so they're auto-imported.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { eventId, teamId } = parseParams(event, teamParams);
  return teamService.join({ actorId: user.id, eventId, teamId });
});
```

## Client rules

- Rely on auto-imports for Vue, Nuxt composables and Nuxt UI components. Import Zod schemas from `#shared/schemas/...` explicitly.
- Reads: `useFetch` with an explicit key, in setup only, one request per page.
- Writes: plain async functions using `$fetch` that throw. The component shows the toast.
- Forms: Nuxt UI `UForm` with the shared Zod schema.
- Modals: Nuxt UI `useOverlay()` with typed props. Share state only through `useState()`.

## Left out on purpose

- Nuxt Layers per domain: more structure than six domains need.
- A separate repository layer: Drizzle already is one.
