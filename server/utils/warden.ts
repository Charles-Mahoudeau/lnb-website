import { createHash, timingSafeEqual } from 'node:crypto';

import { createError } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { wardenEnv } from '~~/server/lib/warden-env';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { refuse } from '~~/server/services/warden/shared';

import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';

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

export interface WardenClient {
  device: { id: string; name: string; expiresAt: Date };
  user: { id: string; name: string; tenantId: string; role: string | null };
}

/**
 * The mod's device, by its bearer token. Only /api/warden/client/** accepts one. Throws a 401
 * for an unknown, expired or revoked token, and a 403 `schoolNotAllowed` when the owner's school
 * can't use Warden.
 */
export async function requireWardenClient(event: RequestEvent): Promise<WardenClient> {
  const path = new URL(event.req.url, 'http://localhost').pathname;
  const token = /^Bearer\s+(\S+)$/i.exec(event.req.headers.get('authorization') ?? '')?.[1];
  if (!path.startsWith('/api/warden/client/') || !token) {
    throw createError({ status: 401, statusText: 'Unauthorized' });
  }
  const found = await wardenDeviceService.authenticate(token);
  if (!found) throw createError({ status: 401, statusText: 'Unauthorized' });
  const app = getLinkApp('warden');
  if (app && !canLinkFromSchool(app, found.user.tenantId)) refuse(403, 'schoolNotAllowed');
  return {
    device: {
      id: found.device.id,
      name: found.device.name,
      expiresAt: found.device.expiresAt,
    },
    user: found.user,
  };
}
