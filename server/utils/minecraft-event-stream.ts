import { createEventStream } from 'h3';
import type { H3Event } from 'h3';
import { getRequestHeader } from 'nuxt/server';

import { minecraftEventService } from '~~/server/services/minecraft-events';
import type { MinecraftTopic } from '~~/server/services/minecraft-events';

const POLL_MS = 1000;
const PING_MS = 25_000;

/**
 * Serves a topic of minecraft_server_event as Server-Sent Events, as Warden's stream does: each
 * event's `id` is its row ID, `event` its type and `data` its JSON. Last-Event-ID resumes after a
 * reconnection; without it the stream starts from now. A `ping` opens the stream, so the response
 * starts at once (Node sends no headers before the first write), and another after 25 quiet
 * seconds keeps proxies from closing the connection. The caller checks access first.
 */
export async function streamMinecraftEvents(
  event: Parameters<typeof getRequestHeader>[0],
  topic: MinecraftTopic,
) {
  const lastEventId = Number(getRequestHeader(event, 'last-event-id'));
  let cursor =
    Number.isSafeInteger(lastEventId) && lastEventId >= 0
      ? lastEventId
      : await minecraftEventService.latestId(topic);

  // nuxt/server's event is h3's at runtime. The portable surface has no event streams yet.
  const stream = createEventStream(event as unknown as H3Event);
  let closed = false;
  let lastPush = Date.now();

  async function poll() {
    // Resolves once the response is being sent: the client has its headers at once.
    await stream.push({ event: 'ping', data: '{}' });
    lastPush = Date.now();
    while (!closed) {
      for (const row of await minecraftEventService.since(topic, cursor)) {
        await stream.push({ id: String(row.id), event: row.type, data: JSON.stringify(row.data) });
        cursor = row.id;
        lastPush = Date.now();
      }
      if (Date.now() - lastPush > PING_MS) {
        await stream.push({ event: 'ping', data: '{}' });
        lastPush = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  stream.onClosed(() => {
    closed = true;
  });
  poll().catch(async () => {
    closed = true;
    await stream.close();
  });
  return stream.send();
}
