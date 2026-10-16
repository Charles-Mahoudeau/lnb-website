import { dirname, resolve } from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { defineNitroPlugin } from 'nitropack/runtime';

import { db } from '~~/server/db';

// Applies pending migrations at startup, so a deploy doesn't run new code on the old schema.
// Drizzle holds a Postgres advisory lock, so instances starting together don't collide. In
// production the SQL files sit next to the server entry, copied there by the `compiled` hook in
// nuxt.config.ts. Nitro doesn't wait for plugins, so a failed migration exits the process (the
// platform then keeps the previous container) instead of serving a half-migrated database.
export default defineNitroPlugin(() => {
  const migrationsFolder = import.meta.dev
    ? resolve('server/db/migrations')
    : resolve(dirname(process.argv[1] ?? ''), 'migrations');
  migrate(db, { migrationsFolder }).catch((error: unknown) => {
    console.error('[migrate] Migration failed:', error);
    process.exit(1);
  });
});
