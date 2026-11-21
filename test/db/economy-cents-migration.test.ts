import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigration, databaseBefore } from './migrations.ts';

// 0058 counts the economy in cents: every stored amount is multiplied by 100, counts are not.

const MIGRATION = '0058_economy-cents';

let pool: pg.Pool;
let accountId: string;

beforeAll(async () => {
  pool = await databaseBefore('lnb_test_economy_cents', MIGRATION);
  await pool.query(
    `INSERT INTO "user" (id, name, email, tenant_id) VALUES ('owner', 'Owner', 'owner@epitech.eu', 't')`,
  );
  const account = await pool.query<{ id: string }>(
    `INSERT INTO economy_account (kind, owner_user_id, balance) VALUES ('personal', 'owner', 1234) RETURNING id`,
  );
  accountId = account.rows[0]!.id;
  const tx = await pool.query<{ id: string }>(
    `INSERT INTO economy_transaction (kind, source) VALUES ('mint', 'admin') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO economy_entry (transaction_id, account_id, amount, balance_after) VALUES ($1, $2, 1234, 1234)`,
    [tx.rows[0]!.id, accountId],
  );
  await pool.query(
    `UPDATE economy_settings SET starting_balance = 100, casino_license_price = 100000`,
  );
  await pool.query(
    `INSERT INTO economy_daily_stat (day, minted, burned, supply, volume)
     VALUES ('2026-11-01', 500, 20, 9000, '{"transfer":{"count":3,"amount":250},"mint":{"count":1,"amount":500}}')`,
  );
  await applyMigration(pool, MIGRATION);
});

afterAll(async () => {
  await pool.end();
});

describe('economy cents migration', () => {
  it('multiplies balances and ledger entries by 100', async () => {
    const account = await pool.query<{ balance: string }>(
      'SELECT balance FROM economy_account WHERE id = $1',
      [accountId],
    );
    expect(Number(account.rows[0]!.balance)).toBe(123_400);
    const entry = await pool.query<{ amount: string; balance_after: string }>(
      'SELECT amount, balance_after FROM economy_entry',
    );
    expect(entry.rows.map((row) => [Number(row.amount), Number(row.balance_after)])).toEqual([
      [123_400, 123_400],
    ]);
  });

  it('multiplies the settings', async () => {
    const { rows } = await pool.query<{ starting_balance: string; casino_license_price: string }>(
      'SELECT starting_balance, casino_license_price FROM economy_settings',
    );
    for (const row of rows) {
      expect(Number(row.starting_balance)).toBe(10_000);
      expect(Number(row.casino_license_price)).toBe(10_000_000);
    }
  });

  it('multiplies the daily stats and the amount of each kind, but not its count', async () => {
    const { rows } = await pool.query<{
      minted: string;
      burned: string;
      supply: string;
      volume: Record<string, { count: number; amount: number }>;
    }>('SELECT minted, burned, supply, volume FROM economy_daily_stat');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect([Number(row.minted), Number(row.burned), Number(row.supply)]).toEqual([
      50_000, 2000, 900_000,
    ]);
    expect(row.volume).toEqual({
      transfer: { count: 3, amount: 25_000 },
      mint: { count: 1, amount: 50_000 },
    });
  });
});
