import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { adminDatabaseUrl, testDatabaseUrl } from './database.ts';

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../server/db/migrations',
);

/** A fresh database with every migration applied, the way the server does at startup. */
export async function createMigratedDatabase(name: string): Promise<void> {
  await recreateDatabase(name);
  const pool = new pg.Pool({ connectionString: testDatabaseUrl(name) });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

export async function recreateDatabase(name: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  try {
    // Identifiers can't be parameters; the names are ours.
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
}

export default async function setup() {
  await createMigratedDatabase('lnb_test');
}
