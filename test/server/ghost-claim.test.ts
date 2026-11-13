import { createAuthEndpoint, dispatchAuthEndpoint } from 'better-auth/api';
import { handleOAuthUserInfo } from 'better-auth/oauth2';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  account,
  adminAudit,
  pushPreference,
  teamMember,
  teamPole,
  user,
} from '~~/server/db/schema';

import { ACCOUNT_CLAIM_REFUSED } from '#shared/utils/auth-errors';

// The real Better Auth sign-in step, as the Microsoft callback runs it, against a real database.
// See docs/ghost-accounts.md.
const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ISEG = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';

let context: unknown;
let counter = 0;

beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(40));
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'client');
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'secret');
  vi.stubEnv('AUTH_ALLOWED_TENANTS', `${EPITECH},${ISEG}`);
  const { auth } = await import('~~/server/lib/auth');
  context = await auth.$context;
});

function next(): string {
  return `${String(++counter)}-${String(Date.now())}`;
}

/**
 * The Microsoft callback for a person with this email, Microsoft object ID and school. It runs the
 * step of the callback that finds or makes the account, inside an endpoint context like the route's.
 */
async function signIn(person: { email: string; oid: string; tid?: string; name?: string }) {
  const tid = person.tid ?? EPITECH;
  const endpoint = createAuthEndpoint('/test/sign-in', { method: 'POST' }, async (c) =>
    handleOAuthUserInfo(c, {
      userInfo: {
        id: person.oid,
        email: person.email,
        name: person.name ?? 'Real Person',
        emailVerified: false,
        image: undefined,
        tenantId: tid,
      },
      account: { providerId: 'microsoft', accountId: person.oid },
      overrideUserInfo: true,
      source: {
        method: 'oauth',
        oauth: { providerId: 'microsoft', profile: { tid, email: person.email } },
      },
    } as never),
  );
  return (await dispatchAuthEndpoint(endpoint, { context, method: 'POST' } as never)) as Awaited<
    ReturnType<typeof handleOAuthUserInfo>
  >;
}

/** A ghost the way the admin makes it: the school email, a school, and the email marked vouched for. */
async function ghost(tenantId = EPITECH) {
  const id = `ghost-${next()}`;
  const email = `${id}@epitech.eu`;
  await db.insert(user).values({
    id,
    name: 'Ghost Name',
    email,
    emailVerified: true,
    tenantId,
    ghost: true,
    role: 'events-manager',
  });
  return { id, email };
}

async function realUser(email?: string) {
  const id = `real-${next()}`;
  const address = email ?? `${id}@epitech.eu`;
  await db.insert(user).values({ id, name: 'Existing', email: address, tenantId: EPITECH });
  await db
    .insert(account)
    .values({ id: `acc-${id}`, accountId: `oid-${id}`, providerId: 'microsoft', userId: id });
  return { id, email: address, oid: `oid-${id}` };
}

const rows = (id: string) => db.select().from(user).where(eq(user.id, id));

