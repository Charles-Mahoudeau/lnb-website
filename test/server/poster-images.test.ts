import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { poster } from '~~/server/db/schema';
import { eventImageService, treatedName } from '~~/server/services/events/images';

import { allColors } from '#shared/utils/posters';

// The event-images storage, in memory. Without metadata, every file counts as old enough to prune.
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

const ART = `${'1'.repeat(64)}.webp`;
const PHOTO = `${'2'.repeat(64)}.webp`;
const UNUSED = `${'3'.repeat(64)}.webp`;

beforeAll(async () => {
  const png = await sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .webp()
    .toBuffer();
  for (const key of [ART, PHOTO, UNUSED]) await storage.setItemRaw(key, png);
});

describe('treated art', () => {
  it('maps light to the tint for duotone, and keeps the result', async () => {
    const bytes = await eventImageService.treated(ART, 'duotone', 'red');
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(40);
    // White becomes the light red, give or take the WebP encoding.
    expect(data[0]).toBeGreaterThan(0xf2 - 8);
    expect(data[1]).toBeLessThan(0x5c + 8);
    expect(await storage.hasItem(treatedName(ART, 'duotone', 'red'))).toBe(true);
    expect(await eventImageService.treated(ART, 'duotone', 'red')).toEqual(bytes);
  });

  it('ignores the tint for the dark treatments', () => {
    expect(treatedName(ART, 'darkStrong', 'red')).toBe(treatedName(ART, 'darkStrong', 'violet'));
    expect(treatedName(ART, 'duotone', 'red')).not.toBe(treatedName(ART, 'duotone', 'violet'));
  });

  it('refuses an image that isn’t stored', async () => {
    await expect(
      eventImageService.treated(UNUSED.replace('3', '4'), 'darkMedium', 'violet'),
    ).rejects.toMatchObject({ data: { problem: 'imageNotFound' } });
  });
});

describe('pruning', () => {
  it('keeps the art, treated art and photos of posters', async () => {
    await db.insert(poster).values({
      name: 'Pruning',
      template: 'artTitle',
      treatment: 'darkMedium',
      overrides: { art: { key: ART, focusX: 0.5, focusY: 0.5 } },
      content: {
        sticker: ['', '', ''],
        footer: '',
        qrEnabled: false,
        qrLabel: null,
        photos: [null, { key: PHOTO, focusX: 0.5, focusY: 0.5 }],
        colors: allColors('violet'),
      },
    });
    await eventImageService.treated(ART, 'darkMedium', 'violet');
    const stale = treatedName(ART, 'duotone', 'red');
    expect(await storage.hasItem(stale)).toBe(true);

    await eventImageService.prune();
    expect(await storage.hasItem(ART)).toBe(true);
    expect(await storage.hasItem(PHOTO)).toBe(true);
    expect(await storage.hasItem(treatedName(ART, 'darkMedium', 'violet'))).toBe(true);
    expect(await storage.hasItem(stale)).toBe(false);
    expect(await storage.hasItem(UNUSED)).toBe(false);
  });
});
