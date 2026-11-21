import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { eventImageService } from '~~/server/services/events/images';

// The event-images storage, in memory.
const files = new Map<string, Buffer>();
const storage = {
  hasItem: (key: string) => Promise.resolve(files.has(key)),
  getItemRaw: (key: string) => Promise.resolve(files.get(key) ?? null),
  setItemRaw: (key: string, bytes: Buffer) => Promise.resolve(void files.set(key, bytes)),
  removeItem: (key: string) => Promise.resolve(void files.delete(key)),
  getKeys: () => Promise.resolve([...files.keys()]),
  getMeta: () => Promise.resolve({}),
};
vi.mock('nitropack/runtime', () => ({ useStorage: () => storage }));

const png = (width: number) =>
  sharp({ create: { width, height: 10, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer();

describe('changelog images', () => {
  it('stores a PNG as WebP under the changelog prefix, scaled down to 1600 pixels', async () => {
    const stored = await eventImageService.ingestChangelog(await png(2000));
    expect(stored.key).toMatch(/^changelog-[0-9a-f]{64}\.webp$/);
    expect(stored.width).toBe(1600);
    expect(files.has(stored.key)).toBe(true);
    expect((await eventImageService.get(stored.key))?.type).toBe('image/webp');
  });

  it('refuses a file that only has an image name', async () => {
    await expect(eventImageService.ingestChangelog(Buffer.from('<svg/>'))).rejects.toMatchObject({
      statusText: 'imageUnreadable',
    });
  });

  it('refuses a file over 5 MB', async () => {
    await expect(
      eventImageService.ingestChangelog(Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ statusText: 'imageTooLarge' });
  });

  it('is never pruned with the unused event images', async () => {
    const stored = await eventImageService.ingestChangelog(await png(20));
    await eventImageService.prune(new Date());
    expect(files.has(stored.key)).toBe(true);
  });
});
