# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This is the LNB website v2: a from-scratch rebuild in a new repository. The v1 repo is private and archived. Use it as a reference only, and don't port its code or features by default.

Plan doc (the source of truth for scope and stack rationale): https://claude.ai/code/artifact/832685bb-1191-4795-b2c9-8b1d872f0e21

The repository setup step of the plan is done: Nuxt UI starter (stripped down), ESLint and Prettier, Husky and lint-staged, Vitest, CI, Renovate, and Compose with PostgreSQL. The spike is in progress: Drizzle and Better Auth with Microsoft sign-in and the tenant allowlist are in place (see `docs/authentication.md`). Still to do: real logins from the three schools and a refused tenant, and the Coolify deploy.

The admin (`/admin`) was rebuilt around a few rooms (see `docs/plans/admin-redesign.md`, the source of truth for its navigation, roles and URLs). The sidebar has Home (the inbox of what needs an answer), People, Short links and Site (Team, Partners, Gamesplanet), then an Events group (Events, Posters, Notifications, Partner events), then a Minecraft group (Moderation, Playtime, Anticheat, Modpack, Economy, Quests), and Settings in its footer. Each entry shows what its role may open, and each tab is its own URL; the group is never in the URL. Every person has one page, `/admin/people/:userId/:tab` (see `docs/people.md`), with Summary, Minecraft, Moderation, Playtime, Anticheat, LNBits, Events and Site account tabs that follow the viewer's role. Ctrl K searches people, pages, Settings sections and quick actions. Every change made from the admin, by the Minecraft server or by a nightly job goes to one audit table, read in Settings › Activity (see `docs/activity-log.md`). Old admin URLs redirect to the new ones. Modpack manages the mod vote at `/minecraft/mod-vote` (see `docs/mods.md`), and the launcher's Modlist. The public Mods page (`/minecraft/mods`, see `docs/mods-page.md`) lists what the launcher installs, read in the browser from the manifest, with logos stored on our side. Rate limiting has three modes (normal, event night, off), picked from `/admin/settings/rate-limit` (see `docs/rate-limiting.md`). Feature flags switch a feature or part of one off from `/admin/settings/flags` (see `docs/feature-flags.md`: a new feature that can misbehave gets a flag). Events (see `docs/events.md`) has its own `events-manager` role, registrations with a waitlist, an image picker, and a push to the BDE website. Push (see `docs/push.md`) sends opt-in notifications about events only, and has an admin section. The Minecraft map (`/minecraft/map`, see `docs/map.md`) shows the live map in a frame, at an address admins set in `/admin/settings/map`, and can be kept closed until a date (a countdown page shows meanwhile). The team page (`/team`, see `docs/team.md`) shows accounts the admins put in poles, with a Team section in the admin (`/admin/site/team`). The partners page (`/partners`, see `docs/partners.md`) lists sponsors, game partners and prize partners, with a Partners section in the admin (`/admin/site/partners`). Tournaments (see `docs/tournaments.md`) are an optional team mode on events: teams with a captain, invitations and requests, a waitlist of teams, and a Teams tab in the event admin (`/admin/events/:id/teams`). Short links (`/go/<id>`, see `docs/short-links.md`) are made in the admin, can be locked to signed-in people or some schools, count clicks and can record who clicked. Posters (`/admin/posters`, see `docs/posters.md`) lets events managers make A4 posters for events from six templates, saved in a shared library and exported as a PDF or PNG; each poster's QR code is a short link, so events managers get the whole Short links section. API keys (`/admin/settings/api-keys`, see `docs/api-keys.md`) let full admins give integrations scoped access to a few opted-in routes, with expiry, rotation, per-key rate limits and a kill-switch flag. The economy (`/minecraft/bank`, `/minecraft/baltop`, `/admin/economy`, see `docs/economy.md`) keeps the Minecraft server's LNBits on the site: personal and shared accounts, a double-entry ledger the server moves money through in one idempotent call, and an Economy section for the `economy-admin` role, where each shared account has its own page (`/admin/economy/accounts/:id`) and each personal account is the LNBits tab of its owner's Person page. Quests (`/minecraft/quests`, `/admin/quests/catalog`, see `docs/quests.md`) pay LNBits for personal tiers, server advancements by rank, community goals and flash races, sized by a nightly index of players' wealth. The anticheat (`/admin/anticheat/review`, see `docs/anticheat.md`) scores the files in players' Minecraft clients from Modrinth, CurseForge and admin decisions, keeps a trust score per account, and answers the Minecraft server with a verdict; it starts in `observe` mode, so nothing is enforced until an admin switches it. The playtime limit (see `docs/playtime.md`) caps how long players can be on the Minecraft server during restricted hours each week; the data, the five-second counting tick, `GET /api/playtime/me` and the Minecraft account page (`/minecraft/account`, which replaced `/minecraft/warden`) are built, and so is the enforcement (login denial, warnings, grace, kicks). It starts in `observe`, so nobody is denied, kicked or warned until an admin switches it to `enforce`, which waits for the mod to handle the new events. The admin is built (Rules, Closures and Live tabs, and the Playtime tab of the Person page); event mode is built too (an event can lift the limit for its days, for registered players or everyone); the nightly prune (`playtime:prune`) is built too. Server rules (`/minecraft/rules`, `/admin/moderation/rules`, see `docs/rules.md`) are structured categories and rules, edited by Warden admins, with stable anchors and computed numbers; warnings and bans can name them, keeping a snapshot; a `rules` flag hides the public page. The Gamesplanet promotion (see `docs/gamesplanet.md`) is an affiliate partnership: deals from Gamesplanet's own feeds, never their iframe banners. The data side is built (the catalog, best sellers and covers, with flags), and so are the public deals, the partners band and the admin section (ref code, pins); the home card, the event game (field and card), anonymous click counts through `/go/gp/<deal>` (the one analytics exception, approved for this partnership) and the footer row. Only the Gamesplanet pages' real-browser check remains. Ghost accounts (see `docs/ghost-accounts.md`) are accounts admins and events managers make for people who haven't signed in yet; the person takes the same account over at their first Microsoft sign-in, matched by email and school. Files (`/admin/modpack/files`, see `docs/files.md`) is the library of jars and assets for the Minecraft launcher: streamed uploads to the VPS volume, addressed by SHA-256 and downloadable without sign-in. The Modlist (`/admin/modpack/modlist`, see `docs/modpack.md`) is a separate list from the mod vote: each mod pinned to one file, with a manifest revision. A nightly check notes newer files and an admin adopts them. The vote's official list can be exported to it with a diff, and the launcher reads the public manifest at `/modpack/manifest.json`. The Prism wrapper jar reading it hasn't been verified.

