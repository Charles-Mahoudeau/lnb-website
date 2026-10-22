import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigration, databaseBefore } from './migrations.ts';
import { offlineUuid } from '../../server/lib/minecraft.ts';

// 0015 moves accounts linked as premium to the offline UUID of their username, with their
// history, and leaves alone the ones whose offline UUID is already linked.

const NOTCH_PREMIUM = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
const ALEX_PREMIUM = '6ab43178-89fd-4905-97f6-0f67d9d76fd9';
const JEB_PREMIUM = '853c80ef-3c37-49fd-aa49-938b674adae6';
const STEVE_PREMIUM = '8667ba71-b85a-4004-af54-457a9734eed7';
const CRACKED_ALEX = offlineUuid('Alex');
const CRACKED_SAME_USER = offlineUuid('Jeb_');
const STAFF = '11111111-1111-4111-8111-111111111111';

let pool: pg.Pool;

async function rows<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  return (await pool.query(text, values)).rows as T[];
}

beforeAll(async () => {
  pool = await databaseBefore('lnb_test_migration', '0015_warden_offline_accounts');
  const user = (id: string) =>
    pool.query(
      `INSERT INTO "user" (id, name, email, tenant_id) VALUES ($1, $1, $1 || '@epitech.eu', 't')`,
      [id],
    );
  for (const id of ['notch', 'alex', 'owner', 'jeb', 'steve']) await user(id);

  const account = (uuid: string, userId: string, username: string, cracked: boolean) =>
    pool.query(
      `INSERT INTO minecraft_account (uuid, user_id, username, cracked, playtime_seconds)
       VALUES ($1, $2, $3, $4, 100)`,
      [uuid, userId, username, cracked],
    );
  // Notch: premium, with history in every table that names an account.
  await account(NOTCH_PREMIUM, 'notch', 'Notch', false);
  // Alex: premium, but another player linked the cracked Alex already: a collision.
  await account(ALEX_PREMIUM, 'alex', 'Alex', false);
  await account(CRACKED_ALEX, 'owner', 'Alex', true);
  // Jeb_: premium, and the same player already linked the cracked account: also a collision.
  await account(JEB_PREMIUM, 'jeb', 'Jeb_', false);
  await account(CRACKED_SAME_USER, 'jeb', 'Jeb_', true);
  // Steve: already cracked, left alone. A premium account with the same name in other case
  // is a different offline player.
  await account(offlineUuid('Steve'), 'steve', 'Steve', true);
  await account(STEVE_PREMIUM, 'notch', 'steve', false);

  await pool.query(
    `INSERT INTO minecraft_username (minecraft_uuid, username) VALUES ($1, 'Notch'), ($1, 'OldNotch')`,
    [NOTCH_PREMIUM],
  );
  await pool.query(`INSERT INTO warden_session (minecraft_uuid, user_id) VALUES ($1, 'notch')`, [
    NOTCH_PREMIUM,
  ]);
  await pool.query(
    `INSERT INTO warden_ban (user_id, minecraft_uuid, reason, source, issued_by_minecraft_uuid, revoked_by_minecraft_uuid)
     VALUES ('notch', $1, 'griefing', 'minecraft', $2, $1)`,
    [NOTCH_PREMIUM, STAFF],
  );
  await pool.query(
    `INSERT INTO warden_note (user_id, kind, body, source, author_minecraft_uuid) VALUES ('alex', 'warning', 'hi', 'minecraft', $1)`,
    [NOTCH_PREMIUM],
  );
  await pool.query(
    `INSERT INTO warden_audit (action, source, actor_minecraft_uuid, target_user_id, target_minecraft_uuid)
     VALUES ('ban', 'minecraft', $1, 'notch', $1)`,
    [NOTCH_PREMIUM],
  );
  // A code from the old flow, still waiting.
  await pool.query(
    `INSERT INTO device_code (id, device_code, user_code, expires_at, status, client_id)
     VALUES ('dc1', 'secret', '123456', now() + interval '5 minutes', 'pending', 'warden')`,
  );
  await pool.query(
    `INSERT INTO warden_link_request (device_code_id, minecraft_uuid, username, cracked) VALUES ('dc1', $1, 'Notch', false)`,
    [NOTCH_PREMIUM],
  );

  await applyMigration(pool, '0015_warden_offline_accounts');
});

afterAll(async () => {
  await pool.end();
});

