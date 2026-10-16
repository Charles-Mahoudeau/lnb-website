# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This is the LNB website v2: a from-scratch rebuild in a new repository. The v1 repo is private and archived. Use it as a reference only, and don't port its code or features by default.

Plan doc (the source of truth for scope and stack rationale): https://claude.ai/code/artifact/832685bb-1191-4795-b2c9-8b1d872f0e21

The repository setup step of the plan is done: Nuxt UI starter (stripped down), ESLint and Prettier, Husky and lint-staged, Vitest, CI, Renovate, and Compose with PostgreSQL. The spike is in progress: Drizzle and Better Auth with Microsoft sign-in and the tenant allowlist are in place (see `docs/authentication.md`). Still to do: real logins from the three schools and a refused tenant, and the Coolify deploy.

The admin area (`/admin`, sidebar layout) was started ahead of the plan's "After v2" item: Overview, Users, Warden and Mods are in place. Mods manages the Minecraft mod list at `/minecraft/mod-list` (see `docs/mods.md`). Feature flags switch a feature or part of one off from `/admin/flags` (see `docs/feature-flags.md`: a new feature that can misbehave gets a flag). Events, Files and Push each get a section as they're built, not before.

The target file structure and the server and client rules are in `docs/architecture.md`. Follow that layout when adding code.

## Commands

- `docker compose up -d`: start local PostgreSQL (see `compose.yaml`, `.env.example`)
- `pnpm db:migrate`: apply migrations. `pnpm db:generate --name <change>` creates one from `server/db/schema/`, and `pnpm db:studio` browses the database.
- `pnpm dev`: dev server on http://localhost:3000
- `pnpm build`, then `node .output/server/index.mjs`: production build and run
- `/api/docs`: the API reference (Scalar), built from `server/lib/openapi.ts`. A new route needs an entry there, or `test/unit/openapi.test.ts` fails.
- `pnpm lint` / `pnpm lint:fix`: ESLint (`@nuxt/eslint`, stylistic rules off)
- `pnpm format` / `pnpm format:check`: Prettier, which owns all formatting
- `pnpm typecheck`: `nuxt typecheck` (vue-tsc)
- `pnpm test`: all Vitest projects. `unit` (`test/unit/**`, plain Node) and `nuxt` (`test/nuxt/**`, Nuxt runtime with `mountSuspended`)
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
- Deployed with Coolify on an OVHcloud VPS. Uploads go to object storage.

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
- Use only the `main` branch. There is no preprod environment.
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
