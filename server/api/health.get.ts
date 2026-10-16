import { sql } from 'drizzle-orm';
import { createError, defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { getMigrationStatus } from '~~/server/utils/migration-status';

function unavailable(problem: 'migrating' | 'migrationFailed' | 'database'): never {
  throw createError({ status: 503, statusText: problem, data: { problem } });
}

// Health check for Coolify: 200 once the startup migration is done and the database answers, 503
// before that. Coolify only switches to a new container when this passes, so a failed migration
// leaves the previous one serving. The problem is a fixed word: the details are in the server log.
export default defineEventHandler(async (event) => {
  event.res.headers.set('Cache-Control', 'no-store');
  const migration = getMigrationStatus();
  if (migration === 'running') unavailable('migrating');
  if (migration === 'failed') unavailable('migrationFailed');
  try {
    await db.execute(sql`select 1`);
  } catch {
    unavailable('database');
  }
  return { status: 'ok' };
});
