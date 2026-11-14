import { and, asc, count, desc, eq, gte, ilike, isNotNull, lt, sql } from 'drizzle-orm';
import { useStorage } from 'nitropack/runtime';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import {
  gamesplanetClick,
  gamesplanetGame,
  gamesplanetPin,
  gamesplanetSetting,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { gamesplanetService } from '~~/server/services/gamesplanet';

import {
  GAMESPLANET_DEALS_SHOWN,
  GAMESPLANET_MAX_PINS,
  GAMESPLANET_PLACEMENTS,
  type GamesplanetPlacement,
  type GamesplanetAdminGame,
  type GamesplanetAdminView,
  type GamesplanetDeal,
  type GamesplanetProblem,
  type GamesplanetPublicView,
  type GamesplanetSearchView,
  type GamesplanetSyncView,
} from '#shared/schemas/gamesplanet';
import { discountPercent, uidFromGameUrl, withRef } from '#shared/utils/gamesplanet';

// The public and admin sides of the Gamesplanet promotion: which deals are shown, and the pins
// and affiliate ref admins control. The feeds themselves are read by gamesplanet.ts.

const SITE_URL = 'https://fr.gamesplanet.com/';
const COVER_PATH = '/api/gamesplanet/covers/';
const CHARTS_PREVIEW = 10;
const SEARCH_LIMIT = 10;
const CLICK_DAYS = 30;
/** Counts older than this are deleted. */
const CLICK_KEEP_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Paris day of a date, as YYYY-MM-DD. */
function parisDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

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

function publicDeal({
  chartRank: _rank,
  availableInFrance: _fr,
  pegi: _pegi,
  ...deal
}: GamesplanetAdminGame): GamesplanetDeal {
  return deal;
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
    .map(publicDeal);
  return { deals, siteUrl: withRef(SITE_URL, ref) };
}

/** One game as a deal, or null when it isn't in the catalog. */
async function dealByUid(uid: string, now = new Date()): Promise<GamesplanetAdminGame | null> {
  const [row] = await db.select().from(gamesplanetGame).where(eq(gamesplanetGame.uid, uid));
  if (!row) return null;
  return toGame(row, await gamesplanetService.refCode(), false, now);
}

/** The deal on an event's page, or null when the game left the catalog. */
async function eventDeal(uid: string, now = new Date()): Promise<GamesplanetDeal | null> {
  const game = await dealByUid(uid, now);
  return game ? publicDeal(game) : null;
}

async function getCover(key: string): Promise<Buffer | null> {
  const bytes = await useStorage('gamesplanet-covers').getItemRaw<Buffer | Uint8Array>(key);
  return bytes ? Buffer.from(bytes) : null;
}

// Admin

/**
 * Where a click on `/go/gp/:uid` goes, or null when it goes nowhere: a game must be in the
 * catalog, so the route can't be made to redirect anywhere else. The click is counted by day,
 * placement and game, and nothing about who clicked is read.
 */
async function follow(input: {
  uid: string;
  from: GamesplanetPlacement | null;
  now?: Date;
}): Promise<string | null> {
  const ref = await gamesplanetService.refCode();
  let target: string;
  if (input.uid === 'site') {
    target = SITE_URL;
  } else {
    const [game] = await db
      .select({ url: gamesplanetGame.url })
      .from(gamesplanetGame)
      .where(eq(gamesplanetGame.uid, input.uid));
    if (!game) return null;
    target = game.url;
  }
  if (input.from) {
    await db
      .insert(gamesplanetClick)
      .values({
        day: parisDay(input.now ?? new Date()),
        placement: input.from,
        uid: input.uid,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [gamesplanetClick.day, gamesplanetClick.placement, gamesplanetClick.uid],
        set: { count: sql`${gamesplanetClick.count} + 1` },
      });
  }
  return withRef(target, ref);
}

/** Deletes the counts older than about a year. Returns how many rows went. */
async function pruneClicks(now = new Date()): Promise<number> {
  const gone = await db
    .delete(gamesplanetClick)
    .where(lt(gamesplanetClick.day, parisDay(new Date(now.getTime() - CLICK_KEEP_DAYS * DAY_MS))))
    .returning({ day: gamesplanetClick.day });
  return gone.length;
}

async function clickStats(now: Date): Promise<GamesplanetAdminView['clicks']> {
  const since = parisDay(new Date(now.getTime() - (CLICK_DAYS - 1) * DAY_MS));
  const recent = gte(gamesplanetClick.day, since);
  const places = await db
    .select({
      placement: gamesplanetClick.placement,
      total: sql<number>`sum(${gamesplanetClick.count})`.mapWith(Number),
    })
    .from(gamesplanetClick)
    .where(recent)
    .groupBy(gamesplanetClick.placement);
  const games = await db
    .select({
      uid: gamesplanetClick.uid,
      name: gamesplanetGame.name,
      total: sql<number>`sum(${gamesplanetClick.count})`.mapWith(Number),
    })
    .from(gamesplanetClick)
    .leftJoin(gamesplanetGame, eq(gamesplanetGame.uid, gamesplanetClick.uid))
    .where(and(recent, sql`${gamesplanetClick.uid} <> 'site'`))
    .groupBy(gamesplanetClick.uid, gamesplanetGame.name)
    .orderBy(sql`sum(${gamesplanetClick.count}) desc`)
    .limit(5);
  const byPlacement = GAMESPLANET_PLACEMENTS.map((placement) => ({
    placement,
    count: places.find((row) => row.placement === placement)?.total ?? 0,
  }));
  return {
    days: CLICK_DAYS,
    total: byPlacement.reduce((sum, row) => sum + row.count, 0),
    byPlacement,
    topGames: games.map((row) => ({ uid: row.uid, name: row.name, count: row.total })),
  };
}

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
    clicks: await clickStats(now),
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

/** The uid or Steam id a pasted link names, or null when the text isn't such a link. */
function linkTarget(text: string): { uid: string } | { steamId: string } | null {
  if (!/^https?:\/\//i.test(text)) return null;
  const uid = uidFromGameUrl(text);
  if (uid) return { uid };
  try {
    const url = new URL(text);
    const steamId = /^\/app\/(\d+)/.exec(url.pathname)?.[1];
    if (url.hostname === 'store.steampowered.com' && steamId) return { steamId };
  } catch {
    // Not a link after all.
  }
  return null;
}

/**
 * Games to choose from: a pasted Gamesplanet or Steam link finds that game, and any other text
 * finds the games whose name contains it, best sellers first.
 */
async function search(query: string, now = new Date()): Promise<GamesplanetSearchView> {
  const ref = await gamesplanetService.refCode();
  const target = linkTarget(query);
  if (target || /^https?:\/\//i.test(query)) {
    const rows = target
      ? await db
          .select()
          .from(gamesplanetGame)
          .where(
            'uid' in target
              ? eq(gamesplanetGame.uid, target.uid)
              : eq(gamesplanetGame.steamId, target.steamId),
          )
          .limit(SEARCH_LIMIT)
      : [];
    const pinned = new Set((await pinnedRows()).map((row) => row.uid));
    return { games: rows.map((row) => toGame(row, ref, pinned.has(row.uid), now)) };
  }
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
  follow,
  pruneClicks,
  dealByUid,
  eventDeal,
  getCover,
  listAdmin,
  setRefCode,
  search,
  pin,
  unpin,
  movePin,
  syncNow,
};
