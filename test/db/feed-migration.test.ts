import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigration, databaseBefore } from './migrations.ts';

// 0064 adds Feed's tables and ships the feature off: a `feed` flag row, disabled, while its parts
// have no row and so follow it. The table checks hold what the services rely on even if a bug
// slipped past them: 1 to 280 code points, the two feeds, pins on announcements' main posts only.

let pool: pg.Pool;

async function rows<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  return (await pool.query(text, values)).rows as T[];
}

/** The SQLSTATE of a statement that fails, or null when it runs. */
async function failure(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await pool.query(text, values);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

const POST = `INSERT INTO feed_post
  (id, feed, thread_id, reply_to_id, author_user_id, minecraft_uuid, minecraft_username, source,
   text, pinned_at, idempotency_key, fingerprint, deleted_cause)
  VALUES ($1, $2, $3, $4, 'author', gen_random_uuid(), 'Author_1', $5, $6, $7,
   gen_random_uuid(), 'f', $8)`;

function insertPost(
  values: Partial<{
    id: string;
    feed: string;
    threadId: string | null;
    replyToId: string | null;
    source: string;
    text: string;
    pinnedAt: string | null;
    deletedCause: string | null;
  }> = {},
) {
  return [
    values.id ?? crypto.randomUUID(),
    values.feed ?? 'global',
    values.threadId ?? null,
    values.replyToId ?? null,
    values.source ?? 'server',
    values.text ?? 'Salut',
    values.pinnedAt ?? null,
    values.deletedCause ?? null,
  ];
}

beforeAll(async () => {
  pool = await databaseBefore('lnb_test_feed_migration', '0064_feed');
  await pool.query(
    `INSERT INTO "user" (id, name, email, tenant_id) VALUES ('author', 'Author', 'a@epitech.eu', 't')`,
  );
  await pool.query(
    `INSERT INTO minecraft_account (uuid, user_id, username) VALUES ($1, 'author', 'Author_1')`,
    ['11111111-1111-4111-8111-111111111111'],
  );
  await applyMigration(pool, '0064_feed');
});

afterAll(async () => {
  await pool.end();
});

describe('0064_feed', () => {
  it('ships Feed off: a disabled feed row, and no row for its parts', async () => {
    const flags = await rows<{ key: string; enabled: boolean }>(
      `SELECT key, enabled FROM feature_flag WHERE key LIKE 'feed%' OR key = 'jobs.feedPurge' ORDER BY key`,
    );
    expect(flags).toEqual([{ key: 'feed', enabled: false }]);
  });

  it('indexes every foreign key of its tables, with no condition a cascade could not use', async () => {
    // A foreign key whose column leads no plain index costs a scan of its table for each row a
    // cascade deletes or sets to null: deleting one account read the whole of feed_post per post.
    const unindexed = await rows<{ fk: string }>(`
      SELECT c.conname AS fk
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid::regclass::text LIKE 'feed_%'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND i.indkey[0] = c.conkey[1]
            AND i.indpred IS NULL
        )
      ORDER BY 1`);
    expect(unindexed).toEqual([]);
    const fks = await rows(
      `SELECT 1 FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text LIKE 'feed_%'`,
    );
    expect(fks.length).toBeGreaterThanOrEqual(14);
  });

  it('counts the text in code points: 280 astral characters fit, 281 and none do not', async () => {
    const smile = String.fromCodePoint(0x1f600);
    expect(await failure(POST, insertPost({ text: smile.repeat(280) }))).toBeNull();
    expect(await failure(POST, insertPost({ text: smile.repeat(281) }))).toBe('23514');
    expect(await failure(POST, insertPost({ text: '' }))).toBe('23514');
  });

  it('keeps the feed, the source and the cause to their values', async () => {
    expect(await failure(POST, insertPost({ feed: 'news' }))).toBe('23514');
    expect(await failure(POST, insertPost({ source: 'discord' }))).toBe('23514');
    expect(await failure(POST, insertPost({ deletedCause: 'spam' }))).toBe('23514');
    for (const cause of ['author', 'moderator', 'thread']) {
      expect(await failure(POST, insertPost({ deletedCause: cause }))).toBeNull();
    }
  });

  it('pins announcements’ main posts only, and keeps replyTo on replies', async () => {
    const now = new Date().toISOString();
    const main = crypto.randomUUID();
    expect(
      await failure(POST, insertPost({ id: main, feed: 'announcements', pinnedAt: now })),
    ).toBeNull();
    expect(await failure(POST, insertPost({ feed: 'global', pinnedAt: now }))).toBe('23514');
    expect(
      await failure(POST, insertPost({ feed: 'announcements', threadId: main, pinnedAt: now })),
    ).toBe('23514');
    expect(await failure(POST, insertPost({ replyToId: main }))).toBe('23514');
    const answer = crypto.randomUUID();
    expect(
      await failure(POST, insertPost({ id: answer, feed: 'announcements', threadId: main })),
    ).toBeNull();
    expect(
      await failure(POST, insertPost({ feed: 'announcements', threadId: main, replyToId: answer })),
    ).toBeNull();
  });

  it('refuses a second post with the same key, and a notification of another kind', async () => {
    const key = crypto.randomUUID();
    const insert = `INSERT INTO feed_post (feed, author_user_id, minecraft_uuid, minecraft_username,
      source, text, idempotency_key, fingerprint)
      VALUES ('global', 'author', gen_random_uuid(), 'A', 'server', 'x', $1, 'f') RETURNING id`;
    const [created] = await rows<{ id: string }>(insert, [key]);
    expect(await failure(insert, [key])).toBe('23505');
    expect(
      await failure(`INSERT INTO feed_notification (kind, post_id) VALUES ('like', $1)`, [
        created!.id,
      ]),
    ).toBe('23514');
  });

  it('cascades a thread and its rows, and forgets a purged reply’s link', async () => {
    const main = crypto.randomUUID();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const other = crypto.randomUUID();
    await pool.query(POST, insertPost({ id: main }));
    await pool.query(POST, insertPost({ id: first, threadId: main }));
    await pool.query(POST, insertPost({ id: second, threadId: main, replyToId: first }));
    await pool.query(POST, insertPost({ id: other }));
    await pool.query(`INSERT INTO feed_like (post_id, user_id) VALUES ($1, 'author')`, [main]);
    await pool.query(
      `INSERT INTO feed_thread_seen (user_id, thread_id, seen_at) VALUES ('author', $1, now())`,
      [main],
    );
    await pool.query(`INSERT INTO feed_notification (kind, post_id) VALUES ('reply', $1)`, [first]);

    await pool.query(`DELETE FROM feed_post WHERE id = $1`, [first]);
    expect(await rows(`SELECT reply_to_id FROM feed_post WHERE id = $1`, [second])).toEqual([
      { reply_to_id: null },
    ]);
    expect(await rows(`SELECT 1 FROM feed_notification WHERE post_id = $1`, [first])).toEqual([]);

    await pool.query(`DELETE FROM feed_post WHERE id = $1`, [main]);
    expect(await rows(`SELECT 1 FROM feed_post WHERE id = ANY($1)`, [[main, second]])).toEqual([]);
    expect(await rows(`SELECT 1 FROM feed_like WHERE post_id = $1`, [main])).toEqual([]);
    expect(await rows(`SELECT 1 FROM feed_thread_seen WHERE thread_id = $1`, [main])).toEqual([]);
    expect(await rows(`SELECT 1 FROM feed_post WHERE id = $1`, [other])).toHaveLength(1);
  });

  it('forgets a posting account once its Minecraft account row goes', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    await pool.query(
      `INSERT INTO feed_member (user_id, posting_minecraft_uuid) VALUES ('author', $1)`,
      [uuid],
    );
    await pool.query(`DELETE FROM minecraft_account WHERE uuid = $1`, [uuid]);
    expect(await rows(`SELECT posting_minecraft_uuid FROM feed_member`)).toEqual([
      { posting_minecraft_uuid: null },
    ]);
  });

  it('takes the author’s rows with the account', async () => {
    await pool.query(`DELETE FROM "user" WHERE id = 'author'`);
    expect(await rows(`SELECT 1 FROM feed_post`)).toEqual([]);
    expect(await rows(`SELECT 1 FROM feed_member`)).toEqual([]);
  });
});
