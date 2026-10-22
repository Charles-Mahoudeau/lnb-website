import { getRequestIP } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

/**
 * The caller's IP. Behind Coolify's proxy it is the last `X-Forwarded-For` entry, the one the
 * proxy itself added: earlier entries come from the client and can be forged. Without the header
 * (local development) it is the socket's address.
 */
export function clientIp(event: RequestEvent): string {
  const forwarded = event.req.headers.get('x-forwarded-for');
  const last = forwarded?.split(',').at(-1)?.trim();
  return last || getRequestIP(event) || 'unknown';
}
