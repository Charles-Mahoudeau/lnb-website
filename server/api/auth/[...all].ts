import { defineEventHandler } from 'nuxt/server';

import { auth } from '~~/server/lib/auth';

// Better Auth serves everything under /api/auth: sign-in, the Microsoft callback, session, sign-out.
export default defineEventHandler((event) => auth.handler(event.req));
