import { eq } from 'drizzle-orm';
import { createError, defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { modpackMod } from '~~/server/db/schema';
import { modIconService } from '~~/server/services/mods/icons';

import { modpackIdParams } from '#shared/schemas/modpack';

// The icon is stored once and its address carries the key, so it is cached for a year.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'modIcons');
  const { id } = parseParams(event, modpackIdParams);
  const [row] = await db
    .select({ iconKey: modpackMod.iconKey })
    .from(modpackMod)
    .where(eq(modpackMod.id, id));
  const icon = row?.iconKey ? await modIconService.get(row.iconKey) : undefined;
  if (!icon) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
