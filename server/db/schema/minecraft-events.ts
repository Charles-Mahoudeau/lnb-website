import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Changes made on the site that the Minecraft server's mods keep a copy of: a bank account opened,
 * an invitation sent, a quest edited. Each mod reads its topic as Server-Sent Events
 * (`/api/economy/server/events`, `/api/quests/server/events`), so it refreshes in a second instead
 * of at its next poll. Kept a day, for servers that reconnect with Last-Event-ID. See
 * docs/economy.md and docs/quests.md.
 */
export const minecraftServerEvent = pgTable(
  'minecraft_server_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    topic: text('topic').$type<'economy' | 'quests'>().notNull(),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('minecraft_server_event_topic_id_idx').on(table.topic, table.id),
    index('minecraft_server_event_created_at_idx').on(table.createdAt),
  ],
);
