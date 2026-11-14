import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { gamesplanetGame, gamesplanetSetting } from '~~/server/db/schema';
import { gamesplanetService } from '~~/server/services/gamesplanet';

// The gamesplanet-covers storage, in memory, with a way to age a file.
const files = new Map<string, { bytes: Buffer; mtime: Date }>();
const storage = {
  hasItem: (key: string) => Promise.resolve(files.has(key)),
  setItemRaw: (key: string, bytes: Buffer) => {
    files.set(key, { bytes, mtime: new Date() });
    return Promise.resolve();
  },
  getKeys: () => Promise.resolve([...files.keys()]),
  getMeta: (key: string) => Promise.resolve({ mtime: files.get(key)?.mtime }),
  removeItem: (key: string) => {
    files.delete(key);
    return Promise.resolve();
  },
};
vi.mock('nitropack/runtime', () => ({ useStorage: () => storage }));

function product(uid: string, extra: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    uid,
    name: `Game ${uid}`,
    price: '9.99',
    price_base: '19.99',
    link: `https://fr.gamesplanet.com/game/game-${uid}-steam-key--${uid}?ref=teknantes`,
    packshot: `https://fr.gamesplanet.com/acache/${uid}/packshot.jpg`,
    teaser620: `https://fr.gamesplanet.com/acache/${uid}/teaser.jpg`,
    ...extra,
  };
  const body = Object.entries(fields)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join('');
  return `<product>${body}</product>`;
}
const feed = (...products: string[]) => `<products>${products.join('')}</products>`;

interface Answer {
  status?: number;
  body?: string | Buffer;
  etag?: string;
}
let answers: Record<string, Answer>;
let requested: { url: string; ifNoneMatch: string | null }[];

beforeEach(async () => {
  files.clear();
  answers = {};
  requested = [];
  await db.delete(gamesplanetGame);
  await db.delete(gamesplanetSetting);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { headers?: Record<string, string> }) => {
      requested.push({ url, ifNoneMatch: init?.headers?.['if-none-match'] ?? null });
      const answer = answers[url];
      if (!answer) return Promise.reject(new Error(`unexpected fetch ${url}`));
      const status = answer.status ?? 200;
      const body = typeof answer.body === 'object' ? new Uint8Array(answer.body) : answer.body;
      return Promise.resolve(
        new Response(status === 304 ? null : (body ?? ''), {
          status,
          headers: answer.etag ? { etag: answer.etag } : {},
        }),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const CHARTS = 'https://fr.gamesplanet.com/api/v1/products/charts.xml';
const FLASH = 'https://fr.gamesplanet.com/api/v1/products/flash.xml';
const CATALOG = 'https://fr.gamesplanet.com/api/v1/products/feed.xml';

async function row(uid: string) {
  const [game] = await db.select().from(gamesplanetGame).where(eq(gamesplanetGame.uid, uid));
  return game;
}

// Covers are stored under the hash of their bytes, so two images need to differ to be two files.
let shade = 0;
async function png(): Promise<Buffer> {
  shade = (shade + 17) % 256;
  return sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: shade, g: 80, b: 120 } },
  })
    .png()
    .toBuffer();
}

