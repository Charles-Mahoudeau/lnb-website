import { dirname, resolve } from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { defineNitroPlugin } from 'nitropack/runtime';

import { db } from '~~/server/db';
import { setMigrationStatus } from '~~/server/utils/migration-status';

// Applies pending migrations at startup, so a deploy doesn't run new code on the old schema.
// Drizzle holds a Postgres advisory lock, so instances starting together don't collide. In
// production the SQL files sit next to the server entry, copied there by the `compiled` hook in
// nuxt.config.ts. Nitro doesn't wait for plugins, and a crash would take the site down, so a
// failure is logged and /api/health answers 503: with a health check on that route, Coolify keeps
// the previous container instead of switching to this one.
export default defineNitroPlugin(() => {
  const migrationsFolder = import.meta.dev
    ? resolve('server/db/migrations')
    : resolve(dirname(process.argv[1] ?? ''), 'migrations');
  migrate(db, { migrationsFolder }).then(
    () => {
      setMigrationStatus('done');
    },
    (error: unknown) => {
      console.error('[migrate] Migration failed:', error);
      setMigrationStatus('failed');
    },
  );
});
