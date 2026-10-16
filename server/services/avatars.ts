import { createHash } from 'node:crypto';

import { like } from 'drizzle-orm';
import { useStorage } from 'nitropack/runtime';

import { db } from '~~/server/db';
import { user } from '~~/server/db/schema';

// Profile photos from Microsoft, kept in Nitro storage (the avatars mount in nuxt.config.ts).
// Each one is stored under the SHA-256 of its bytes, so its URL never changes meaning and can be
// cached for good. user.image holds the URL. A new photo gets a new key, and prune() removes
// the ones no account uses any more.

const URL_PREFIX = '/api/avatars/';
// A photo stored this recently may belong to a sign-in still in progress, whose user row
// doesn't point to it yet.
const PRUNE_GRACE_MS = 60 * 60 * 1000;

function storage() {
  return useStorage<string>('avatars');
}

async function save(bytes: Buffer): Promise<string> {
  const key = createHash('sha256').update(bytes).digest('hex');
  await storage().setItem(key, bytes.toString('base64'));
  return URL_PREFIX + key;
}

async function get(key: string): Promise<Buffer | undefined> {
  const data = await storage().getItem(key);
  return data ? Buffer.from(data, 'base64') : undefined;
}

/** Removes photos no account points to any more. Returns how many were removed. */
async function prune(now = new Date()): Promise<number> {
  const keys = await storage().getKeys();
  const rows = await db
    .select({ image: user.image })
    .from(user)
    .where(like(user.image, `${URL_PREFIX}%`));
  const used = new Set(rows.map((row) => row.image?.slice(URL_PREFIX.length)));
  let removed = 0;
  for (const key of keys) {
    if (used.has(key)) continue;
    const { mtime } = await storage().getMeta(key);
    if (mtime && now.getTime() - new Date(mtime).getTime() < PRUNE_GRACE_MS) continue;
    await storage().removeItem(key);
    removed++;
  }
  return removed;
}

export const avatarService = { save, get, prune };
