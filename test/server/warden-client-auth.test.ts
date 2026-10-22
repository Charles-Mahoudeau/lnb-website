import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { user } from '~~/server/db/schema';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { requireWardenClient } from '~~/server/utils/warden';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

beforeAll(async () => {
  await db
    .insert(user)
    .values([
      { id: 'auth-epitech', name: 'Epi Tech', email: 'auth-epitech@epitech.eu', tenantId: EPITECH },
      { id: 'auth-other', name: 'Other', email: 'auth-other@iseg.fr', tenantId: 'iseg' },
    ])
    .onConflictDoNothing();
});

function call(path: string, token?: string) {
  const headers = new Headers(token ? { authorization: `Bearer ${token}` } : {});
  return requireWardenClient({ req: new Request(`http://localhost${path}`, { headers }) } as never);
}

async function deviceOf(userId: string) {
  return db.transaction((tx) => wardenDeviceService.create(tx, { userId, name: 'Laptop' }));
}

describe('requireWardenClient', () => {
  it('accepts a device token on /api/warden/client/**', async () => {
    const { token, device } = await deviceOf('auth-epitech');
    const client = await call('/api/warden/client/me', token);
    expect(client.device.id).toBe(device.id);
    expect(client.user.id).toBe('auth-epitech');
  });

  it('refuses the token anywhere else', async () => {
    const { token } = await deviceOf('auth-epitech');
    for (const path of ['/api/warden/me', '/api/warden/server/login', '/api/warden/clients/me']) {
      await expect(call(path, token)).rejects.toMatchObject({ statusCode: 401 });
    }
  });

  it('refuses unknown tokens and missing headers', async () => {
    await expect(call('/api/warden/client/me', 'lnbw_nope')).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(call('/api/warden/client/me')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a revoked device', async () => {
    const { token, device } = await deviceOf('auth-epitech');
    await db.transaction((tx) =>
      wardenDeviceService.revoke(tx, {
        deviceId: device.id,
        userId: 'auth-epitech',
        actor: { source: 'web', userId: 'auth-epitech' },
      }),
    );
    await expect(call('/api/warden/client/me', token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('applies the school rules with a 403', async () => {
    const { token } = await deviceOf('auth-other');
    await expect(call('/api/warden/client/me', token)).rejects.toMatchObject({
      statusCode: 403,
      data: { problem: 'schoolNotAllowed' },
    });
  });
});
