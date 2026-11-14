import { and, asc, count, desc, eq, ilike, isNotNull, sql } from 'drizzle-orm';
import { useStorage } from 'nitropack/runtime';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { gamesplanetGame, gamesplanetPin, gamesplanetSetting } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { gamesplanetService } from '~~/server/services/gamesplanet';

import {
  GAMESPLANET_DEALS_SHOWN,
  GAMESPLANET_MAX_PINS,
  type GamesplanetAdminGame,
  type GamesplanetAdminView,
  type GamesplanetProblem,
  type GamesplanetPublicView,
  type GamesplanetSearchView,
  type GamesplanetSyncView,
} from '#shared/schemas/gamesplanet';
import { discountPercent, withRef } from '#shared/utils/gamesplanet';

// The public and admin sides of the Gamesplanet promotion: which deals are shown, and the pins
// and affiliate ref admins control. The feeds themselves are read by gamesplanet.ts.

const SITE_URL = 'https://fr.gamesplanet.com/';
const COVER_PATH = '/api/gamesplanet/covers/';
const CHARTS_PREVIEW = 10;
const SEARCH_LIMIT = 10;

function refuse(status: number, problem: GamesplanetProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

type GameRow = typeof gamesplanetGame.$inferSelect;

function toGame(row: GameRow, ref: string, pinned: boolean, now: Date): GamesplanetAdminGame {
  const discount = discountPercent(row.priceCents, row.basePriceCents);
  return {
    uid: row.uid,
    name: row.name,
    publisher: row.publisher,
    url: withRef(row.url, ref),
    priceCents: row.priceCents,
    basePriceCents: row.basePriceCents,
    discountPercent: discount,
    // An end date only means something for a flash price, and not once it has passed.
    endsAt:
      discount !== null && row.flashEndsAt && row.flashEndsAt > now
        ? row.flashEndsAt.toISOString()
        : null,
    cover: row.teaserKey ? `${COVER_PATH}${row.teaserKey}` : null,
    packshot: row.packshotKey ? `${COVER_PATH}${row.packshotKey}` : null,
    pinned,
    chartRank: row.chartRank,
    availableInFrance: row.availableInFrance,
    pegi: row.pegi,
  };
}

/** The pinned games, in order. A pinned game France can't buy is skipped. */
async function pinnedRows(): Promise<GameRow[]> {
  const rows = await db
    .select({ game: gamesplanetGame })
    .from(gamesplanetPin)
    .innerJoin(gamesplanetGame, eq(gamesplanetGame.uid, gamesplanetPin.uid))
    .orderBy(asc(gamesplanetPin.position));
  return rows.map((row) => row.game);
}

/** Pinned games first, then the best sellers France can buy, up to three in all. */
async function listPublic(now = new Date()): Promise<GamesplanetPublicView> {
  const ref = await gamesplanetService.refCode();
  const pins = (await pinnedRows()).filter((row) => row.availableInFrance);
  const pinnedUids = new Set(pins.map((row) => row.uid));
  const charts = await db
    .select()
    .from(gamesplanetGame)
    .where(and(isNotNull(gamesplanetGame.chartRank), eq(gamesplanetGame.availableInFrance, true)))
    .orderBy(asc(gamesplanetGame.chartRank))
    .limit(GAMESPLANET_DEALS_SHOWN + GAMESPLANET_MAX_PINS);
  const deals = [
    ...pins.map((row) => toGame(row, ref, true, now)),
    ...charts.filter((row) => !pinnedUids.has(row.uid)).map((row) => toGame(row, ref, false, now)),
  ]
    .slice(0, GAMESPLANET_DEALS_SHOWN)
    .map(({ chartRank: _rank, availableInFrance: _fr, pegi: _pegi, ...deal }) => deal);
  return { deals, siteUrl: withRef(SITE_URL, ref) };
}

async function getCover(key: string): Promise<Buffer | null> {
  const bytes = await useStorage('gamesplanet-covers').getItemRaw<Buffer | Uint8Array>(key);
  return bytes ? Buffer.from(bytes) : null;
}

// Admin

async function listAdmin(now = new Date()): Promise<GamesplanetAdminView> {
  const setting = await gamesplanetService.readSetting();
  const ref = setting.refCode;
  const pins = await pinnedRows();
  const pinned = new Set(pins.map((row) => row.uid));
  const charts = await db
    .select()
    .from(gamesplanetGame)
    .where(isNotNull(gamesplanetGame.chartRank))
    .orderBy(asc(gamesplanetGame.chartRank))
    .limit(CHARTS_PREVIEW);
  const [totals] = await db
    .select({
      games: count(),
      charts: count(gamesplanetGame.chartRank),
      covers: sql<number>`count(*) filter (where ${gamesplanetGame.teaserKey} is not null)`.mapWith(
        Number,
      ),
    })
    .from(gamesplanetGame);
  return {
    refCode: ref,
    pins: pins.map((row) => toGame(row, ref, true, now)),
    charts: charts.map((row) => toGame(row, ref, pinned.has(row.uid), now)),
    stats: {
      games: totals?.games ?? 0,
      charts: totals?.charts ?? 0,
      covers: totals?.covers ?? 0,
      catalogSyncedAt: setting.catalogSyncedAt?.toISOString() ?? null,
      dealsSyncedAt: setting.dealsSyncedAt?.toISOString() ?? null,
    },
  };
}

async function setRefCode(input: { actorId: string; refCode: string }): Promise<void> {
  await gamesplanetService.readSetting();
  await db.transaction(async (tx) => {
    await tx
      .update(gamesplanetSetting)
      .set({ refCode: input.refCode })
      .where(eq(gamesplanetSetting.id, 1));
    await adminAuditService.record(tx, {
      action: 'gamesplanet.settings',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { refCode: input.refCode },
    });
  });
}

/** Games whose name contains the text, best sellers first. */
async function search(query: string, now = new Date()): Promise<GamesplanetSearchView> {
  const ref = await gamesplanetService.refCode();
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  const rows = await db
    .select()
    .from(gamesplanetGame)
    .where(ilike(gamesplanetGame.name, `%${escaped}%`))
    .orderBy(sql`${gamesplanetGame.chartRank} asc nulls last`, asc(gamesplanetGame.name))
    .limit(SEARCH_LIMIT);
  const pinned = new Set((await pinnedRows()).map((row) => row.uid));
  return { games: rows.map((row) => toGame(row, ref, pinned.has(row.uid), now)) };
}

async function pin(input: { actorId: string; uid: string }): Promise<void> {
  await db.transaction(async (tx) => {
    // Two admins pinning at once must not pass the limit together.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('gamesplanet_pin'))`);
    const [game] = await tx
      .select({ uid: gamesplanetGame.uid, available: gamesplanetGame.availableInFrance })
      .from(gamesplanetGame)
      .where(eq(gamesplanetGame.uid, input.uid));
    if (!game) refuse(404, 'gameNotFound');
    if (!game.available) refuse(409, 'notSoldInFrance');
    const pins = await tx.select().from(gamesplanetPin).orderBy(desc(gamesplanetPin.position));
    if (pins.some((row) => row.uid === input.uid)) refuse(409, 'alreadyPinned');
    if (pins.length >= GAMESPLANET_MAX_PINS) refuse(409, 'tooManyPins');
    await tx
      .insert(gamesplanetPin)
      .values({ uid: input.uid, position: (pins[0]?.position ?? 0) + 1 });
    await adminAuditService.record(tx, {
      action: 'gamesplanet.pin',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { uid: input.uid },
    });
  });
}

async function unpin(input: { actorId: string; uid: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(gamesplanetPin)
      .where(eq(gamesplanetPin.uid, input.uid))
      .returning({ uid: gamesplanetPin.uid });
    if (!removed.length) refuse(404, 'pinNotFound');
    await adminAuditService.record(tx, {
      action: 'gamesplanet.unpin',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { uid: input.uid },
    });
  });
}

