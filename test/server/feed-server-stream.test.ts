import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import getServerEvents from '~~/server/api/feed/server/events.get';
import { streamMinecraftEvents } from '~~/server/utils/minecraft-event-stream';

import { secret, setFlags, stubServerUtils, wipe } from './feed-helpers';
import { closeOpened, openStream } from './feed-live-http-helpers';

// The Minecraft server's Feed stream (docs/feed-mod.md, 8.1), served by the helper the economy's
// and the quests' streams share: it starts with a ping, so the mod has its headers at once.

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
});
