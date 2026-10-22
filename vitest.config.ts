import { fileURLToPath } from 'node:url';

import { defineVitestProject } from '@nuxt/test-utils/config';
import { defineConfig } from 'vitest/config';

import { testDatabaseUrl } from './test/db/database.ts';

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Services against a real PostgreSQL, in a throwaway database (test/db/README in
        // docs/architecture.md). Needs `docker compose up -d`, like the dev server.
        resolve: {
          alias: {
            '~~': root('.'),
            '#shared': root('shared'),
          },
        },
        test: {
          name: 'db',
          include: ['test/db/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/db/global-setup.ts'],
          env: { DATABASE_URL: testDatabaseUrl('lnb_test') },
          // One database, so files run one after the other.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          // The persistent module cache breaks the Nuxt environment on the second run.
          fsModuleCache: false,
        },
      }),
    ],
  },
});
