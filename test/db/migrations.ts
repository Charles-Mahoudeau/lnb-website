import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { testDatabaseUrl } from './database.ts';
import { recreateDatabase } from './global-setup.ts';

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../server/db/migrations',
);

interface Journal {
  entries: { idx: number; tag: string }[];
}

/**
 * A fresh database with every migration before `tag` applied, to seed old-shaped data. Apply the
 * migration under test with `applyMigration`.
 */
export async function databaseBefore(name: string, tag: string): Promise<pg.Pool> {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as Journal & Record<string, unknown>;
  const before = journal.entries.filter((entry) => entry.idx < indexOf(journal, tag));

  const folder = mkdtempSync(join(tmpdir(), 'lnb-migrations-'));
  mkdirSync(join(folder, 'meta'));
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries: before }),
  );
  for (const entry of before)
    cpSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));

  await recreateDatabase(name);
  const pool = new pg.Pool({ connectionString: testDatabaseUrl(name) });
  await migrate(drizzle(pool), { migrationsFolder: folder });
  return pool;
}

function indexOf(journal: Journal, tag: string): number {
  const entry = journal.entries.find((candidate) => candidate.tag === tag);
  if (!entry) throw new Error(`No migration called ${tag}`);
  return entry.idx;
}

/** Runs one migration file in a transaction, like the migrator does. */
export async function applyMigration(pool: pg.Pool, tag: string): Promise<void> {
  const sql = readFileSync(join(migrationsFolder, `${tag}.sql`), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of sql.split('--> statement-breakpoint')) await client.query(statement);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
