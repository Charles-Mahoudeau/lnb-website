import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { user, wardenAppeal, wardenAudit, wardenBan, wardenNote } from '~~/server/db/schema';
import { wardenResetService } from '~~/server/services/warden/reset';

// The anticheat reaches the mod catalog, which caches through Nitro.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

async function setup() {
  const id = `sanctions-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  await db
    .insert(user)
    .values({ id, name: 'Sanctions', email: `${id}@epitech.eu`, tenantId: EPITECH });
  const [ban] = await db
    .insert(wardenBan)
    .values({ userId: id, reason: 'x', source: 'web' })
    .returning({ id: wardenBan.id });
  await db.insert(wardenAppeal).values({ banId: ban!.id, body: 'sorry' });
  await db.insert(wardenNote).values({ userId: id, kind: 'warning', body: 'x', source: 'web' });
  return id;
}

describe('the sanctions reset', () => {
  it('asks for the sentence', async () => {
    const id = await setup();
    await expect(
      wardenResetService.resetSanctions({ source: 'web', userId: id }, 'reset the sanctions'),
    ).rejects.toMatchObject({ data: { problem: 'confirmMismatch' } });
  });

  it('deletes the bans in force, their appeals and the notes, and audits it', async () => {
    const id = await setup();
    await wardenResetService.resetSanctions({ source: 'web', userId: id }, ' Reset all sanctions ');
    expect(await db.select().from(wardenBan).where(eq(wardenBan.userId, id))).toEqual([]);
    expect(await db.select().from(wardenNote).where(eq(wardenNote.userId, id))).toEqual([]);
    expect(await db.select().from(wardenAppeal)).toEqual([]);
    const audits = await db.select().from(wardenAudit).where(eq(wardenAudit.actorUserId, id));
    expect(audits.map((entry) => entry.action)).toContain('warden.resetSanctions');
  });
});
