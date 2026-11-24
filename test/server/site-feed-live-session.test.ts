import { createHmac } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { session as sessionTable, user } from '~~/server/db/schema';
import type { FeedLiveHub, FeedLiveJoin } from '~~/server/services/feed/live';

import { person, wipe } from './feed-helpers';

// The stream's sign-out check on a real Better Auth session (docs/feed.md, "Sign-out and flags"):
// `streamFeedLive` asks `getAuthSession` with the stream request's own cookie, and the hub closes the
// stream when the answer is "no session". The other tests stub the check; this one signs a cookie
// the way Better Auth does and deletes, expires and breaks the session underneath it.

vi.mock('h3', async () => (await import((await import('./nitro-h3')).nitroH3())) as object);

const SECRET = 'x'.repeat(40);
const COOKIE = 'better-auth.session_token';

let ctx: { internalAdapter: { createSession: (userId: string) => Promise<{ token: string }> } };
let streamFeedLive: (typeof import('~~/server/utils/feed-live'))['streamFeedLive'];

beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'client');
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'secret');
  vi.stubEnv('AUTH_ALLOWED_TENANTS', '901cb4ca-b862-4029-9306-e5cd0f6d9f86');
  const { auth } = await import('~~/server/lib/auth');
  ctx = await auth.$context;
  const { getAuthSession } = await import('~~/server/utils/auth');
  vi.stubGlobal('getAuthSession', getAuthSession);
  ({ streamFeedLive } = await import('~~/server/utils/feed-live'));
});
afterAll(async () => {
  await wipe();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A cookie header Better Auth accepts for this session token: the token, signed with the secret. */
function cookieFor(token: string) {
  const signature = createHmac('sha256', SECRET).update(token).digest('base64');
  return `${COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
}

/**
 * Opens the stream on a hub that only records what the route hands it, and gives back the
 * hub's view of the connection: its `sessionAlive`.
 */
async function open(cookie: string | null) {
  let joined: FeedLiveJoin | undefined;
  let leaves = 0;
  const hub = {
    join(input: FeedLiveJoin) {
      joined = input;
      return () => {
        leaves++;
      };
    },
  } as unknown as FeedLiveHub;
  const req = new Request('http://localhost:3000/api/feed/events', {
    headers: cookie ? { cookie } : {},
  });
  const listeners = new Map<string, () => void>();
  const res = {
    writableLength: 0,
    once: (name: string, listener: () => void) => listeners.set(name, listener),
    setHeader() {},
    getHeader: () => undefined,
    end() {},
    socket: undefined,
    statusCode: 200,
    _data: undefined,
  };
  const event = {
    req,
    url: new URL(req.url),
    res: { status: 200, headers: new Headers() },
    context: { params: {} },
    node: { req: { on() {}, once() {} }, res },
  };
  await streamFeedLive(event, 'ignored', hub);
  return { alive: () => joined!.sessionAlive(), leaves: () => leaves };
}

describe('the stream’s session check, on a real Better Auth session', () => {
  it('is alive while the session exists, and gone once it is deleted', async () => {
    const camille = await person('Camille Roux');
    const { token } = await ctx.internalAdapter.createSession(camille.id);
    const stream = await open(cookieFor(token));
    expect(await stream.alive()).toBe(true);
    expect(await stream.alive()).toBe(true);
    await db.delete(sessionTable).where(eq(sessionTable.token, token));
    expect(await stream.alive()).toBe(false);
  });

  it('is gone for a session that has expired, and for a person who was deleted', async () => {
    const camille = await person('Camille Roux');
    const { token } = await ctx.internalAdapter.createSession(camille.id);
    const stream = await open(cookieFor(token));
    expect(await stream.alive()).toBe(true);
    await db
      .update(sessionTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessionTable.token, token));
    expect(await stream.alive()).toBe(false);

    const mika = await person('Mika Laurent');
    const other = await ctx.internalAdapter.createSession(mika.id);
    const second = await open(cookieFor(other.token));
    expect(await second.alive()).toBe(true);
    await db.delete(user).where(eq(user.id, mika.id));
    expect(await second.alive()).toBe(false);
  });

  it('is gone for no cookie, an unsigned token, a wrongly signed one and garbage', async () => {
    const camille = await person('Camille Roux');
    const { token } = await ctx.internalAdapter.createSession(camille.id);
    const forged = createHmac('sha256', 'another secret'.repeat(4)).update(token).digest('base64');
    for (const cookie of [
      null,
      `${COOKIE}=${token}`,
      `${COOKIE}=${encodeURIComponent(`${token}.${forged}`)}`,
      `${COOKIE}=garbage`,
      `${COOKIE}=`,
      'other=1',
    ]) {
      const stream = await open(cookie);
      expect(await stream.alive(), String(cookie)).toBe(false);
    }
  });

  it('rejects, rather than answering "gone", when the database fails', async () => {
    const camille = await person('Camille Roux');
    const { token } = await ctx.internalAdapter.createSession(camille.id);
    const stream = await open(cookieFor(token));
    expect(await stream.alive()).toBe(true);
    // Better Auth logs the failure it rethrows.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const select = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('database away');
    });
    const query = vi.spyOn(db, 'query', 'get').mockImplementation(() => {
      throw new Error('database away');
    });
    try {
      // The hub keeps the stream open on a rejection and closes it only on "no session".
      await expect(stream.alive()).rejects.toThrow();
    } finally {
      select.mockRestore();
      query.mockRestore();
      logged.mockRestore();
    }
    expect(await stream.alive()).toBe(true);
  });
});
