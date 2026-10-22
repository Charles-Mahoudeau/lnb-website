import { randomUUID } from 'node:crypto';

import { deviceCode } from '~~/server/db/schema';
import { generateDeviceCode, generateLinkCode } from '~~/server/lib/link-codes';

import type { Tx } from './shared';

/** The Better Auth client ID of every Warden code, so /link recognises them. */
export const WARDEN_CLIENT_ID = 'warden';
export const LINK_CODE_LIFETIME_SECONDS = 10 * 60;
export const POLL_INTERVAL_SECONDS = 5;

/** A Better Auth device code for Warden, so /link claims and expires it like any other. */
export async function insertDeviceCode(tx: Tx, expiresAt: Date) {
  // A million codes: retry on the rare clash with a live one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const values = {
      id: randomUUID(),
      deviceCode: generateDeviceCode(),
      userCode: generateLinkCode(),
      expiresAt,
      status: 'pending',
      pollingInterval: POLL_INTERVAL_SECONDS * 1000,
      clientId: WARDEN_CLIENT_ID,
    };
    const inserted = await tx
      .insert(deviceCode)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: deviceCode.id });
    if (inserted.length) return values;
  }
  throw new Error('Could not find a free link code');
}
