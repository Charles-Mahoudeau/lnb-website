import { createHash, timingSafeEqual } from 'node:crypto';

import { createError } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { wardenEnv } from '~~/server/lib/warden-env';

/** The Minecraft server, by its bearer secret. Throws a 401 for anyone else. */
export function requireWardenServer(event: RequestEvent): void {
  const header = event.req.headers.get('authorization') ?? '';
  // Hashed first, so the comparison takes the same time whatever the length sent.
  const sent = sha256(header.replace(/^Bearer\s+/i, ''));
  if (!timingSafeEqual(sent, sha256(wardenEnv().WARDEN_SERVER_SECRET))) {
    throw createError({ status: 401, statusText: 'Unauthorized' });
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
