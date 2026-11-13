import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { adminAudit, user } from '~~/server/db/schema';
import { ghostService } from '~~/server/services/ghosts';
import { usersService } from '~~/server/services/users';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ISEG = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';

let counter = 0;
const next = () => `${String(++counter)}-${String(Date.now())}`;

async function actor() {
  const id = `actor-${next()}`;
  await db
    .insert(user)
    .values({ id, name: 'Admin', email: `${id}@epitech.eu`, tenantId: EPITECH, role: 'admin' });
  return id;
}

const body = (overrides: Partial<{ name: string; email: string; tenantId: string }> = {}) => ({
  name: 'Camille Martin',
  email: `camille-${next()}@epitech.eu`,
  tenantId: EPITECH,
  ...overrides,
});

const problem = (status: number, name: string): unknown =>
  expect.objectContaining({ status, data: { problem: name } });

describe('ghostService.create', () => {
  it('makes a ghost that can be taken over, and logs it', async () => {
    const actorId = await actor();
    const input = body();
    const ghost = await ghostService.create({ actorId, body: input });

    expect(ghost).toEqual({
      userId: expect.any(String) as string,
      name: 'Camille Martin',
      email: input.email,
      school: 'Epitech',
    });
    const [row] = await db.select().from(user).where(eq(user.id, ghost.userId));
    expect(row).toMatchObject({
      ghost: true,
      emailVerified: true,
      tenantId: EPITECH,
      image: null,
      role: null,
      lastSignInAt: null,
    });
    const audit = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, row!.id));
    expect(audit).toMatchObject([
      { action: 'user.ghostCreate', actorUserId: actorId, data: { email: input.email } },
    ]);
  });

  it('refuses an email an account already has, whatever its case', async () => {
    const actorId = await actor();
    const first = body();
    await ghostService.create({ actorId, body: first });
    await expect(ghostService.create({ actorId, body: first })).rejects.toMatchObject(
      problem(409, 'emailTaken'),
    );

    const realId = `real-${next()}`;
    await db
      .insert(user)
      .values({ id: realId, name: 'Real', email: `Real.${realId}@Epitech.eu`, tenantId: EPITECH });
    await expect(
      ghostService.create({
        actorId,
        body: body({ email: `real.${realId}@epitech.eu` }),
      }),
    ).rejects.toMatchObject(problem(409, 'emailTaken'));
  });

  it('makes only one when two admins make the same ghost at once', async () => {
    const actorId = await actor();
    const input = body();
    const results = await Promise.allSettled([
      ghostService.create({ actorId, body: input }),
      ghostService.create({ actorId, body: input }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.select().from(user).where(eq(user.email, input.email))).toHaveLength(1);
  });
});

describe('ghostService.update', () => {
  it('changes the name, email and school of a ghost, and logs the fields', async () => {
    const actorId = await actor();
    const ghost = await ghostService.create({ actorId, body: body() });
    const email = `new-${next()}@iseg.fr`;
    const updated = await ghostService.update({
      actorId,
      userId: ghost.userId,
      body: { name: 'Camille Durand', email, tenantId: ISEG },
    });
    expect(updated).toMatchObject({ name: 'Camille Durand', email, school: 'ISEG' });
    const audit = await db
      .select()
      .from(adminAudit)
      .where(eq(adminAudit.targetUserId, ghost.userId));
    expect(audit.map((a) => a.action).sort()).toEqual(['user.ghostCreate', 'user.ghostUpdate']);
    expect(audit.find((a) => a.action === 'user.ghostUpdate')?.data).toEqual({
      fields: ['name', 'email', 'tenantId'],
    });
  });

  it('refuses an email another account has, an unknown account, and an account that is no ghost', async () => {
    const actorId = await actor();
    const a = await ghostService.create({ actorId, body: body() });
    const b = await ghostService.create({ actorId, body: body() });
    await expect(
      ghostService.update({ actorId, userId: b.userId, body: { email: a.email } }),
    ).rejects.toMatchObject(problem(409, 'emailTaken'));
    await expect(
      ghostService.update({ actorId, userId: 'nobody', body: { name: 'X' } }),
    ).rejects.toMatchObject(problem(404, 'notFound'));
    // The person signed in and took it over: it is theirs now, not the admins'.
    await db.update(user).set({ ghost: false }).where(eq(user.id, b.userId));
    await expect(
      ghostService.update({ actorId, userId: b.userId, body: { name: 'X' } }),
    ).rejects.toMatchObject(problem(409, 'notGhost'));
    expect((await db.select().from(user).where(eq(user.id, b.userId)))[0]?.name).not.toBe('X');
  });
});

describe('ghosts among accounts', () => {
  it('lists ghosts, and filters them', async () => {
    const actorId = await actor();
    const ghost = await ghostService.create({ actorId, body: body({ name: 'Zzz Ghost List' }) });
    const all = await usersService.list({ role: 'any', status: 'all', q: 'Zzz Ghost List' });
    expect(all.items).toMatchObject([{ userId: ghost.userId, ghost: true, lastSignInAt: null }]);
    const onlyGhosts = await usersService.list({ role: 'any', status: 'ghost' });
    expect(onlyGhosts.items.every((item) => item.ghost)).toBe(true);
    expect(onlyGhosts.items.map((i) => i.userId)).toContain(ghost.userId);
    const none = await usersService.list({ role: 'any', status: 'banned', q: 'Zzz Ghost List' });
    expect(none.items).toHaveLength(0);
  });

  it('gives no roles to a ghost, even in bulk', async () => {
    const actorId = await actor();
    const ghost = await ghostService.create({ actorId, body: body() });
    const roles = { admin: true, wardenAdmin: false, eventsManager: false, economyAdmin: false };
    await expect(
      usersService.setRoles({ actorId, userId: ghost.userId, roles }),
    ).rejects.toMatchObject(problem(409, 'isGhost'));
    const result = await usersService.bulk({
      actorId,
      body: {
        action: 'roles',
        selection: { userIds: [ghost.userId] },
        roles: { role: 'events-manager', mode: 'add' },
      },
    });
    expect(result).toMatchObject({ applied: 0, skipped: 1 });
    expect((await db.select().from(user).where(eq(user.id, ghost.userId)))[0]?.role).toBeNull();
  });

  it('deletes a ghost with what is attached to it', async () => {
    const actorId = await actor();
    const ghost = await ghostService.create({ actorId, body: body() });
    await usersService.remove({ actorId, userId: ghost.userId });
    expect(await db.select().from(user).where(eq(user.id, ghost.userId))).toHaveLength(0);
  });
});
