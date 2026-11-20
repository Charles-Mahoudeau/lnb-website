// Units of money on the Minecraft server routes (`/api/economy/server/**`, `/api/quests/server/**`).
//
// The site counts cents of LNBit. A caller that sends `X-Economy-Units: cents` gets and sends
// integer cents. Without the header (legacy, for a mod that has not moved yet) a request is read
// as whole LNBits, so it is multiplied by 100 before it is validated, and an answer is rounded
// down to whole LNBits. This file is the only place that knows which fields hold money, and has
// no Nuxt import so it can be tested on its own. See docs/economy.md, Units.

import { CENTS_PER_LNBIT } from '../../shared/utils/lnbits.ts';

export type EconomyUnits = 'cents' | 'lnbits';

export const ECONOMY_UNITS_HEADER = 'x-economy-units';

/** The routes the header applies to. */
export function usesEconomyUnits(path: string): boolean {
  return path.startsWith('/api/economy/server/') || path.startsWith('/api/quests/server/');
}

/** The units a request asks for: `cents`, or `lnbits` (legacy) without the header. Null: not valid. */
export function unitsOfHeader(value: string | null | undefined): EconomyUnits | null {
  if (value === undefined || value === null || value === '') return 'lnbits';
  const unit = value.trim().toLowerCase();
  return unit === 'cents' || unit === 'lnbits' ? unit : null;
}

/**
 * Every field that holds money on these routes, in requests and in responses. A field named here
 * is converted wherever it appears in a body, however deep. Add the name here when a route gets a
 * new money field: nothing else needs to change.
 *
 * Not money, so not listed: `reward` (a base reward, in whole LNBits, in a quest or community
 * definition), `tiers[].amount` of a quest definition and a contribution's `amount` (counts of
 * the quest's objective). See SKIPPED below.
 */
export const MONEY_FIELDS: ReadonlySet<string> = new Set([
  // Ledger: what moves and what is left.
  'amount',
  'balance',
  'balanceAfter',
  'tax',
  // Prices: shops, the auction house, casino licenses, settings.
  'price',
  'sellPrice',
  'buyPrice',
  'lotPrice',
  'expectedLotPrice',
  'casinoLicensePrice',
  'startingBalance',
  // Quests: what a community tier pays today, and what a community quest paid a player.
  'rewardToday',
  'payout',
]);

/**
 * Subtrees and fields that look like money but are not, by route. A request or response key listed
 * for a route is left alone, with everything under it.
 */
const SKIPPED: readonly { route: RegExp; keys: readonly string[] }[] = [
  // A contribution's `amount` counts the community quest's objective (blocks mined, mobs killed).
  { route: /^\/api\/quests\/server\/community\/[^/]+\/contributions$/, keys: ['amount'] },
  // Quest definitions: base rewards in whole LNBits and objective counts, left as they are.
  { route: /^\/api\/quests\/server\/(config|catalog)$/, keys: ['quests', 'categories'] },
];

function skippedKeys(path: string): ReadonlySet<string> {
  const keys = SKIPPED.filter((entry) => entry.route.test(path)).flatMap((entry) => entry.keys);
  return new Set(keys);
}

type Convert = (value: number) => number;

function walk(value: unknown, convert: Convert, skip: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, convert, skip));
  if (value === null || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (skip.has(key)) out[key] = field;
    else if (typeof field === 'number' && MONEY_FIELDS.has(key)) out[key] = convert(field);
    else out[key] = walk(field, convert, skip);
  }
  return out;
}

/**
 * A legacy request body, whole LNBits, as cents. A value that is not a whole number is left as it
 * is, so the schema refuses it: a legacy mod never sent decimals.
 */
export function legacyRequestToCents(path: string, body: unknown): unknown {
  return walk(
    body,
    (value) => (Number.isSafeInteger(value) ? value * CENTS_PER_LNBIT : value),
    skippedKeys(path),
  );
}

/** A response in cents, as whole LNBits rounded down, for a legacy caller. */
export function centsResponseToLegacy(path: string, body: unknown): unknown {
  return walk(body, (value) => Math.floor(value / CENTS_PER_LNBIT), skippedKeys(path));
}