describe('best sellers', () => {
  it('ranks games in the feed order and drops the ones that left the list', async () => {
    answers[CHARTS] = { body: feed(product('1-1'), product('2-1'), product('3-1')), etag: 'W/"a"' };
    await gamesplanetService.syncCharts();
    expect([(await row('1-1'))?.chartRank, (await row('2-1'))?.chartRank]).toEqual([1, 2]);

    answers[CHARTS] = { body: feed(product('3-1'), product('1-1')), etag: 'W/"b"' };
    await gamesplanetService.syncCharts();
    expect((await row('3-1'))?.chartRank).toBe(1);
    expect((await row('1-1'))?.chartRank).toBe(2);
    expect((await row('2-1'))?.chartRank).toBeNull();
  });

  it('stores prices in cents and strips the ref from the link', async () => {
    answers[CHARTS] = { body: feed(product('1-1')) };
    await gamesplanetService.syncCharts();
    expect(await row('1-1')).toMatchObject({
      priceCents: 999,
      basePriceCents: 1999,
      url: 'https://fr.gamesplanet.com/game/game-1-1-steam-key--1-1',
      availableInFrance: true,
    });
  });

  it('asks again with the last ETag and does nothing when nothing changed', async () => {
    answers[CHARTS] = { body: feed(product('1-1')), etag: 'W/"a"' };
    await gamesplanetService.syncCharts();
    answers[CHARTS] = { status: 304 };
    expect(await gamesplanetService.syncCharts()).toEqual({ games: 0, unchanged: true });
    expect(requested.at(-1)?.ifNoneMatch).toBe('W/"a"');
    expect((await row('1-1'))?.chartRank).toBe(1);
  });

  it('keeps the last list when the feed comes back empty or fails', async () => {
    answers[CHARTS] = { body: feed(product('1-1')) };
    await gamesplanetService.syncCharts();
    answers[CHARTS] = { body: feed() };
    await expect(gamesplanetService.syncCharts()).rejects.toThrow('empty');
    answers[CHARTS] = { status: 503 };
    await expect(gamesplanetService.syncCharts()).rejects.toThrow('503');
    expect((await row('1-1'))?.chartRank).toBe(1);
  });
});

describe('flash sales', () => {
  it('records the end of a flash price and clears it when the sale is over', async () => {
    answers[FLASH] = {
      body: feed(product('1-1', { price_end_at: '2026-11-18 01:00:00 +0100' })),
      etag: 'W/"f1"',
    };
    await gamesplanetService.syncFlash();
    expect((await row('1-1'))?.flashEndsAt?.toISOString()).toBe('2026-11-18T00:00:00.000Z');

    answers[FLASH] = {
      body: feed(product('2-1', { price_end_at: '2026-11-20 01:00:00 +0100' })),
      etag: 'W/"f2"',
    };
    await gamesplanetService.syncFlash();
    expect((await row('1-1'))?.flashEndsAt).toBeNull();
    expect((await row('2-1'))?.flashEndsAt).not.toBeNull();
  });
});

describe('catalog', () => {
  const many = (count: number) =>
    feed(...Array.from({ length: count }, (_, i) => product(`${String(i + 1)}-1`)));

  it('refuses a catalog that is too small to be real', async () => {
    answers[CATALOG] = { body: many(10) };
    await expect(gamesplanetService.syncCatalog()).rejects.toThrow('broken');
    expect(await db.select().from(gamesplanetGame)).toHaveLength(0);
  });

  it('keeps ranks and flash ends it knows nothing about, and removes games unseen for two weeks', async () => {
    answers[CHARTS] = { body: feed(product('1-1')) };
    await gamesplanetService.syncCharts();
    await db.insert(gamesplanetGame).values({
      uid: '999-1',
      name: 'Old game',
      priceCents: 100,
      basePriceCents: 100,
      url: 'https://fr.gamesplanet.com/game/old--999-1',
      seenAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    });
    answers[CATALOG] = { body: many(600), etag: 'W/"c"' };
    const result = await gamesplanetService.syncCatalog();
    expect(result).toEqual({ games: 600, removed: 1, unchanged: false });
    expect((await row('1-1'))?.chartRank).toBe(1);
    expect(await row('999-1')).toBeUndefined();
    const [setting] = await db.select().from(gamesplanetSetting);
    expect(setting?.catalogEtag).toBe('W/"c"');
  });
});

