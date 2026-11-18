import { db } from '~~/server/db';
import { mapSetting } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { DEFAULT_MAP_URL } from '#shared/schemas/map';
import type { MapAdminView, MapPublicView } from '#shared/schemas/map';

async function stored(): Promise<string | null> {
  const [setting] = await db.select().from(mapSetting);
  return setting?.url ?? null;
}

async function getPublic(): Promise<MapPublicView> {
  return { url: (await stored()) ?? DEFAULT_MAP_URL };
}

async function getAdmin(): Promise<MapAdminView> {
  return { url: await stored(), defaultUrl: DEFAULT_MAP_URL };
}

async function setUrl(input: { actorId: string; url: string | null }): Promise<MapAdminView> {
  const { url } = input;
  await db.transaction(async (tx) => {
    await tx
      .insert(mapSetting)
      .values({ id: 1, url })
      .onConflictDoUpdate({ target: mapSetting.id, set: { url } });
    await adminAuditService.record(tx, {
      action: 'map.settings',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { url },
    });
  });
  return { url, defaultUrl: DEFAULT_MAP_URL };
}

export const mapService = { getPublic, getAdmin, setUrl };
