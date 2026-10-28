import { createError, defineEventHandler } from 'nuxt/server';

import { createLimiter } from '~~/server/lib/rate-limit';
import {
  acceptsApiKey,
  rulesFor,
  rulesForApiKey,
  rulesForMode,
} from '~~/server/lib/rate-limit-rules';
import { rateLimitModeService } from '~~/server/services/rate-limit-mode';
import { apiKeyOfRequest } from '~~/server/utils/api-key';
import { getAuthSession } from '~~/server/utils/auth';
import { clientIp } from '~~/server/utils/client-ip';

// Rate limits for /api and /go, from the table in server/lib/rate-limit-rules.ts.

const limiters = new Map<string, ReturnType<typeof createLimiter>>();

export default defineEventHandler(async (event) => {
  const { method, url } = event.req;
  const path = new URL(url, 'http://localhost').pathname;
  // Routes that are never limited (health, auth, pages) don't wait for the mode.
  if (rulesFor(method, path).length === 0) return;
  const mode = await rateLimitModeService.current();
  if (mode === 'off') return;
  // A valid API key is limited by its own id, and not by IP or account. An unknown one is
  // limited like any caller, and the route refuses it.
  const apiKey = acceptsApiKey(path) ? await apiKeyOfRequest(event) : null;
  const rules = apiKey ? rulesForApiKey(mode, method) : rulesForMode(mode, method, path);
  if (rules.length === 0) return;

  const ip = clientIp(event);
  // Looked up once, and only when a per-account rule applies.
  let userId: string | null | undefined;

  for (const rule of rules) {
    let key = ip;
    if (rule.by === 'key' && apiKey) key = `key:${apiKey.id}`;
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
