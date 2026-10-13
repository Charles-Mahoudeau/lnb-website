import { defineEventHandler } from 'nuxt/server';

// Liveness check for Coolify. No database check yet: Drizzle isn't set up.
export default defineEventHandler((event) => {
  event.res.headers.set('Cache-Control', 'no-store');
  return { status: 'ok' };
});
