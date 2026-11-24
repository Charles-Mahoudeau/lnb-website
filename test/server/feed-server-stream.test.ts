import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import getServerEvents from '~~/server/api/feed/server/events.get';
import { flagService } from '~~/server/services/flags';
import { streamMinecraftEvents } from '~~/server/utils/minecraft-event-stream';

import { secret, setFlags, stubServerUtils, wipe } from './feed-helpers';
import { closeOpened, openStream } from './feed-live-http-helpers';

// The Minecraft server's Feed stream (docs/feed-mod.md, 8.1), served by the helper the economy's
// and the quests' streams share: it starts with a ping, so the mod has its headers at once, and it
// closes when `feed` or `feed.serverApi` goes off, so the mod's reconnection meets the refusal.

vi.mock('h3', async () => (await import((await import('./nitro-h3')).nitroH3())) as object);

const asServer = () => ({ authorization: `Bearer ${secret()}` });

describe('the Minecraft server’s Feed stream', () => {
  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('streamMinecraftEvents', streamMinecraftEvents);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
  });
  afterEach(() => {
    closeOpened();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts with a ping, without waiting for an event or 25 quiet seconds', async () => {
    const started = Date.now();
    const stream = await openStream(getServerEvents, null, asServer());
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const [first] = await stream.read((events) => events.length > 0, 1000);
    expect(first).toEqual({ id: undefined, event: 'ping', data: '{}' });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  for (const flag of ['feed', 'feed.serverApi'] as const) {
    it(`closes an open stream when ${flag} goes off, and refuses the reconnection`, async () => {
      const stream = await openStream(getServerEvents, null, asServer());
      await stream.read((events) => events.length > 0, 1000);
      setFlags({ [flag]: false });
      // The helper looks at the flags (through their cache) at each poll, once a second.
      const events = await stream.read(() => false, 3000);
      expect(events.map((one) => one.event)).toEqual(['ping']);
      const again = await openStream(getServerEvents, null, asServer());
      expect(again.error).toEqual({ statusCode: 503, data: { problem: 'disabled', flag } });
    });
  }

  it('keeps the stream open when the flags can’t be read', async () => {
    const stream = await openStream(getServerEvents, null, asServer());
    await stream.read((events) => events.length > 0, 1000);
    vi.spyOn(flagService, 'isEnabled').mockRejectedValue(new Error('database away'));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setFlags();
    // Still open: a ping or an event can still come, and reading doesn't end.
    const ended = await Promise.race([
      stream
        .read(() => false, 5000)
        .then(() => true)
        .catch(() => false),
      new Promise((resolve) =>
        setTimeout(() => {
          resolve(false);
        }, 1200),
      ),
    ]);
    expect(ended).toBe(false);
  });
});
