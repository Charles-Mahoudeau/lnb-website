import { anticheatAlert } from '~~/server/db/schema';

import type { Tx } from './shared';

import type { AnticheatAlertKind } from '#shared/schemas/anticheat';

/**
 * Opens an alert for the admins. One that is still open for the same kind, player and file is not
 * opened twice. Returns whether a new one was created.
 */
async function raise(
  tx: Tx,
  alert: {
    kind: AnticheatAlertKind;
    userId?: string | null;
    sha512?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<boolean> {
  const created = await tx
    .insert(anticheatAlert)
    .values({
      kind: alert.kind,
      userId: alert.userId ?? null,
      sha512: alert.sha512 ?? null,
      data: alert.data ?? {},
    })
    // The partial unique index on open alerts.
    .onConflictDoNothing()
    .returning({ id: anticheatAlert.id });
  return created.length > 0;
}

export const anticheatAlertService = { raise };
