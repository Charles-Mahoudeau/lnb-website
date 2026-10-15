import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

// No Nuxt imports here: drizzle-kit and the Better Auth CLI load this file outside Nuxt.
// The pool connects on first query, so importing this file needs no database (build, tests).
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

/** A transaction in progress, for services that write in the caller's transaction. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The database, or a transaction in progress. */
export type Db = typeof db | Tx;