/** Swaps a pin with its neighbour. Moving the first up or the last down does nothing. */
async function movePin(input: { uid: string; direction: 'up' | 'down' }): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('gamesplanet_pin'))`);
    const pins = await tx.select().from(gamesplanetPin).orderBy(asc(gamesplanetPin.position));
    const index = pins.findIndex((row) => row.uid === input.uid);
    if (index === -1) refuse(404, 'pinNotFound');
    const other = pins[input.direction === 'up' ? index - 1 : index + 1];
    if (!other) return;
    const mine = pins[index]!;
    await tx
      .update(gamesplanetPin)
      .set({ position: other.position })
      .where(eq(gamesplanetPin.uid, mine.uid));
    await tx
      .update(gamesplanetPin)
      .set({ position: mine.position })
      .where(eq(gamesplanetPin.uid, other.uid));
  });
}

/** Reads a feed now. The deals feed is the best sellers and flash sales, with their covers. */
async function syncNow(input: {
  actorId: string;
  feed: 'deals' | 'catalog';
}): Promise<GamesplanetSyncView> {
  let result: GamesplanetSyncView;
  try {
    if (input.feed === 'catalog') {
      const { games, unchanged } = await gamesplanetService.syncCatalog();
      result = { games, unchanged };
    } else {
      const answer = await gamesplanetService.syncDeals();
      if ('error' in answer.charts || 'error' in answer.flash) refuse(502, 'syncFailed');
      result = {
        games: answer.charts.games + answer.flash.games,
        unchanged: answer.charts.unchanged && answer.flash.unchanged,
      };
    }
  } catch (error) {
    console.error('Gamesplanet: manual sync failed', error);
    return refuse(502, 'syncFailed');
  }
  await db.transaction(async (tx) => {
    await adminAuditService.record(tx, {
      action: 'gamesplanet.sync',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { feed: input.feed },
    });
  });
  return result;
}

export const gamesplanetDealsService = {
  listPublic,
  getCover,
  listAdmin,
  setRefCode,
  search,
  pin,
  unpin,
  movePin,
  syncNow,
};