describe('taking over a ghost account', () => {
  it('keeps the same account, with what was attached to it', async () => {
    const g = await ghost();
    const [pole] = await db
      .insert(teamPole)
      .values({ nameEn: 'Events', nameFr: 'Événements', icon: 'i-lucide-calendar', position: 0 })
      .returning();
    await db.insert(teamMember).values({
      userId: g.id,
      poleId: pole!.id,
      roleEn: 'Member',
      roleFr: 'Membre',
      position: 0,
    });
    await db.insert(pushPreference).values({ userId: g.id, reminders: false });

    const result = await signIn({ email: g.email, oid: `oid-${g.id}`, name: 'Real Name' });

    expect(result.error).toBeNull();
    expect(result.isRegister).toBe(false);
    expect(result.data?.user.id).toBe(g.id);
    const [row] = await rows(g.id);
    expect(row).toMatchObject({ ghost: false, name: 'Real Name', role: 'events-manager' });
    // Still one account for that email, and its seat and settings are still there.
    expect(await db.select().from(user).where(eq(user.email, g.email))).toHaveLength(1);
    expect(await db.select().from(teamMember).where(eq(teamMember.userId, g.id))).toHaveLength(1);
    expect(
      await db.select().from(pushPreference).where(eq(pushPreference.userId, g.id)),
    ).toHaveLength(1);
    const accounts = await db.select().from(account).where(eq(account.userId, g.id));
    expect(accounts).toMatchObject([{ providerId: 'microsoft', accountId: `oid-${g.id}` }]);
    // No token is kept, as for any account.
    expect(accounts[0]?.accessToken).toBeNull();
  });

  it('writes an audit row, and the next sign-in is a plain sign-in', async () => {
    const g = await ghost();
    await signIn({ email: g.email, oid: `oid-${g.id}` });
    const audit = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, g.id));
    expect(audit).toMatchObject([{ action: 'user.ghostClaim', actorUserId: null }]);

    const again = await signIn({ email: g.email, oid: `oid-${g.id}` });
    expect(again.error).toBeNull();
    expect(
      await db
        .select()
        .from(adminAudit)
        .where(and(eq(adminAudit.targetUserId, g.id), eq(adminAudit.action, 'user.ghostClaim'))),
    ).toHaveLength(1);
  });

  it('matches the email whatever its case', async () => {
    const g = await ghost();
    const result = await signIn({ email: g.email.toUpperCase(), oid: `oid-${g.id}` });
    expect(result.data?.user.id).toBe(g.id);
  });

  it('refuses a person from another school, and leaves the ghost as it was', async () => {
    const g = await ghost(EPITECH);
    await expect(signIn({ email: g.email, oid: 'oid-other', tid: ISEG })).rejects.toMatchObject({
      body: { code: ACCOUNT_CLAIM_REFUSED },
    });
    const [row] = await rows(g.id);
    expect(row?.ghost).toBe(true);
    expect(await db.select().from(account).where(eq(account.userId, g.id))).toHaveLength(0);
  });

  it('does not let a second Microsoft account take it once it is claimed', async () => {
    const g = await ghost();
    await signIn({ email: g.email, oid: `oid-${g.id}` });
    await expect(signIn({ email: g.email, oid: 'oid-someone-else' })).rejects.toMatchObject({
      body: { code: ACCOUNT_CLAIM_REFUSED },
    });
    expect(await db.select().from(account).where(eq(account.userId, g.id))).toHaveLength(1);
  });
});

describe('accounts that are not ghosts', () => {
  it('refuses a new Microsoft account with the email of a real account', async () => {
    // A school that reuses an address must not hand the old owner's account to the new one.
    // Better Auth refuses it by itself while the account's email isn't verified...
    const existing = await realUser();
    const result = await signIn({ email: existing.email, oid: 'oid-newcomer' });
    expect(result.error).toBe('account not linked');
    expect(await db.select().from(account).where(eq(account.userId, existing.id))).toHaveLength(1);
  });

  it("refuses it too when the real account's email is verified", async () => {
    // ... and validateUserInfo refuses it when it is, since only a ghost can be taken over.
    const existing = await realUser();
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, existing.id));
    await expect(signIn({ email: existing.email, oid: 'oid-newcomer' })).rejects.toMatchObject({
      body: { code: ACCOUNT_CLAIM_REFUSED },
    });
    expect(await db.select().from(account).where(eq(account.userId, existing.id))).toHaveLength(1);
  });

  it('refuses a real account that lost its Microsoft account, even a verified one', async () => {
    const id = `orphan-${next()}`;
    const email = `${id}@epitech.eu`;
    await db
      .insert(user)
      .values({ id, name: 'Orphan', email, emailVerified: true, tenantId: EPITECH });
    await expect(signIn({ email, oid: 'oid-newcomer' })).rejects.toMatchObject({
      body: { code: ACCOUNT_CLAIM_REFUSED },
    });
  });

  it('still signs the owner in, by Microsoft account', async () => {
    const existing = await realUser();
    const result = await signIn({ email: existing.email, oid: existing.oid });
    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe(existing.id);
  });

  it('still creates an account for somebody new', async () => {
    const email = `new-${next()}@epitech.eu`;
    const result = await signIn({ email, oid: `oid-${email}` });
    expect(result.error).toBeNull();
    expect(result.isRegister).toBe(true);
    const [row] = await db.select().from(user).where(eq(user.email, email));
    expect(row?.ghost).toBe(false);
  });
});
