import { db } from '~~/server/db';
import { mapSetting } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { DEFAULT_MAP_URL } from '#shared/schemas/map';
import type { MapAdminView, MapPublicView, MapStatusView } from '#shared/schemas/map';

async function stored(): Promise<string | null> {
  const [setting] = await db.select().from(mapSetting);
  return setting?.url ?? null;
}

async function getPublic(): Promise<MapPublicView> {
  return { url: (await stored()) ?? DEFAULT_MAP_URL };
}

// A browser can't read the status of a page shown in a frame, so the server asks the map. The
// answer is kept for 10 seconds, so a crowd of visitors makes one request.
const STATUS_TTL_MS = 10_000;
const STATUS_TIMEOUT_MS = 5_000;
let cached: { url: string; at: number; value: MapStatusView } | null = null;

async function getStatus(): Promise<MapStatusView> {
  const { url } = await getPublic();
  if (cached && cached.url === url && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;
  let value: MapStatusView;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    void response.body?.cancel();
    value = { ok: response.status === 200, status: response.status };
  } catch {
    value = { ok: false, status: null };
  }
  cached = { url, at: Date.now(), value };
  return value;
}

async function getAdmin(): Promise<MapAdminView> {
  return { url: await stored(), defaultUrl: DEFAULT_MAP_URL };
}

async function setUrl(input: { actorId: string; url: string | null }): Promise<MapAdminView> {
  const { url } = input;
  cached = null;
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

export const mapService = { getPublic, getStatus, getAdmin, setUrl };