describe('covers', () => {
  it('copies the covers of the best sellers to our storage as WebP', async () => {
    answers[CHARTS] = { body: feed(product('1-1'), product('2-1', { country_blacklist: 'FR' })) };
    answers['https://gpstatic.com/acache/1-1/packshot.jpg'] = { body: await png() };
    answers['https://gpstatic.com/acache/1-1/teaser.jpg'] = { body: await png() };
    answers[FLASH] = { body: feed() };
    const result = await gamesplanetService.syncDeals();
    expect(result.covers).toEqual({ stored: 2, failed: 0 });
    const game = await row('1-1');
    expect(game?.teaserKey).toMatch(/^[0-9a-f]{64}\.webp$/);
    expect(game?.packshotKey).toMatch(/^[0-9a-f]{64}\.webp$/);
    expect(files.size).toBe(2);
    // A game France can't buy gets no cover.
    expect((await row('2-1'))?.teaserKey).toBeNull();
  });

  it('logs and skips a cover that fails, and tries it again next time', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    answers[CHARTS] = { body: feed(product('1-1')) };
    answers[FLASH] = { body: feed() };
    answers['https://gpstatic.com/acache/1-1/packshot.jpg'] = { status: 404 };
    answers['https://gpstatic.com/acache/1-1/teaser.jpg'] = { body: await png() };
    expect((await gamesplanetService.syncDeals()).covers).toEqual({ stored: 1, failed: 1 });
    answers['https://gpstatic.com/acache/1-1/packshot.jpg'] = { body: await png() };
    expect(await gamesplanetService.ensureCovers(['1-1'])).toEqual({ stored: 1, failed: 0 });
    error.mockRestore();
  });

  it('never fetches an image from another host', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await db.insert(gamesplanetGame).values({
      uid: '5-1',
      name: 'Odd',
      priceCents: 100,
      basePriceCents: 100,
      url: 'https://fr.gamesplanet.com/game/odd--5-1',
      teaserUrl: 'http://169.254.169.254/latest/meta-data',
    });
    expect(await gamesplanetService.ensureCovers(['5-1'])).toEqual({ stored: 0, failed: 1 });
    expect(requested).toHaveLength(0);
    error.mockRestore();
  });

  it('downloads a cover again when its source image changes', async () => {
    answers[CHARTS] = { body: feed(product('1-1')) };
    answers[FLASH] = { body: feed() };
    answers['https://gpstatic.com/acache/1-1/packshot.jpg'] = { body: await png() };
    answers['https://gpstatic.com/acache/1-1/teaser.jpg'] = { body: await png() };
    await gamesplanetService.syncDeals();
    expect((await row('1-1'))?.teaserKey).not.toBeNull();
    answers[CHARTS] = {
      body: feed(
        product('1-1', { teaser620: 'https://fr.gamesplanet.com/acache/1-1/teaser2.jpg' }),
      ),
    };
    await gamesplanetService.syncCharts();
    const game = await row('1-1');
    expect(game?.teaserKey).toBeNull();
    expect(game?.packshotKey).not.toBeNull();
  });

  it('forgets the covers of games no longer shown, and deletes unused files after a day', async () => {
    answers[CHARTS] = { body: feed(product('1-1')) };
    answers[FLASH] = { body: feed() };
    answers['https://gpstatic.com/acache/1-1/packshot.jpg'] = { body: await png() };
    answers['https://gpstatic.com/acache/1-1/teaser.jpg'] = { body: await png() };
    await gamesplanetService.syncDeals();
    // Still shown: nothing is removed, even a day later.
    expect(await gamesplanetService.pruneCovers(new Date(Date.now() + 2 * 86_400_000))).toBe(0);

    await db.update(gamesplanetGame).set({ chartRank: null });
    // The covers are forgotten at once, but their files wait for the grace period.
    expect(await gamesplanetService.pruneCovers()).toBe(0);
    expect((await row('1-1'))?.teaserKey).toBeNull();
    expect(files.size).toBe(2);
    expect(await gamesplanetService.pruneCovers(new Date(Date.now() + 2 * 86_400_000))).toBe(2);
    expect(files.size).toBe(0);
  });
});

describe('affiliate ref', () => {
  it('defaults to teknantes', async () => {
    expect(await gamesplanetService.refCode()).toBe('teknantes');
  });
});
