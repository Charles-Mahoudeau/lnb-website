import { db } from '~~/server/db';
import { mapSetting } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';

import { DEFAULT_MAP_URL } from '#shared/schemas/map';
import type {
  MapAdminView,
  MapPublicView,
  MapSettingsBody,
  MapStatusView,
} from '#shared/schemas/map';

type Row = typeof mapSetting.$inferSelect;

async function row(): Promise<Row | null> {
  const [setting] = await db.select().from(mapSetting);
  return setting ?? null;
}

/** Whether visitors can't see the map yet. */
function isLocked(setting: Row | null, now = Date.now()): boolean {
  if (!setting || setting.mode === 'open') return false;
  if (setting.mode === 'closed') return true;
  return !setting.opensAt || setting.opensAt.getTime() > now;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * The map's address and whether it is closed. Visitors get no address while it is closed, and
 * admins keep it to preview the map.
 */
async function getPublic(options: { admin?: boolean } = {}): Promise<MapPublicView> {
  const setting = await row();
  const locked = isLocked(setting);
  const url = setting?.url ?? DEFAULT_MAP_URL;
  return {
    url: locked && !options.admin ? null : url,
    locked,
    opensAt: setting?.mode === 'date' ? iso(setting.opensAt) : null,
    lockedAt: locked ? iso(setting?.lockedAt ?? null) : null,
  };
}

// A browser can't read the status of a page shown in a frame, so the server asks the map. The
// answer is kept for 10 seconds, so a crowd of visitors makes one request.
const STATUS_TTL_MS = 10_000;
const STATUS_TIMEOUT_MS = 5_000;
let cached: { url: string; at: number; value: MapStatusView } | null = null;

async function getStatus(options: { admin?: boolean } = {}): Promise<MapStatusView> {
  const { url } = await getPublic(options);
  // Nothing to ask while the map is closed to this visitor.
  if (!url) return { ok: false, status: null };
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

function adminView(setting: Row | null): MapAdminView {
  return {
    url: setting?.url ?? null,
    defaultUrl: DEFAULT_MAP_URL,
    mode: setting?.mode ?? 'open',
    opensAt: iso(setting?.opensAt ?? null),
    lockedAt: iso(setting?.lockedAt ?? null),
  };
}

async function getAdmin(): Promise<MapAdminView> {
  return adminView(await row());
}

async function update(input: { actorId: string; body: MapSettingsBody }): Promise<MapAdminView> {
  const { body } = input;
  cached = null;
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(mapSetting).for('update');
    const mode = body.mode ?? current?.mode ?? 'open';
    const url = body.url === undefined ? (current?.url ?? null) : body.url;
    const opensAt =
      mode !== 'date' ? null : body.opensAt ? new Date(body.opensAt) : (current?.opensAt ?? null);
    // The progress counts from the moment the map was closed: keep it while it stays closed.
    const lockedAt =
      mode === 'open' ? null : (current?.mode !== 'open' && current?.lockedAt) || new Date();
    const values = { id: 1, url, mode, opensAt, lockedAt };
    const [saved] = await tx
      .insert(mapSetting)
      .values(values)
      .onConflictDoUpdate({ target: mapSetting.id, set: values })
      .returning();
    await auditService.record(tx, {
      action: 'settings.map',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { url, mode, opensAt: iso(opensAt) },
    });
    return adminView(saved ?? null);
  });
}

export const mapService = { getPublic, getStatus, getAdmin, update, isLocked };
