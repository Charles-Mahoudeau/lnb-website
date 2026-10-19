import { db } from '~~/server/db';
import { pushSetting } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { PUSH_DEFAULT_SETTINGS } from '#shared/schemas/push';
import type { PushSettings } from '#shared/schemas/push';

// The two admin settings of push: the weekly limit that triggers warnings, and how long the
// prompt stays quiet after "Not now". No row means the defaults.

async function get(): Promise<PushSettings> {
  const [row] = await db.select().from(pushSetting);
  if (!row) return PUSH_DEFAULT_SETTINGS;
  return {
    weeklyCap: row.weeklyCap,
    silenceDays: row.silenceDays === 7 || row.silenceDays === 30 ? row.silenceDays : null,
  };
}

async function set(input: { actorId: string; settings: PushSettings }): Promise<void> {
  const { weeklyCap, silenceDays } = input.settings;
  await db.transaction(async (tx) => {
    await tx
      .insert(pushSetting)
      .values({ id: 1, weeklyCap, silenceDays })
      .onConflictDoUpdate({ target: pushSetting.id, set: { weeklyCap, silenceDays } });
    await adminAuditService.record(tx, {
      action: 'push.settings',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { weeklyCap, silenceDays },
    });
  });
}

export const pushSettingsService = { get, set };
