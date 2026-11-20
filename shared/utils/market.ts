// The Market's pricing, as pure functions (docs/market.md, docs/market-mod.md 2.3). Prices and
// windows are in LNBits, stocks in items; only the totals are whole cents. No Nuxt or database
// import, so the unit tests and the mod's reference vectors run on it directly.

/** Parameters of one item's curve. */
export interface MarketCurve {
  p0: number;
  pMin: number;
  pMax: number;
  s0: number;
  sMin: number;
  sMax: number;
  k: number;
  alpha: number;
}

/** A player's bracket thresholds in a tier, in LNBits, and the rates after each, as fractions. */
export interface MarketBrackets {
  q1: number;
  q2: number;
  mid: number;
  tail: number;
}

export interface MarketBracketPart {
  /** The rate of the bracket, as a fraction. */
  rate: number;
  /** Items sold at this rate. The item at a boundary is split, so it can be fractional. */
  quantity: number;
  /** Cents this part paid. The parts add up to the sale's total. */
  total: number;
}

export interface MarketSaleQuote {
  /** Whole cents, floored. Before the mint cap. */
  total: number;
  brackets: MarketBracketPart[];
  /** The stock after the sale. */
  stock: number;
  /** The player's window after the sale, in LNBits of nominal value. */
  window: number;
  /** The nominal value this sale adds to the window, in LNBits. */
  nominal: number;
}

export interface MarketPurchaseQuote {
  /** Whole cents, rounded up. */
  total: number;
  /** The stock after the purchase. */
  stock: number;
}

// A total is rounded to a whole cent after a float computation: ignore noise far below a cent, or
// a price that is exactly 1,725 LNBits would be charged one cent more.
const CENT_EPSILON = 1e-6;
const HOUR_MS = 3_600_000;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The reference price at stock `s`. */
export function marketPRef(c: MarketCurve, s: number): number {
  return clamp(c.p0 * (c.s0 / s) ** c.k, c.pMin, c.pMax);
}

/** Below it the price is flat at pMax. */
export const marketSA = (c: MarketCurve) => c.s0 * (c.p0 / c.pMax) ** (1 / c.k);
/** Above it the price is flat at pMin. */
export const marketSB = (c: MarketCurve) => c.s0 * (c.p0 / c.pMin) ** (1 / c.k);

const isLog = (k: number) => Math.abs(1 - k) < 1e-9;

/** The antiderivative of the power piece. */
function antiderivative(c: MarketCurve, s: number): number {
  return isLog(c.k) ? c.p0 * c.s0 * Math.log(s) : (c.p0 * c.s0 ** c.k * s ** (1 - c.k)) / (1 - c.k);
}

/** The integral of the reference price over the stock from `a` to `b` (`a <= b`). Closed form. */
export function marketIntegral(c: MarketCurve, a: number, b: number): number {
  if (b <= a) return 0;
  const sA = marketSA(c);
  const sB = marketSB(c);
  let total = c.pMax * Math.max(0, Math.min(b, sA) - Math.max(a, 0));
  const lo = Math.max(a, sA);
  const hi = Math.min(b, sB);
  if (hi > lo) total += antiderivative(c, hi) - antiderivative(c, lo);
  total += c.pMin * Math.max(0, b - Math.max(a, sB));
  return total;
}

/** The `b >= a` with `marketIntegral(c, a, b) = value`: linear on flat pieces, closed form on the curve. */
export function marketInverse(c: MarketCurve, a: number, value: number): number {
  const sA = marketSA(c);
  const sB = marketSB(c);
  let from = a;
  let left = value;
  if (from < sA) {
    const room = c.pMax * (sA - from);
    if (left <= room) return from + left / c.pMax;
    left -= room;
    from = sA;
  }
  if (from < sB) {
    const room = antiderivative(c, sB) - antiderivative(c, from);
    if (left <= room) {
      if (isLog(c.k)) return from * Math.exp(left / (c.p0 * c.s0));
      const exponent = 1 - c.k;
      return (from ** exponent + (left * exponent) / (c.p0 * c.s0 ** c.k)) ** (1 / exponent);
    }
    left -= room;
    from = sB;
  }
  return from + left / c.pMin;
}

/** The stock now, after the drift toward s0 since `stockAt`. */
export function marketDrift(c: MarketCurve, stock: number, stockAt: Date, now: Date): number {
  const hours = Math.max(0, now.getTime() - stockAt.getTime()) / HOUR_MS;
  return c.s0 + (stock - c.s0) * (1 - c.alpha) ** hours;
}

