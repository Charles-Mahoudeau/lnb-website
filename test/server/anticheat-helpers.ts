import { randomBytes } from 'node:crypto';

import { db } from '~~/server/db';
import { user } from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { wardenClientService } from '~~/server/services/warden/client';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { wardenSessionService } from '~~/server/services/warden/sessions';

import type { AnticheatMode, AnticheatReportFileInput } from '#shared/schemas/anticheat';

// Shared setup of the anticheat service tests.

export const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NONCE = 'N'.repeat(43);

let counter = 0;
export const admin = `ac-admin-${String(Date.now())}`;

export function hash() {
  return randomBytes(64).toString('hex');
}

export function file(overrides: Partial<AnticheatReportFileInput> = {}): AnticheatReportFileInput {
  return { kind: 'mod', sha512: hash(), filename: 'some-mod.jar', ...overrides };
}

export async function setMode(mode: AnticheatMode) {
  await db
    .insert(user)
    .values({ id: admin, name: 'Admin', email: `${admin}@epitech.eu`, tenantId: EPITECH })
    .onConflictDoNothing();
  await anticheatSettingsService.update({ actorId: admin, mode });
}

/** A player in an open Warden session, through the real login. */
export async function session() {
  const id = `ac-${String(++counter)}-${String(Date.now())}`;
  await db
    .insert(user)
    .values({ id, name: 'Anticheat Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  const { device } = await db.transaction((tx) =>
    wardenDeviceService.create(tx, { userId: id, name: 'Laptop' }),
  );
  const client = {
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
    user: { id, name: 'Anticheat Tester', tenantId: EPITECH, role: null },
  };
  const username = `Ac${String(Date.now() % 1000000)}x${String(counter)}`.slice(0, 16);
  const { ticket } = await wardenClientService.joinTicket(client, {
    nonce: NONCE,
    username,
    link: true,
  });
  const result = await wardenSessionService.login({
    ticket,
    nonce: NONCE,
    uuid: offlineUuid(username),
    username,
  });
  if (result.result !== 'allowed') throw new Error('expected the login to be allowed');
  return { userId: id, sessionId: result.sessionId };
}
