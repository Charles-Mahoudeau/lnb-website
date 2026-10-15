import { randomUUID } from 'node:crypto';

import { useStorage } from 'nitropack/runtime';

// Mod icons are downloaded once, when the mod is added, and kept in Nitro storage (the
// mod-icons mount in nuxt.config.ts). The page shows them from this site, never from the source.

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

/**
 * Downloads an icon and stores it. Returns its key, or null when the icon can't be used (wrong
 * type, too big, unreachable): the mod then shows its initials instead.
 */
async function save(url: string): Promise<string | null> {
  if (!url.startsWith('https://')) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!response.ok || !TYPES.has(type)) return null;
    if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    const key = randomUUID();
    await storage().setItem(key, { type, data: bytes.toString('base64') });
    return key;
  } catch {
    return null;
  }
}

async function get(key: string): Promise<{ type: string; bytes: Buffer } | undefined> {
  const icon = await storage().getItem(key);
  return icon ? { type: icon.type, bytes: Buffer.from(icon.data, 'base64') } : undefined;
}

async function remove(key: string | null): Promise<void> {
  if (key) await storage().removeItem(key);
}

export const modIconService = { save, get, remove };
