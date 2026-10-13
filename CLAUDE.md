# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This is the LNB website v2: a from-scratch rebuild in a new repository. The v1 repo is private and archived. Use it as a reference only, and don't port its code or features by default.

Plan doc (the source of truth for scope and stack rationale): https://claude.ai/code/artifact/832685bb-1191-4795-b2c9-8b1d872f0e21

The repository setup step of the plan is done: Nuxt UI starter (stripped down), ESLint and Prettier, Husky and lint-staged, Vitest, CI, Renovate, and Compose with PostgreSQL. Next comes the spike: Better Auth with the Microsoft provider, Drizzle, and a Coolify deploy.

The target file structure and the server and client rules are in `docs/architecture.md`. Follow that layout when adding code.

## Commands

- `docker compose up -d`: start local PostgreSQL (see `compose.yaml`, `.env.example`)
- `pnpm dev`: dev server on http://localhost:3000
- `pnpm build`, then `node .output/server/index.mjs`: production build and run
- `pnpm lint` / `pnpm lint:fix`: ESLint (`@nuxt/eslint`, stylistic rules off)
- `pnpm format` / `pnpm format:check`: Prettier, which owns all formatting
- `pnpm typecheck`: `nuxt typecheck` (vue-tsc)
- `pnpm test`: all Vitest projects. `unit` (`test/unit/**`, plain Node) and `nuxt` (`test/nuxt/**`, Nuxt runtime with `mountSuspended`)
- Single test: `pnpm vitest run test/nuxt/app.test.ts`, or `pnpm vitest run -t "shows the site name"`. Use `--project unit` or `--project nuxt` to pick one project.

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, tests, build, `pnpm audit --prod` and gitleaks. Audit exceptions and security overrides live in `pnpm-workspace.yaml`, each with its reason. Re-check them when Nuxt is bumped.

## Stack

- Nuxt 4 in Nuxt 5 compatibility mode, with Nuxt UI v4 on Tailwind 4. The server still runs nitropack v2 on h3 v1, so Nitro v3-only features such as `useKV` aren't available.
- Auto-imports: app code relies on them, except for `shared/schemas/` (import from `#shared/schemas/...`) and `useServerHead`-style composables (import from `#app`). Compatibility mode 5 turns off Nitro auto-imports, so server code imports framework helpers such as `defineEventHandler` from `nuxt/server`. Our own exports from `server/utils/` and `shared/utils/` are still auto-imported.
- Better Auth with the Microsoft provider
- Drizzle on PostgreSQL
- Zod 4
- Standard VAPID Web Push
- pnpm, with Node 26 LTS pinned through Volta (not nvm)
- Deployed with Coolify on an OVHcloud VPS. Uploads go to object storage.

If a stack choice is challenged, re-check it against the plan doc's weighted criteria instead of falling back to what v1 used.

## Standing decisions

- English everywhere: code, UI and docs.
- Use only the `main` branch. There is no preprod environment.
- Don't use Redis. Don't add games or internal analytics or tracking. Don't bring back features the plan dropped.
- Sign-in is limited by a Microsoft tenant-ID allowlist: Epitech, e-artsup and ISEG.
- Accounts inactive for 24 months are deleted.
- Backups come only from the VPS's daily backup. There are no off-site backups.
- License: AGPL-3.0-or-later. Contributions should carry a DCO sign-off.
- Install agent skills into `.claude/skills/` only, never `.agents/`. With the skills.sh CLI, use `npx skills add <owner/repo> -a claude-code --copy` so the files are real copies, not symlinks. Afterwards, check that no `.agents/` directory was created.

## Commits and pull requests

- Never add AI attribution: no `Co-Authored-By` line naming Claude or any other AI, and no "Generated with Claude Code" line in commits or pull requests.