The Minecraft download page (`/minecraft/download`, see `docs/downloads.md`) lists the downloads for new players: Prism as a link to its own site, with package manager commands on Linux and macOS, and PrismCracked and the instance zip from the Files library (a new `download` file kind), picked in `/admin/modpack/downloads`. Java is not a step (the launchers install it), only a collapsed Troubleshooting entry with the Temurin JRE link. It isn't verified in a real browser yet.

The Minecraft changelog (see `docs/changelog.md`) is posts about server changes, in English or French with an optional DeepL translation; the admin is built (`/admin/minecraft/changelog`, for Warden admins; no cover picker yet), the public pages (`/minecraft/changelog`, `/minecraft/changelog/:slug`), the Atom feed (`/minecraft/changelog.atom`) and the site's routes (`/api/changelog/posts*`) are built behind the `changelog` flag; the API for the mod (`/api/changelog/server/*`) is still to do.

The target file structure and the server and client rules are in `docs/architecture.md`. Follow that layout when adding code.

## Commands

- `docker compose up -d`: start local PostgreSQL (see `compose.yaml`, `.env.example`)
- `pnpm db:migrate`: apply migrations by hand. The server applies pending ones at startup (`server/plugins/migrate.ts`). If that fails it logs the error and stays up, and `/api/health` answers 503. Coolify needs its health check on `/api/health` for that to keep the previous container serving. `pnpm db:generate --name <change>` creates one from `server/db/schema/`, and `pnpm db:studio` browses the database.
- `pnpm dev`: dev server on http://localhost:3000
- `pnpm build`, then `node .output/server/index.mjs`: production build and run
- `/api/docs`: the API reference (Scalar), built from `server/lib/openapi.ts`. A new route needs an entry there, or `test/unit/openapi.test.ts` fails.
- `pnpm lint` / `pnpm lint:fix`: ESLint (`@nuxt/eslint`, stylistic rules off)
- `pnpm format` / `pnpm format:check`: Prettier, which owns all formatting
- `pnpm typecheck`: `nuxt typecheck` (vue-tsc)
- `pnpm test`: all Vitest projects. `unit` (`test/unit/**`, plain Node), `nuxt` (`test/nuxt/**`, Nuxt runtime with `mountSuspended`) and `db` (`test/db/**` and `test/server/**`, needs the Compose PostgreSQL running; it creates its own `lnb_test` database)
- Single test: `pnpm vitest run test/nuxt/app.test.ts`, or `pnpm vitest run -t "shows the site name"`. Use `--project unit` or `--project nuxt` to pick one project.

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, tests, build, `pnpm audit --prod` and gitleaks. Audit exceptions and security overrides live in `pnpm-workspace.yaml`, each with its reason. Re-check them when Nuxt is bumped.

