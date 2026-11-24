import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { feedThreadSeen } from '~~/server/db/schema';
import { feedLimits, livePost, lockPost } from '~~/server/services/feed/shared';

import { person, post, reply, setFlags, wipe } from './feed-helpers';

// The locks that serialise Feed's writes in a thread (server/services/feed/shared.ts) must not
// block the key-share locks that inserts referencing the main post take: a like, a seen thread,
// a notification. `FOR UPDATE` would; `FOR NO KEY UPDATE` doesn't.

/** Holds `lock` in a transaction until `release` is called. */
function holding(
  lock: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>,
) {
  let release!: () => void;
  let ready!: () => void;
  const held = new Promise<void>((resolve) => (ready = resolve));
  const done = db.transaction(async (tx) => {
    await lock(tx);
    ready();
    await new Promise<void>((resolve) => (release = resolve));
  });
  return {
    held,
    done,
    release: () => {
      release();
    },
  };
}

/** Marks the thread seen in another transaction, failing after a second of waiting. */
function markSeen(userId: string, threadId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx.insert(feedThreadSeen).values({ userId, threadId, seenAt: new Date() });
  });
}

describe('Feed write locks', () => {
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  it('lets an insert referencing the main post through while a reply’s write holds the thread', async () => {
    const camille = await person('Camille Roux');
    const mika = await person('Mika Lefort');
    const { post: main } = await post(camille);
    const { post: answer } = await reply(mika, main.id);
    const lock = holding((tx) => lockPost(tx, answer.id));
    await lock.held;
    try {
      await expect(markSeen(mika.id, main.id)).resolves.toBeUndefined();
    } finally {
      lock.release();
      await lock.done;
    }
  });

  it('lets it through while a pin or a reply holds the main post', async () => {
    const camille = await person('Camille Roux');
    const { post: main } = await post(camille);
    const lock = holding((tx) => livePost(tx, main.id, true));
    await lock.held;
    try {
      await expect(markSeen(camille.id, main.id)).resolves.toBeUndefined();
    } finally {
      lock.release();
      await lock.done;
    }
  });

  it('still queues a second write on the same thread', async () => {
    const camille = await person('Camille Roux');
    const { post: main } = await post(camille);
    const lock = holding((tx) => lockPost(tx, main.id));
    await lock.held;
    try {
      const second = db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '300ms'`);
        await lockPost(tx, main.id);
      });
      await expect(second).rejects.toThrow();
    } finally {
      lock.release();
      await lock.done;
    }
  });
});
