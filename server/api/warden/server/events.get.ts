import { createEventStream } from 'h3';
import type { H3Event } from 'h3';
import { defineEventHandler, getRequestHeader } from 'nuxt/server';

import { wardenEventService } from '~~/server/services/warden/events';

const POLL_MS = 1000;
const PING_MS = 25_000;

// Server-Sent Events for the Minecraft server: kicks, unbans and settings, numbered with
// audit log IDs. Send Last-Event-ID when reconnecting to get the events you missed.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'warden.serverApi');
  const lastEventId = Number(getRequestHeader(event, 'last-event-id'));
  let cursor =
    Number.isSafeInteger(lastEventId) && lastEventId >= 0
      ? lastEventId
      : await wardenEventService.latestId();

  // nuxt/server's event is h3's at runtime. The portable surface has no event streams yet.
  const stream = createEventStream(event as unknown as H3Event);
  let closed = false;
  let lastPush = Date.now();

  async function poll() {
    while (!closed) {
      const events = await wardenEventService.since(cursor);
      for (const { id, event: message } of events) {
        await stream.push({
          id: String(id),
          event: message.type,
          data: JSON.stringify(message.data),
        });
        cursor = id;
        lastPush = Date.now();
      }
      if (Date.now() - lastPush > PING_MS) {
        // Keeps proxies from closing an idle connection.
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
});
