import { createHash } from 'node:crypto';

import { and, asc, eq, inArray, isNotNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { useStorage } from 'nitropack/runtime';
import sharp from 'sharp';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { gamesplanetGame, gamesplanetPin, gamesplanetSetting } from '~~/server/db/schema';

import { coverSourceUrl, isGamesplanetImageUrl, parseProducts } from '#shared/utils/gamesplanet';
import type { GamesplanetProduct } from '#shared/utils/gamesplanet';

// The Gamesplanet affiliate promotion. This is the data side: Gamesplanet's product feeds are
// read into a compact catalog, and the covers of the games we show are copied to our own disk.
// Their iframe banners are never used. See docs/gamesplanet.md.

const FEED_BASE = 'https://fr.gamesplanet.com/api/v1/products';
const FEED_TIMEOUT_MS = 90_000;
const FEED_MAX_BYTES = 40 * 1024 * 1024;
/** A catalog smaller than this is a broken answer, not a real one. */
const MIN_CATALOG = 500;
const BATCH = 500;
/** Games no feed has listed for this long are removed. */
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

const IMAGE_TIMEOUT_MS = 15_000;
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const TEASER_WIDTH = 620;
const PACKSHOT_WIDTH = 500;
/** How many of the best sellers get covers: a few more than are shown, for games not sold in France. */
const COVER_CHARTS = 8;
/** A cover stored this recently may not be attached to its game yet. */
const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;

type Feed = 'catalog' | 'charts' | 'flash';
const FEED_FILES: Record<Feed, string> = { catalog: 'feed', charts: 'charts', flash: 'flash' };

function covers() {
  return useStorage('gamesplanet-covers');
}

async function readSetting() {
  await db.insert(gamesplanetSetting).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(gamesplanetSetting);
  return row!;
}

/** The affiliate ref added to every link to Gamesplanet. */
async function refCode(): Promise<string> {
  return (await readSetting()).refCode;
}

// Feeds

type FeedAnswer = { unchanged: true } | { unchanged: false; xml: string; etag: string | null };

async function fetchFeed(feed: Feed, etag: string | null): Promise<FeedAnswer> {
  const response = await fetch(`${FEED_BASE}/${FEED_FILES[feed]}.xml`, {
    headers: etag ? { 'if-none-match': etag } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (response.status === 304) return { unchanged: true };
  if (!response.ok) throw new Error(`Gamesplanet ${feed} feed answered ${String(response.status)}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > FEED_MAX_BYTES) throw new Error(`Gamesplanet ${feed} feed is too large`);
  return {
    unchanged: false,
    xml: new TextDecoder().decode(bytes),
    etag: response.headers.get('etag'),
  };
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

type Extra = 'chartRank' | 'flashEndsAt';

/**
 * Inserts or updates games. A changed source image drops our copy so it is downloaded again.
 * `extra` adds the columns only charts or flash know about.
 */
async function upsertGames(
  tx: Tx,
  products: readonly GamesplanetProduct[],
  extra?: { column: Extra; values: ReadonlyMap<string, number | Date> },
): Promise<void> {
  const now = new Date();
  for (let i = 0; i < products.length; i += BATCH) {
    const rows = products.slice(i, i + BATCH).map((p) => ({
      uid: p.uid,
      name: p.name,
      publisher: p.publisher,
      category: p.category,
      priceCents: p.priceCents,
      basePriceCents: p.basePriceCents,
      steamId: p.steamId,
      pegi: p.pegi,
      url: p.url,
      packshotUrl: p.packshotUrl,
      teaserUrl: p.teaserUrl,
      availableInFrance: p.availableInFrance,
      seenAt: now,
      updatedAt: now,
      ...(extra?.column === 'chartRank' ? { chartRank: extra.values.get(p.uid) as number } : {}),
      ...(extra?.column === 'flashEndsAt' ? { flashEndsAt: extra.values.get(p.uid) as Date } : {}),
    }));
    await tx
      .insert(gamesplanetGame)
      .values(rows)
      .onConflictDoUpdate({
        target: gamesplanetGame.uid,
        set: {
          name: excluded('name'),
          publisher: excluded('publisher'),
          category: excluded('category'),
          priceCents: excluded('price_cents'),
          basePriceCents: excluded('base_price_cents'),
          steamId: excluded('steam_id'),
          pegi: excluded('pegi'),
          url: excluded('url'),
          packshotKey: sql`CASE WHEN ${gamesplanetGame.packshotUrl} IS NOT DISTINCT FROM excluded.packshot_url THEN ${gamesplanetGame.packshotKey} END`,
          teaserKey: sql`CASE WHEN ${gamesplanetGame.teaserUrl} IS NOT DISTINCT FROM excluded.teaser_url THEN ${gamesplanetGame.teaserKey} END`,
          packshotUrl: excluded('packshot_url'),
          teaserUrl: excluded('teaser_url'),
          availableInFrance: excluded('available_in_france'),
          seenAt: excluded('seen_at'),
          updatedAt: excluded('updated_at'),
          ...(extra?.column === 'chartRank' ? { chartRank: excluded('chart_rank') } : {}),
          ...(extra?.column === 'flashEndsAt' ? { flashEndsAt: excluded('flash_ends_at') } : {}),
        },
      });
  }
}

/** Reads the whole catalog. Run every night. Returns how many games it listed. */
async function syncCatalog(): Promise<{ games: number; removed: number; unchanged: boolean }> {
  const setting = await readSetting();
  const answer = await fetchFeed('catalog', setting.catalogEtag);
  if (answer.unchanged) return { games: 0, removed: 0, unchanged: true };
  const products = parseProducts(answer.xml);
  if (products.length < MIN_CATALOG) throw new Error('Gamesplanet catalog looks broken');
  const removed = await db.transaction(async (tx) => {
    await upsertGames(tx, products);
    const gone = await tx
      .delete(gamesplanetGame)
      .where(lt(gamesplanetGame.seenAt, new Date(Date.now() - STALE_MS)))
      .returning({ uid: gamesplanetGame.uid });
    await tx
      .update(gamesplanetSetting)
      .set({ catalogEtag: answer.etag, catalogSyncedAt: new Date() })
      .where(eq(gamesplanetSetting.id, 1));
    return gone.length;
  });
  return { games: products.length, removed, unchanged: false };
}

/** Reads the best sellers. The order of the feed is the order of the list. */
async function syncCharts(): Promise<{ games: number; unchanged: boolean }> {
  const setting = await readSetting();
  const answer = await fetchFeed('charts', setting.chartsEtag);
  if (answer.unchanged) return { games: 0, unchanged: true };
  const products = parseProducts(answer.xml);
  // An empty list would erase the best sellers: keep the last good one instead.
  if (!products.length) throw new Error('Gamesplanet charts are empty');
  const ranks = new Map(products.map((p, index) => [p.uid, index + 1]));
  await db.transaction(async (tx) => {
    await tx
      .update(gamesplanetGame)
      .set({ chartRank: null })
      .where(isNotNull(gamesplanetGame.chartRank));
    await upsertGames(tx, products, { column: 'chartRank', values: ranks });
    await tx
      .update(gamesplanetSetting)
      .set({ chartsEtag: answer.etag })
      .where(eq(gamesplanetSetting.id, 1));
  });
  return { games: products.length, unchanged: false };
}

/** Reads the flash sales, for the end date of a flash price. */
async function syncFlash(): Promise<{ games: number; unchanged: boolean }> {
  const setting = await readSetting();
  const answer = await fetchFeed('flash', setting.flashEtag);
  if (answer.unchanged) return { games: 0, unchanged: true };
  const products = parseProducts(answer.xml);
  const ends = new Map(
    products.flatMap((p) => (p.flashEndsAt ? [[p.uid, p.flashEndsAt] as const] : [])),
  );
  await db.transaction(async (tx) => {
    await tx
      .update(gamesplanetGame)
      .set({ flashEndsAt: null })
      .where(isNotNull(gamesplanetGame.flashEndsAt));
    await upsertGames(
      tx,
      products.filter((p) => ends.has(p.uid)),
      { column: 'flashEndsAt', values: ends },
    );
    await tx
      .update(gamesplanetSetting)
      .set({ flashEtag: answer.etag })
      .where(eq(gamesplanetSetting.id, 1));
  });
  return { games: products.length, unchanged: false };
}

// Covers

/**
 * The games whose covers we keep: the ones admins pinned, and the best sellers that France can
 * buy. Games attached to events join this list in a later step.
 */
async function coverUids(): Promise<string[]> {
  const pins = await db
    .select({ uid: gamesplanetPin.uid })
    .from(gamesplanetPin)
    .orderBy(asc(gamesplanetPin.position));
  const rows = await db
    .select({ uid: gamesplanetGame.uid })
    .from(gamesplanetGame)
    .where(and(isNotNull(gamesplanetGame.chartRank), eq(gamesplanetGame.availableInFrance, true)))
    .orderBy(asc(gamesplanetGame.chartRank))
    .limit(COVER_CHARTS);
  return [...new Set([...pins.map((pin) => pin.uid), ...rows.map((row) => row.uid)])];
}

/** Downloads one image from Gamesplanet and stores it as WebP under the SHA-256 of its bytes. */
async function storeCover(source: string, width: number): Promise<string> {
  const from = coverSourceUrl(source);
  if (!isGamesplanetImageUrl(from)) throw new Error('Cover is not on a Gamesplanet host');
  const response = await fetch(from, {
    redirect: 'error',
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Cover answered ${String(response.status)}`);
  const input = Buffer.from(await response.arrayBuffer());
  if (input.length === 0 || input.length > IMAGE_MAX_BYTES) throw new Error('Cover has a bad size');
  const bytes = await sharp(input, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const key = `${createHash('sha256').update(bytes).digest('hex')}.webp`;
  if (!(await covers().hasItem(key))) await covers().setItemRaw(key, bytes);
  return key;
}

/** Downloads the covers the given games are missing. A failed one is logged and tried next time. */
async function ensureCovers(uids: readonly string[]): Promise<{ stored: number; failed: number }> {
  if (!uids.length) return { stored: 0, failed: 0 };
  const rows = await db
    .select()
    .from(gamesplanetGame)
    .where(inArray(gamesplanetGame.uid, [...uids]));
  let stored = 0;
  let failed = 0;
  for (const row of rows) {
    const jobs = [
      row.teaserUrl && !row.teaserKey
        ? { url: row.teaserUrl, width: TEASER_WIDTH, column: 'teaserKey' as const }
        : null,
      row.packshotUrl && !row.packshotKey
        ? { url: row.packshotUrl, width: PACKSHOT_WIDTH, column: 'packshotKey' as const }
        : null,
    ];
    for (const job of jobs) {
      if (!job) continue;
      try {
        const key = await storeCover(job.url, job.width);
        // Only if the source didn't change while downloading.
        await db
          .update(gamesplanetGame)
          .set({ [job.column]: key })
          .where(
            and(
              eq(gamesplanetGame.uid, row.uid),
              eq(
                job.column === 'teaserKey'
                  ? gamesplanetGame.teaserUrl
                  : gamesplanetGame.packshotUrl,
                job.url,
              ),
            ),
          );
        stored++;
      } catch (error) {
        failed++;
        console.error(`Gamesplanet: cover of ${row.uid} failed`, error);
      }
    }
  }
  return { stored, failed };
}

/** The best sellers and flash sales, then the covers the page needs. Run every few hours. */
async function syncDeals(): Promise<{
  charts: { games: number; unchanged: boolean } | { error: true };
  flash: { games: number; unchanged: boolean } | { error: true };
  covers: { stored: number; failed: number };
}> {
  // The two feeds are independent: one failing must not stop the other.
  const attempt = async <T>(feed: string, run: () => Promise<T>): Promise<T | { error: true }> => {
    try {
      return await run();
    } catch (error) {
      console.error(`Gamesplanet: ${feed} sync failed`, error);
      return { error: true };
    }
  };
  const charts = await attempt('charts', syncCharts);
  const flash = await attempt('flash', syncFlash);
  if (!('error' in charts) && !('error' in flash)) {
    await db
      .update(gamesplanetSetting)
      .set({ dealsSyncedAt: new Date() })
      .where(eq(gamesplanetSetting.id, 1));
  }
  return { charts, flash, covers: await ensureCovers(await coverUids()) };
}

/**
 * Forgets the covers of games we no longer show, then deletes the files nothing uses, after a
 * day. Returns how many files were removed.
 */
async function pruneCovers(now = new Date()): Promise<number> {
  const wanted = await coverUids();
  await db
    .update(gamesplanetGame)
    .set({ teaserKey: null, packshotKey: null })
    .where(
      and(
        or(isNotNull(gamesplanetGame.teaserKey), isNotNull(gamesplanetGame.packshotKey)),
        wanted.length ? notInArray(gamesplanetGame.uid, wanted) : undefined,
      ),
    );
  const rows = await db
    .select({ teaser: gamesplanetGame.teaserKey, packshot: gamesplanetGame.packshotKey })
    .from(gamesplanetGame);
  const used = new Set(rows.flatMap((row) => [row.teaser, row.packshot]));
  let removed = 0;
  for (const key of await covers().getKeys()) {
    if (used.has(key)) continue;
    const { mtime } = await covers().getMeta(key);
    if (mtime && now.getTime() - new Date(mtime).getTime() < PRUNE_GRACE_MS) continue;
    await covers().removeItem(key);
    removed++;
  }
  return removed;
}

export const gamesplanetService = {
  refCode,
  syncCatalog,
  syncCharts,
  syncFlash,
  syncDeals,
  readSetting,
  ensureCovers,
  coverUids,
  pruneCovers,
};