describe('premium accounts', () => {
  it('get the offline UUID of their username, case-sensitively', async () => {
    const uuids = (
      await rows<{ uuid: string }>(
        `SELECT uuid FROM minecraft_account WHERE user_id = 'notch' ORDER BY username`,
      )
    ).map((r) => r.uuid);
    // 'Notch' < 'steve' in the C locale; compare as sets.
    expect(new Set(uuids)).toEqual(new Set([offlineUuid('Notch'), offlineUuid('steve')]));
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    expect(offlineUuid('steve')).not.toBe(offlineUuid('Steve'));
  });

  it('keep their link, playtime and username history', async () => {
    const [account] = await rows<{ playtime_seconds: string; user_id: string }>(
      `SELECT * FROM minecraft_account WHERE uuid = $1`,
      [offlineUuid('Notch')],
    );
    expect(account).toMatchObject({ user_id: 'notch', playtime_seconds: '100' });
    const names = await rows<{ username: string }>(
      `SELECT username FROM minecraft_username WHERE minecraft_uuid = $1 ORDER BY username`,
      [offlineUuid('Notch')],
    );
    expect(names.map((n) => n.username)).toEqual(['Notch', 'OldNotch']);
  });
});

describe('history', () => {
  const notch = offlineUuid('Notch');

  it('follows in sessions, bans, notes and the audit log', async () => {
    expect(
      await rows(`SELECT 1 FROM warden_session WHERE minecraft_uuid = $1`, [notch]),
    ).toHaveLength(1);
    expect(
      await rows(
        `SELECT 1 FROM warden_ban WHERE minecraft_uuid = $1 AND revoked_by_minecraft_uuid = $1`,
        [notch],
      ),
    ).toHaveLength(1);
    expect(
      await rows(`SELECT 1 FROM warden_note WHERE author_minecraft_uuid = $1`, [notch]),
    ).toHaveLength(1);
    expect(
      await rows(
        `SELECT 1 FROM warden_audit WHERE actor_minecraft_uuid = $1 AND target_minecraft_uuid = $1`,
        [notch],
      ),
    ).toHaveLength(1);
  });

  it('leaves the old UUID nowhere, and other accounts as they were', async () => {
    for (const table of ['warden_session', 'warden_note']) {
      const column = table === 'warden_note' ? 'author_minecraft_uuid' : 'minecraft_uuid';
      expect(
        await rows(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [NOTCH_PREMIUM]),
      ).toHaveLength(0);
    }
    expect(
      await rows(`SELECT 1 FROM minecraft_account WHERE uuid = $1`, [NOTCH_PREMIUM]),
    ).toHaveLength(0);
    // The staff member who issued the ban isn't a linked account: their UUID stays as it was.
    expect(
      await rows(`SELECT 1 FROM warden_ban WHERE issued_by_minecraft_uuid = $1`, [STAFF]),
    ).toHaveLength(1);
  });
});

describe('collisions', () => {
  it('leave the account unmigrated, and delete or merge nothing', async () => {
    const alex = await rows<{ uuid: string; user_id: string }>(
      `SELECT uuid, user_id FROM minecraft_account WHERE username = 'Alex' ORDER BY user_id`,
    );
    expect(alex).toEqual([
      { uuid: ALEX_PREMIUM, user_id: 'alex' },
      { uuid: CRACKED_ALEX, user_id: 'owner' },
    ]);
    expect(
      await rows(`SELECT 1 FROM minecraft_account WHERE uuid = $1`, [JEB_PREMIUM]),
    ).toHaveLength(1);
    expect(
      await rows(`SELECT 1 FROM minecraft_account WHERE uuid = $1`, [CRACKED_SAME_USER]),
    ).toHaveLength(1);
  });

  it('are written to the audit log, with who holds the offline UUID', async () => {
    const entries = await rows<{
      target_user_id: string;
      target_minecraft_uuid: string;
      data: Record<string, string>;
    }>(
      `SELECT target_user_id, target_minecraft_uuid, data FROM warden_audit WHERE action = 'uuid.collision' ORDER BY target_user_id`,
    );
    expect(entries).toEqual([
      {
        target_user_id: 'alex',
        target_minecraft_uuid: ALEX_PREMIUM,
        data: { username: 'Alex', offlineUuid: CRACKED_ALEX, linkedTo: 'owner' },
      },
      {
        target_user_id: 'jeb',
        target_minecraft_uuid: JEB_PREMIUM,
        data: { username: 'Jeb_', offlineUuid: CRACKED_SAME_USER, linkedTo: 'jeb' },
      },
    ]);
  });
});

describe('the schema', () => {
  it('has no premium/cracked distinction left', async () => {
    const columns = await rows<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE column_name IN ('cracked', 'allow_cracked')`,
    );
    expect(columns).toEqual([]);
  });

  it('drops the codes of the old flow that were still waiting', async () => {
    expect(await rows(`SELECT 1 FROM device_code WHERE client_id = 'warden'`)).toHaveLength(0);
    expect(await rows(`SELECT 1 FROM warden_link_request`)).toHaveLength(0);
  });
});
