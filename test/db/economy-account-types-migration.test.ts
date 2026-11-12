import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigration, databaseBefore } from './migrations.ts';

// 0033 gives shared accounts a type: the ones already there become teams, and personal accounts
// keep none.

const MIGRATION = '0033_economy-ingame-accounts';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await databaseBefore('lnb_test_account_types', MIGRATION);
  await pool.query(
    `INSERT INTO "user" (id, name, email, tenant_id) VALUES ('owner', 'Owner', 'owner@epitech.eu', 't')`,
  );
  await pool.query(
    `INSERT INTO economy_account (kind, owner_user_id) VALUES ('personal', 'owner')`,
  );
  await pool.query(
    `INSERT INTO economy_account (kind, handle, name) VALUES ('shared', 'old-casino', 'Old Casino')`,
  );
  await applyMigration(pool, MIGRATION);
});

afterAll(async () => {
  await pool.end();
});

describe('economy account types migration', () => {
  it('makes every existing shared account a team', async () => {
    const { rows } = await pool.query<{ kind: string; type: string | null }>(
      'SELECT kind, type FROM economy_account ORDER BY kind',
    );
    expect(rows).toEqual([
      { kind: 'personal', type: null },
      { kind: 'shared', type: 'team' },
    ]);
  });

  it('refuses a shared account without a type, and a personal one with a type', async () => {
    await expect(
      pool.query(
        `INSERT INTO economy_account (kind, handle, name) VALUES ('shared', 'untyped', 'X')`,
      ),
    ).rejects.toThrow(/economy_account_kind_fields/);
    await expect(
      pool.query(`UPDATE economy_account SET type = 'shop' WHERE kind = 'personal'`),
    ).rejects.toThrow(/economy_account_kind_fields/);
  });

  it('prices a casino licence at 100000 by default', async () => {
    const { rows } = await pool.query<{ casino_license_price: string }>(
      'SELECT casino_license_price FROM economy_settings',
    );
    for (const row of rows) expect(Number(row.casino_license_price)).toBe(100_000);
  });
});
