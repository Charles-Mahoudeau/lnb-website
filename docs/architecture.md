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
  composables/        one per resource: useAuth, useLinkCode, later useEvent, useEventTeams, useAccount
  middleware/         auth.global.ts (public pages opt out with `auth: false`), later admin.ts
  utils/              small client helpers (safeRedirect, the Better Auth client), placeholder events
                      until the events service exists

server/               Nitro server, picked up by Nuxt automatically
  api/                handlers of 5 to 10 lines: guard, validate, call a service, return
    auth/[...all].ts  Better Auth's routes under /api/auth
  services/           business rules, one file per domain: links (app link codes), later
                      events, registrations, teams, files, users, push
  db/
    index.ts          Drizzle client (node-postgres)
    schema/           Drizzle tables, one file per domain. auth.ts is generated.
    migrations/       generated and committed
    seed.ts           (planned)
  tasks/              (planned) scheduled jobs: event reminders, inactive-account cleanup
  utils/              auth guards (requireUser, requireAdmin), later typed errors, param schemas
  lib/                code without Nuxt imports, loaded by the Better Auth CLI too:
    auth.ts           Better Auth setup: Microsoft provider, tenant allowlist, admin plugin
    auth-env.ts       auth environment variables, validated with Zod
    tenants.ts        AUTH_ALLOWED_TENANTS parsing and checks

i18n/locales/         UI strings: en.json (default) and fr.json, with the same keys

shared/               code imported by both app/ and server/
  schemas/            Zod contracts used by server validation and client forms
  utils/              auto-imported: school names by tenant ID, auth error codes, apps that can link

public/               static files served as-is
test/
  unit/               plain Node tests (Vitest project "unit")
  nuxt/               tests that need the Nuxt runtime (Vitest project "nuxt")
docs/                 project documentation
.github/workflows/    CI
```

Root files: `nuxt.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `compose.yaml` (local PostgreSQL), `.env.example`, `renovate.json`, and `pnpm-workspace.yaml` (pnpm settings, audit exceptions and security overrides).

## Server rules

- Import framework helpers (`defineEventHandler`, `getRouterParams`, `readBody`, ...) from `nuxt/server`, because Nitro auto-imports are off in compatibility mode 5. Exports from `server/utils/` and `shared/utils/` are still auto-imported.
- Don't use `readValidatedBody` from `nuxt/server` for now. In Nuxt 4.6 it pulls `app.config.ts` into the server bundle, and every request then fails with `defineAppConfig is not defined`. Use `readBody`, then `safeParse` with the shared schema, as in `server/api/link/approve.post.ts`.
- Services take explicit inputs (such as `actorId`), run multi-step writes in a transaction, and throw typed errors (`NotFoundError`, `ForbiddenError`, `ConflictError`). These are turned into HTTP errors in one place.
- Every team action checks that the team belongs to the event and that the user is registered. Size limits come from the event and are enforced inside the transaction, backed by a unique `(eventId, userId)` constraint.
- Lists expose public profiles only (name, avatar). Email appears only on the user's own account endpoint.
- Files: metadata goes in a `files` table and content in object storage, behind the files service. Files are served with `Content-Type`, `nosniff` and long caching. Uploads are checked for type and size.

A handler looks like this:

```ts
// server/api/events/[eventId]/teams/[teamId]/members.post.ts
import { defineEventHandler, getRouterParams } from 'nuxt/server';
import { teamParams } from '#shared/schemas/teams';
import { teamService } from '~~/server/services/teams';

// requireUser comes from server/utils/, so it's auto-imported.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { eventId, teamId } = teamParams.parse(getRouterParams(event));
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
