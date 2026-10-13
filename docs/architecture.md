# Architecture

The server has three layers: thin handlers, services that own the business rules, and Drizzle. One set of Zod contracts is shared with the client. Pages stay thin, with one composable per resource. There is no mapper layer: queries select exactly what the response needs.

Folders marked _(planned)_ don't exist yet. Create them as the work reaches them, following this layout.

## File structure

```
app/                  Nuxt app (client and SSR)
  app.vue             root layout: header, main, footer
  assets/css/main.css Tailwind and Nuxt UI entry point
  pages/              thin: one composable call, then components
  components/         (planned) by domain: events/ teams/ account/ layout/
                      Primitives come from Nuxt UI; don't rebuild them.
  composables/        (planned) one per resource: useEvent, useEventTeams, useAccount
  middleware/         (planned) auth.global.ts (public pages opt out), admin.ts

server/               (planned) Nitro server, picked up by Nuxt automatically
  api/                handlers of 5 to 10 lines: guard, validate, call a service, return
  services/           business rules, one file per domain:
                      events, registrations, teams, files, users, push
  db/
    schema/           Drizzle tables, one file per domain
    migrations/       generated and committed
    seed.ts
  tasks/              scheduled jobs: event reminders, inactive-account cleanup
  utils/              auth guards (requireUser, requireAdmin), typed errors, param schemas
  lib/auth.ts         Better Auth setup: Microsoft provider, tenant allowlist, admin plugin

shared/               (planned) code imported by both app/ and server/
  schemas/            Zod contracts used by server validation and client forms

public/               static files served as-is
test/
  unit/               plain Node tests (Vitest project "unit")
  nuxt/               tests that need the Nuxt runtime (Vitest project "nuxt")
docs/                 project documentation
.github/workflows/    CI
```

Root files: `nuxt.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `compose.yaml` (local PostgreSQL), `.env.example`, `renovate.json`, and `pnpm-workspace.yaml` (pnpm settings, audit exceptions and security overrides).

## Server rules

- Services take explicit inputs (such as `actorId`), run multi-step writes in a transaction, and throw typed errors (`NotFoundError`, `ForbiddenError`, `ConflictError`). These are turned into HTTP errors in one place.
- Every team action checks that the team belongs to the event and that the user is registered. Size limits come from the event and are enforced inside the transaction, backed by a unique `(eventId, userId)` constraint.
- Lists expose public profiles only (name, avatar). Email appears only on the user's own account endpoint.
- Files: metadata goes in a `files` table and content in object storage, behind the files service. Files are served with `Content-Type`, `nosniff` and long caching. Uploads are checked for type and size.

A handler looks like this:

```ts
// server/api/events/[eventId]/teams/[teamId]/members.post.ts
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { eventId, teamId } = await getValidatedRouterParams(event, teamParams.parse)
  return teamService.join({ actorId: user.id, eventId, teamId })
})
```

## Client rules

- Reads: `useFetch` with an explicit key, in setup only, one request per page.
- Writes: plain async functions using `$fetch` that throw. The component shows the toast.
- Forms: Nuxt UI `UForm` with the shared Zod schema.
- Modals: Nuxt UI `useOverlay()` with typed props. Share state only through `useState()`.

## Left out on purpose

- Nuxt Layers per domain: more structure than six domains need.
- A separate repository layer: Drizzle already is one.
