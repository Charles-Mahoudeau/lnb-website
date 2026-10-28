import { sql } from 'drizzle-orm';
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// API keys for integrations (the BDE website, bots). See docs/api-keys.md.

/**
 * A key. Only the SHA-256 of the secret is stored. `permissions` are API_KEY_PERMISSIONS
 * (shared/api-keys.ts). `rotatedAt` is set on a key a newer one replaced: it works until
 * `expiresAt`, which the rotation brought forward.
 */
export const apiKey = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    // The first characters of the secret, so admins can tell keys apart.
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    permissions: text('permissions').array().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at').notNull(),
    rotatedAt: timestamp('rotated_at'),
    revokedAt: timestamp('revoked_at'),
    lastUsedAt: timestamp('last_used_at'),
  },
  (table) => [check('api_key_permissions', sql`cardinality(${table.permissions}) > 0`)],
);

/** Calls per key, day (UTC) and route. No IP, no user agent, no content. */
export const apiKeyUsage = pgTable(
  'api_key_usage',
  {
    keyId: uuid('key_id')
      .notNull()
      .references(() => apiKey.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    // `GET /api/admin/short-links/:id`: ids replaced, so there are few routes.
    route: text('route').notNull(),
    calls: integer('calls').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.keyId, table.day, table.route] })],
);
