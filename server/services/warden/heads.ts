import { and, eq, gt } from 'drizzle-orm';
import { defineCachedFunction } from 'nitropack/runtime';

import { db } from '~~/server/db';
import { deviceCode, minecraftAccount, wardenLinkRequest } from '~~/server/db/schema';

// Skin heads are fetched by the site and cached in Nitro storage (the warden-heads mount in
// nuxt.config.ts), so visitors never contact a skin service and the services aren't hit per view.

const SIZE = '64';
const TIMEOUT_MS = 5000;

async function download(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok || response.headers.get('content-type') !== 'image/png') return undefined;
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  } catch {
    return undefined;
  }
}

/**
 * The head as base64 PNG, from Crafatar, or mc-heads.net when Crafatar is down. Cracked
 * accounts have no skin with Mojang, so they get Steve. Cached for a day, refreshed in the
 * background after that.
 */
const fetchHead = defineCachedFunction(
  async (uuid: string, cracked: boolean): Promise<string | undefined> => {
    if (cracked) return download(`https://mc-heads.net/avatar/MHF_Steve/${SIZE}`);
    return (
      (await download(`https://crafatar.com/avatars/${uuid}?size=${SIZE}&overlay`)) ??
      (await download(`https://mc-heads.net/avatar/${uuid}/${SIZE}`))
    );
  },
  {
    name: 'head',
    base: 'warden-heads',
    maxAge: 24 * 60 * 60,
    swr: true,
    getKey: (uuid: string, cracked: boolean) => `${uuid}-${cracked ? 'cracked' : 'premium'}`,
    // A failed download isn't cached, so the next view tries again.
    validate: (entry) => typeof entry.value === 'string',
  },
);

/**
 * Whether the UUID is one the site knows: a linked account, or one in a pending link request.
 * Other UUIDs get no head, so this isn't an open proxy.
 */
async function known(uuid: string): Promise<{ cracked: boolean } | undefined> {
  const [account] = await db
    .select({ cracked: minecraftAccount.cracked })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, uuid));
  if (account) return account;
  const [request] = await db
    .select({ cracked: wardenLinkRequest.cracked })
    .from(wardenLinkRequest)
    .innerJoin(deviceCode, eq(deviceCode.id, wardenLinkRequest.deviceCodeId))
    .where(and(eq(wardenLinkRequest.minecraftUuid, uuid), gt(deviceCode.expiresAt, new Date())))
    .limit(1);
  return request;
}

/** The PNG head of a known account, or undefined. */
async function get(uuid: string): Promise<Buffer | undefined> {
  const account = await known(uuid);
  if (!account) return undefined;
  const base64 = await fetchHead(uuid, account.cracked);
  return base64 ? Buffer.from(base64, 'base64') : undefined;
}

export const wardenHeadService = { get };
