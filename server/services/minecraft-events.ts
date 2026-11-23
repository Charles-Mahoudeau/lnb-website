import { and, asc, eq, gt, inArray, isNull, lt, max } from 'drizzle-orm';

import { db } from '~~/server/db';
import { minecraftAccount, minecraftServerEvent } from '~~/server/db/schema';

// The events the site sends the Minecraft server's mods: see server/db/schema/minecraft-events.ts.
// Emitting never fails the change that caused it: the mods also poll, so a lost event only means
// a slower refresh.

export type MinecraftTopic = 'economy' | 'quests' | 'feed';

const KEEP_MS = 24 * 60 * 60 * 1000;

async function emit(topic: MinecraftTopic, type: string, data: Record<string, unknown>) {
  try {
    await db.insert(minecraftServerEvent).values({ topic, type, data });
  } catch (error) {
    console.error(`Couldn't record the ${topic} event ${type}`, error);
  }
}

/** The Minecraft accounts linked to these LNB accounts, for events that name players. */
async function uuidsOf(userIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  const rows = await db
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(and(inArray(minecraftAccount.userId, ids), isNull(minecraftAccount.unlinkedAt)));
  return rows.map((row) => row.uuid);
}

/** Emits `type` with the players' `uuids`, when any of them has a Minecraft account. */
async function emitToPlayers(
  topic: MinecraftTopic,
  type: string,
  userIds: readonly string[],
  data: Record<string, unknown> = {},
) {
  try {
    const uuids = await uuidsOf(userIds);
    if (uuids.length) await emit(topic, type, { ...data, uuids });
  } catch (error) {
    console.error(`Couldn't record the ${topic} event ${type}`, error);
  }
}

/** The newest event of the topic, where a server that sends no Last-Event-ID starts. */
async function latestId(topic: MinecraftTopic): Promise<number> {
  const [row] = await db
    .select({ id: max(minecraftServerEvent.id) })
    .from(minecraftServerEvent)
    .where(eq(minecraftServerEvent.topic, topic));
  return row?.id ?? 0;
}

/** The topic's events after `afterId`, oldest first. */
async function since(topic: MinecraftTopic, afterId: number, limit = 500) {
  return db
    .select({
      id: minecraftServerEvent.id,
      type: minecraftServerEvent.type,
      data: minecraftServerEvent.data,
    })
    .from(minecraftServerEvent)
    .where(and(eq(minecraftServerEvent.topic, topic), gt(minecraftServerEvent.id, afterId)))
    .orderBy(asc(minecraftServerEvent.id))
    .limit(limit);
}

/** Deletes events older than a day: a server away longer refreshes everything when it's back. */
async function prune(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(minecraftServerEvent)
    .where(lt(minecraftServerEvent.createdAt, new Date(now.getTime() - KEEP_MS)))
    .returning({ id: minecraftServerEvent.id });
  return deleted.length;
}

export const minecraftEventService = { emit, emitToPlayers, uuidsOf, latestId, since, prune };
