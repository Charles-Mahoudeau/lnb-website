import { count, eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { minecraftAccount, user, wardenPlayer } from '~~/server/db/schema';
import { wardenEnv } from '~~/server/lib/warden-env';

import { generateServerToken, resolveMaxAccounts } from './rules';
import { wardenSettingsService } from './settings';
import type { Db } from './shared';

import { isServerToken } from '#shared/schemas/warden';

export function serverUrl(token: string): string {
  return `${token}.${wardenEnv().WARDEN_SERVER_HOST}`;
}

/** The player's Warden row, created with a token on first need. */
async function ensure(dbx: Db, userId: string) {
  await dbx
    .insert(wardenPlayer)
    .values({ userId, serverToken: generateServerToken() })
    .onConflictDoNothing({ target: wardenPlayer.userId });
  const [row] = await dbx.select().from(wardenPlayer).where(eq(wardenPlayer.userId, userId));
  return row!;
}

/** The LNB user whose address carries this token, or undefined. */
async function findByToken(token: string, dbx: Db = db) {
  if (!isServerToken(token)) return undefined;
  const [row] = await dbx
    .select({
      userId: user.id,
      name: user.name,
      tenantId: user.tenantId,
      role: user.role,
      showRealName: wardenPlayer.showRealName,
    })
    .from(wardenPlayer)
    .innerJoin(user, eq(user.id, wardenPlayer.userId))
    .where(eq(wardenPlayer.serverToken, token));
  return row;
}

/** How many accounts the player has linked, and may link. */
async function limit(dbx: Db, userId: string): Promise<{ used: number; max: number }> {
  const [player] = await dbx
    .select({ maxAccounts: wardenPlayer.maxAccounts })
    .from(wardenPlayer)
    .where(eq(wardenPlayer.userId, userId));
  const [linked] = await dbx
    .select({ used: count() })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.userId, userId));
  const settings = await wardenSettingsService.get(dbx);
  return {
    used: linked?.used ?? 0,
    max: resolveMaxAccounts(player?.maxAccounts, settings.defaultMaxAccounts),
  };
}

export const wardenPlayerService = { ensure, findByToken, limit };