/** The stock a given reference price corresponds to, on the curve (for `keepPrice`). */
export function marketStockForPrice(c: MarketCurve, price: number): number {
  const p = clamp(price, c.pMin, c.pMax);
  return c.s0 * (c.p0 / p) ** (1 / c.k);
}

/** What buying `q` items from stock `s` costs: stock never goes below sMin, the price stays there. */
export function marketQuotePurchase(
  c: MarketCurve,
  sigma: number,
  stock: number,
  quantity: number,
): MarketPurchaseQuote {
  const d = Math.min(quantity, Math.max(0, stock - c.sMin));
  const cost =
    (1 + sigma) * (marketIntegral(c, stock - d, stock) + (quantity - d) * marketPRef(c, c.sMin));
  return { total: Math.ceil(cost * 100 - CENT_EPSILON), stock: stock - d };
}

/**
 * What selling `q` items from stock `s` pays a player whose window is `w`: the sale is cut at the
 * bracket boundaries, each part walks `rate × items` of stock and pays `(1 - sigma)` of the
 * integral over it. Past sMax a sale still pays at pRef(sMax), but the stock stays.
 */
export function marketQuoteSale(
  c: MarketCurve,
  sigma: number,
  tier: MarketBrackets,
  stock: number,
  window: number,
  quantity: number,
): MarketSaleQuote {
  let s = stock;
  let w = window;
  let q = quantity;
  let pay = 0;
  const parts: { rate: number; quantity: number; pay: number }[] = [];
  const add = (rate: number, items: number, paid: number) => {
    const last = parts.at(-1);
    if (last?.rate === rate) {
      last.quantity += items;
      last.pay += paid;
    } else parts.push({ rate, quantity: items, pay: paid });
  };

  // Each pass ends a bracket or the order; there are three brackets, so a few passes at most.
  for (let guard = 0; q > 1e-9 && guard < 32; guard++) {
    let rate = tier.tail;
    let cap = Infinity;
    let boundary = Infinity;
    if (w < tier.q1) [rate, cap, boundary] = [1, tier.q1 - w, tier.q1];
    else if (w < tier.q2) [rate, cap, boundary] = [tier.mid, tier.q2 - w, tier.q2];

    if (s >= c.sMax) {
      const p = marketPRef(c, c.sMax);
      const n = Math.min(q, cap / p);
      const paid = (1 - sigma) * rate * n * p;
      pay += paid;
      add(rate, n, paid);
      w = n === q ? w + n * p : boundary;
      q = n === q ? 0 : q - n;
      continue;
    }

    let d = rate * q;
    const room = c.sMax - s;
    let reachesMax = false;
    if (d >= room) {
      d = room;
      reachesMax = true;
    }
    let ends = false;
    if (marketIntegral(c, s, s + d) / rate > cap) {
      d = marketInverse(c, s, cap * rate) - s;
      ends = true;
      reachesMax = false;
    }
    const v = marketIntegral(c, s, s + d);
    const paid = (1 - sigma) * v;
    pay += paid;
    add(rate, d / rate, paid);
    // At a boundary the window is exactly the threshold, so rounding never leaves a sliver.
    w = ends ? boundary : w + v / rate;
    q = ends || reachesMax ? q - d / rate : 0;
    s = reachesMax ? c.sMax : s + d;
  }

  // Part totals are cumulative floors, so they add up to the sale's total.
  const total = Math.floor(pay * 100 + CENT_EPSILON);
  let cumulative = 0;
  let given = 0;
  const brackets = parts.map((part) => {
    cumulative += part.pay;
    const upTo = Math.min(total, Math.floor(cumulative * 100 + CENT_EPSILON));
    const cents = upTo - given;
    given = upTo;
    return { rate: part.rate, quantity: part.quantity, total: cents };
  });
  if (brackets.length && given < total) brackets[brackets.length - 1]!.total += total - given;
  return { total, brackets, stock: s, window: w, nominal: w - window };
}

/** A tier's rate and what is left before the next bracket, for a window. `null`: no next bracket. */
export function marketRate(tier: MarketBrackets, window: number) {
  if (window < tier.q1) return { rate: 1, toNextBracket: tier.q1 - window };
  if (window < tier.q2) return { rate: tier.mid, toNextBracket: tier.q2 - window };
  return { rate: tier.tail, toNextBracket: null };
}

/** `minecraft:oak_log` as `Oak Log`, for ledger memos and mailbox items. */
export function marketItemName(id: string): string {
  const name = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return name
    .split(/[_/]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
