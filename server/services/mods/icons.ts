import { createHash, randomUUID } from 'node:crypto';

import { defineCachedFunction, useStorage } from 'nitropack/runtime';

import { isCatalogIconUrl } from './rules';

// Mod icons are downloaded once, when the mod is added, and kept in Nitro storage (the
// mod-icons mount in nuxt.config.ts). Search results' icons go through the site too, cached for
// a day. The page shows them from this site, never from the source.

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

interface StoredIcon {
  type: string;
  data: string;
}

function storage() {
  return useStorage<StoredIcon>('mod-icons');
}

/** An image of an allowed type and size, or undefined. */
async function download(url: string): Promise<StoredIcon | undefined> {
  if (!url.startsWith('https://')) return undefined;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!response.ok || !TYPES.has(type)) return undefined;
    if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return undefined;
    return { type, data: bytes.toString('base64') };
  } catch {
    return undefined;
  }
}

/**
 * Downloads an icon and stores it. Returns its key, or null when the icon can't be used (wrong
 * type, too big, unreachable): the mod then shows its initials instead.
 */
async function save(url: string): Promise<string | null> {
  const icon = await download(url);
  if (!icon) return null;
  const key = randomUUID();
  await storage().setItem(key, icon);
  return key;
}

/** A search result's icon, from Modrinth's or CurseForge's image host only. */
const fetchCatalogIcon = defineCachedFunction(download, {
  name: 'mod-catalog-icon',
  base: 'mod-icons',
  maxAge: 24 * 60 * 60,
  swr: true,
  getKey: (url: string) => createHash('sha256').update(url).digest('hex'),
  // A failed download isn't cached, so the next view tries again.
  validate: (entry) => entry.value !== undefined,
});

async function catalog(url: string): Promise<{ type: string; bytes: Buffer } | undefined> {
  if (!isCatalogIconUrl(url)) return undefined;
  const icon = await fetchCatalogIcon(url);
  return icon ? { type: icon.type, bytes: Buffer.from(icon.data, 'base64') } : undefined;
}

async function get(key: string): Promise<{ type: string; bytes: Buffer } | undefined> {
  const icon = await storage().getItem(key);
  return icon ? { type: icon.type, bytes: Buffer.from(icon.data, 'base64') } : undefined;
}

/**
 * Whether the icon at the URL differs from the stored one. An icon that can't be downloaded
 * counts as the same, so a source being down never looks like a change.
 */
async function differs(key: string | null, url: string): Promise<boolean> {
  const next = await download(url);
  if (!next) return false;
  const current = key ? await storage().getItem(key) : null;
  return current?.data !== next.data;
}

async function remove(key: string | null): Promise<void> {
  if (key) await storage().removeItem(key);
}

export const modIconService = { save, get, remove, catalog, differs };
