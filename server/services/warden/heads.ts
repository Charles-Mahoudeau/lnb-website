import { eq } from 'drizzle-orm';
import { defineCachedFunction } from 'nitropack/runtime';

import { db } from '~~/server/db';
import { minecraftAccount } from '~~/server/db/schema';

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
 * The head as base64 PNG. The server runs in offline mode, so no account has a skin with Mojang,
 * and every account gets Steve. Cached for a day, refreshed in the background after that.
 */
const fetchHead = defineCachedFunction(
  async (): Promise<string | undefined> =>
    download(`https://mc-heads.net/avatar/MHF_Steve/${SIZE}`),
  {
    name: 'head',
    base: 'warden-heads',
    maxAge: 24 * 60 * 60,
    swr: true,
    getKey: () => 'steve',
    // A failed download isn't cached, so the next view tries again.
    validate: (entry) => typeof entry.value === 'string',
  },
);

/** Whether the UUID is a linked account. Other UUIDs get no head, so this isn't an open proxy. */
async function known(uuid: string): Promise<boolean> {
  const [account] = await db
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, uuid));
  return account !== undefined;
}

/** The PNG head of a known account, or undefined. */
async function get(uuid: string): Promise<Buffer | undefined> {
  if (!(await known(uuid))) return undefined;
  const base64 = await fetchHead();
  return base64 ? Buffer.from(base64, 'base64') : undefined;
}

export const wardenHeadService = { get };