## Stack

- Nuxt 4 in Nuxt 5 compatibility mode, with Nuxt UI v4 on Tailwind 4. The server still runs nitropack v2 on h3 v1, so Nitro v3-only features such as `useKV` aren't available.
- Auto-imports: app code relies on them, except for `shared/schemas/` (import from `#shared/schemas/...`) and `useServerHead`-style composables (import from `#app`). Compatibility mode 5 turns off Nitro auto-imports, so server code imports framework helpers such as `defineEventHandler` from `nuxt/server`. Our own exports from `server/utils/` are still auto-imported on the server, and `shared/utils/` in the app only (server code imports it from `#shared/utils/...`).
- `@nuxtjs/i18n` for English and French
- Better Auth with the Microsoft provider
- Drizzle on PostgreSQL
- Zod 4
- Standard VAPID Web Push
- pnpm, with Node 26 LTS pinned through Volta (not nvm)
- Deployed with Coolify on an OVHcloud VPS. Uploads are stored on the VPS's filesystem (Nitro `fs` storage under `.data/`), not in object storage, for now. Coolify needs `.data` on a persistent volume (see `docs/deployment.md`).

If a stack choice is challenged, re-check it against the plan doc's weighted criteria instead of falling back to what v1 used.

## Design

- Read `docs/design.md` before any UI work. It's the approved visual language ("Soft night": night navy, deep crimson for actions only, Unbounded headings, Figtree text). It wins over any skill's aesthetic advice, including `frontend-design`. Use that skill only to avoid generic patterns, never to invent a new palette, typeface or shape language.
- Build with Nuxt UI components and the tokens in `app/assets/css/main.css` and `app/app.config.ts`. Change a component's look globally in `app.config.ts`, not page by page. Check the result on `/styleguide` (dev only) in both color modes, and add new reusable patterns to it.
- ESLint (`better-tailwindcss/no-restricted-classes`) blocks arbitrary values, raw palette colors and shaded semantic colors. Don't disable it. Add a token instead, and update `docs/design.md` with it.
- To change the visual language, update `docs/design.md` first, with the user's approval.
- Frontend design always starts with a mock offering several propositions. The user reviews them before anything is implemented.

## Standing decisions

- The UI is in English and French, through `@nuxtjs/i18n`. Every user-facing string goes in both `i18n/locales/en.json` and `i18n/locales/fr.json`, never inline. The language is never in the URL: a first visit follows the browser language (English as the fallback), and the language picker on `/account` (next to the theme picker) keeps its choice in the `lnb_locale` cookie. Storing it on the account itself is still to do. Code, comments, docs and commits stay in English.
- Write "LNB", never "La LNB" (it would expand to "La La Nuit Blanche"). This holds in French and in English.
- There is no preprod environment.
- Don't use Redis. Don't add games or internal analytics or tracking. Don't bring back features the plan dropped.
- Sign-in is limited by a Microsoft tenant-ID allowlist: Epitech, e-artsup and ISEG.
- Accounts inactive for 24 months are deleted, by the nightly `users:delete-inactive` job. Accounts with a site or Warden ban in force are kept, so a ban can't be escaped by waiting.
- Backups come only from the VPS's daily backup. There are no off-site backups.
- License: AGPL-3.0-or-later. Contributions should carry a DCO sign-off.
- Install agent skills into `.claude/skills/` only, never `.agents/`. With the skills.sh CLI, use `npx skills add <owner/repo> -a claude-code --copy` so the files are real copies, not symlinks. Afterwards, check that no `.agents/` directory was created.

## Workflow

- For a full or complex feature, use the `grilling` skill (grill-me) to sharpen the feature's requirements before implementing, and have the user review the result.
- When using plan mode, end the plan by telling the user which Claude model and effort level would suit the implementation best: the best output for the least usage.

## Commits and pull requests

- Commit as you work, in atomic and descriptive commits, but ask the user whether to push them.
- Make atomic commits: one logical change per commit, so it can be reviewed and reverted on its own. Split unrelated changes, such as a feature and a docs fix, into separate commits.
- Write descriptive commit messages: a Conventional Commits subject (`feat:`, `fix:`, `docs:`, `chore:`...) that says what changed, and a body that explains why when the subject alone doesn't.
- Never add AI attribution: no `Co-Authored-By` line naming Claude or any other AI, and no "Generated with Claude Code" line in commits or pull requests.
