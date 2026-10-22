import { createError, defineEventHandler } from 'nuxt/server';

import { createLimiter } from '~~/server/lib/rate-limit';
import { rulesFor, rulesForMode } from '~~/server/lib/rate-limit-rules';
import { rateLimitModeService } from '~~/server/services/rate-limit-mode';
import { getAuthSession } from '~~/server/utils/auth';
import { clientIp } from '~~/server/utils/client-ip';

// Rate limits for /api and /go, from the table in server/lib/rate-limit-rules.ts.

const limiters = new Map<string, ReturnType<typeof createLimiter>>();

export default defineEventHandler(async (event) => {
  const { method, url } = event.req;
  const path = new URL(url, 'http://localhost').pathname;
  // Routes that are never limited (health, auth, pages) don't wait for the mode.
  if (rulesFor(method, path).length === 0) return;
  const rules = rulesForMode(await rateLimitModeService.current(), method, path);
  if (rules.length === 0) return;

  const ip = clientIp(event);
  // Looked up once, and only when a per-account rule applies.
  let userId: string | null | undefined;

  for (const rule of rules) {
    let key = ip;
    if (rule.by === 'user') {
      userId ??= (await getAuthSession(event))?.user.id ?? null;
      if (userId) key = `user:${userId}`;
    }
    let limiter = limiters.get(rule.name);
    if (!limiter) {
      limiter = createLimiter(rule.points, rule.windowSeconds);
      limiters.set(rule.name, limiter);
    }
    const verdict = await limiter(key);
    if (!verdict.allowed) {
      event.res.headers.set('Retry-After', String(verdict.retryAfterSeconds));
      throw createError({
        status: 429,
        statusText: 'rateLimited',
        data: { problem: 'rateLimited' },
      });
    }
  }
});
