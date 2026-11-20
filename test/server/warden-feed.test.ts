import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { user, wardenBan, wardenNote } from '~~/server/db/schema';
import { wardenFeedService } from '~~/server/services/warden/feed';

vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const id = `feed-${String(Date.now())}`;

beforeAll(async () => {
  await db
    .insert(user)
    .values({ id, name: 'Feed Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(wardenBan).values([
    { userId: id, reason: 'in force', source: 'web' },
    { userId: id, reason: 'lifted', source: 'web', revokedAt: new Date() },
    { userId: id, reason: 'ended', source: 'web', expiresAt: new Date(Date.now() - 1000) },
  ]);
  await db.insert(wardenNote).values([
    { userId: id, kind: 'note', body: 'a note', source: 'web' },
    { userId: id, kind: 'warning', body: 'a warning', source: 'web' },
  ]);
});

const mine = async (kind: 'all' | 'ban' | 'warning' | 'note') =>
  (await wardenFeedService.feed({ kind })).items.filter((row) => row.user.userId === id);

describe('the moderation feed', () => {
  it('lists bans in force only, and filters by kind', async () => {
    expect((await mine('ban')).map((row) => row.text)).toEqual(['in force']);
    expect((await mine('warning')).map((row) => row.text)).toEqual(['a warning']);
    expect((await mine('note')).map((row) => row.text)).toEqual(['a note']);
    expect((await mine('all')).map((row) => row.kind).sort()).toEqual(['ban', 'note', 'warning']);
  });
});
