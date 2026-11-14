// Reading Gamesplanet's product feeds (charts.xml, flash.xml, feed.xml). The XML is flat, one
// <product> per game, so a small reader is enough and keeps the 12 MB catalog out of memory as a
// tree. See docs/gamesplanet.md.

export interface GamesplanetProduct {
  /** Gamesplanet's own id, such as "8822-1". The last part of a game's link. */
  uid: string;
  name: string;
  publisher: string | null;
  category: string | null;
  /** In euro cents. */
  priceCents: number;
  /** The regular price, in euro cents. */
  basePriceCents: number;
  steamId: string | null;
  /** PEGI age, or null when the feed has none. */
  pegi: number | null;
  /** The game page, without the query string: the affiliate ref is added when a link is shown. */
  url: string;
  packshotUrl: string | null;
  teaserUrl: string | null;
  /** False when France is in the country blacklist, or the whitelist doesn't list it. */
  availableInFrance: boolean;
  /** When a flash price ends, for games in flash.xml. */
  flashEndsAt: Date | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** The text of the first <tag>…</tag> in a product, or null when it is missing or empty. */
function field(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  const value = match?.[1] ? decodeEntities(match[1]).trim() : '';
  return value || null;
}

/** "5.99" to 599. Returns null for anything that isn't a price. */
export function priceToCents(value: string | null): number | null {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return null;
  return Math.round(Number.parseFloat(value) * 100);
}

/** "2026-11-18 01:00:00 +0100" to a Date, or null. */
function parseEnd(value: string | null): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [, day, time, hours, minutes] = match;
  const date = new Date(`${day!}T${time!}${hours!}:${minutes!}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countries(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

/** A game can be sold to France unless France is blacklisted, or a whitelist leaves it out. */
export function isAvailableInFrance(whitelist: string | null, blacklist: string | null): boolean {
  const white = countries(whitelist);
  if (white.length && !white.includes('FR')) return false;
  return !countries(blacklist).includes('FR');
}

/** The game page with the query string removed, or null when it isn't an https link. */
export function gamePageUrl(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

/** Adds the affiliate ref to a stored game page. */
export function withRef(url: string, ref: string): string {
  const result = new URL(url);
  result.searchParams.set('ref', ref);
  return result.toString();
}

/** The uid at the end of a game page: ".../game/beast-of-reincarnation-steam-key--8200-1". */
export function uidFromGameUrl(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.hostname !== 'gamesplanet.com' && !url.hostname.endsWith('.gamesplanet.com'))
      return null;
    return /--(\d+-\d+)$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

const IMAGE_HOSTS = ['gamesplanet.com', 'gpstatic.com'];

/** Covers are fetched only over https from Gamesplanet's own hosts. */
export function isGamesplanetImageUrl(link: string): boolean {
  try {
    const url = new URL(link);
    return (
      url.protocol === 'https:' &&
      IMAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

/**
 * Where to download a cover from. The feeds name images on fr.gamesplanet.com, which refuses
 * automated requests (403), while the same path on gpstatic.com, their static host, answers.
 */
export function coverSourceUrl(link: string): string {
  try {
    const url = new URL(link);
    if (url.hostname.endsWith('gamesplanet.com') && url.pathname.startsWith('/acache/'))
      return `https://gpstatic.com${url.pathname}`;
  } catch {
    // Not a URL: isGamesplanetImageUrl refuses it.
  }
  return link;
}

function toProduct(block: string): GamesplanetProduct | null {
  const uid = field(block, 'uid');
  const name = field(block, 'name');
  const url = gamePageUrl(field(block, 'link'));
  const price = priceToCents(field(block, 'price'));
  if (!uid || !name || !url || price === null || !/^\d+-\d+$/.test(uid)) return null;
  const base = priceToCents(field(block, 'price_base')) ?? price;
  const pegi = Number.parseInt(field(block, 'pegi') ?? '', 10);
  return {
    uid,
    name,
    publisher: field(block, 'publisher'),
    category: field(block, 'category'),
    priceCents: price,
    basePriceCents: Math.max(base, price),
    steamId: field(block, 'steam_id'),
    pegi: Number.isNaN(pegi) ? null : pegi,
    url,
    packshotUrl: field(block, 'packshot'),
    teaserUrl: field(block, 'teaser620'),
    availableInFrance: isAvailableInFrance(
      field(block, 'country_whitelist'),
      field(block, 'country_blacklist'),
    ),
    flashEndsAt: parseEnd(field(block, 'price_end_at')),
  };
}

/** Every valid game in a feed, in the feed's order. A broken product is skipped, not fatal. */
export function parseProducts(xml: string): GamesplanetProduct[] {
  const products: GamesplanetProduct[] = [];
  let from = 0;
  for (;;) {
    const start = xml.indexOf('<product>', from);
    if (start === -1) break;
    const end = xml.indexOf('</product>', start);
    if (end === -1) break;
    const product = toProduct(xml.slice(start, end));
    if (product) products.push(product);
    from = end + '</product>'.length;
  }
  return products;
}

/** The discount in percent when the price is under the regular one, else null. */
export function discountPercent(priceCents: number, basePriceCents: number): number | null {
  if (basePriceCents <= priceCents) return null;
  return Math.round((1 - priceCents / basePriceCents) * 100);
}
