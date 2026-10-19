import { db } from '~~/server/db';
import { pushSetting } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { PUSH_DEFAULT_SETTINGS } from '#shared/schemas/push';
import type { PushSettings } from '#shared/schemas/push';

// The admin settings of push: the weekly limit that triggers warnings, how long the prompt
// stays quiet after "Not now", and the quiet hours that hold new-event announcements (which can
// be switched off). No row means the defaults.

async function get(): Promise<PushSettings> {
  const [row] = await db.select().from(pushSetting);
  if (!row) return PUSH_DEFAULT_SETTINGS;
  return {
    weeklyCap: row.weeklyCap,
    silenceDays: row.silenceDays === 7 || row.silenceDays === 30 ? row.silenceDays : null,
    quietEnabled: row.quietEnabled,
    quietFrom: row.quietFrom,
    quietUntil: row.quietUntil,
  };
}

async function set(input: { actorId: string; settings: PushSettings }): Promise<void> {
  const { weeklyCap, silenceDays, quietEnabled, quietFrom, quietUntil } = input.settings;
  await db.transaction(async (tx) => {
    await tx
      .insert(pushSetting)
      .values({ id: 1, weeklyCap, silenceDays, quietEnabled, quietFrom, quietUntil })
      .onConflictDoUpdate({
        target: pushSetting.id,
        set: { weeklyCap, silenceDays, quietEnabled, quietFrom, quietUntil },
      });
    await adminAuditService.record(tx, {
      action: 'push.settings',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { weeklyCap, silenceDays, quietEnabled, quietFrom, quietUntil },
    });
  });
}

export const pushSettingsService = { get, set };
