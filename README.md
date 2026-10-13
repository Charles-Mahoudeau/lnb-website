# La Nuit Blanche

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](LICENSE)

The La Nuit Blanche events website, for Epitech, e-artsup and ISEG students.

## Stack

Nuxt 4 (Nuxt 5 compatibility mode), Nuxt UI v4 on Tailwind 4, PostgreSQL, pnpm. Node and pnpm versions are pinned with [Volta](https://volta.sh) in `package.json`.

## Quick start

```bash
volta install node pnpm   # picks up the versions pinned in package.json
docker compose up -d      # local PostgreSQL
cp .env.example .env
pnpm install
pnpm dev                  # http://localhost:3000
```

## Scripts

| Script                              | What it does                 |
| ----------------------------------- | ---------------------------- |
| `pnpm dev`                          | Development server           |
| `pnpm build`                        | Production build (`.output`) |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                       |
| `pnpm format` / `pnpm format:check` | Prettier                     |
| `pnpm typecheck`                    | Type checking                |
| `pnpm test` / `pnpm test:watch`     | Vitest                       |

## License

Copyright (C) 2026 Charles Mahoudeau

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).
