# Market: what the mod must do

This is the to-do list for `lnb-economy` (Kotlin for Forge) for two linked changes: **LNBit cents** across the whole mod, and the new **Market** (`/market`). The site side is in `docs/market.md`, and the economy contract it builds on is `docs/economy.md`. Read those first; this page doesn't repeat the routes.

The rule behind everything: **the site decides every amount.** The mod shows, previews, validates inventories and moves items. It never sends a price for the site to accept.

Work in this order. Cents first, because the Market uses it and every existing screen is touched by it.

## 1. Cents

The site's ledger now counts cents (1 LNBit = 100 cents) as integers. The mod must speak cents everywhere it talks to the site, and show LNBits with two decimals.

### 1.1 Talk in cents

- Add the header `X-Economy-Units: cents` to **every** call to `/api/economy/server` and `/api/quests/server`. Without it the site reads whole LNBits and rounds answers down to whole LNBits, which loses cents silently. The header is how you opt in; the legacy mode disappears once every mod sends it, so don't depend on it.
- Every field that holds money is then an integer number of cents, in requests and in answers: `amount`, `balance`, `price`, `sellPrice`, `buyPrice`, `lotPrice`, `expectedLotPrice`, `tax`, `casinoLicensePrice`, `startingBalance`, listing and shop prices, the rewards of quests. The list is in `docs/economy.md` once the migration lands; when in doubt, if it was a count of LNBits before, it is cents now.
- The `/market` routes always speak cents and never read the header.
- Use `Long` for amounts. Never `Double`, never `Float`. 10^12 LNBits is 10^14 cents, which fits a `Long` and a JSON number exactly.
- Parameters of the Market (prices per item, stock, `k`) are the exception: they are fractional by nature, sent as JSON numbers, and read as `Double`.

### 1.2 Show LNBits

- One formatting function for the whole mod: `cents / 100` with two decimals, thousands separated, and the trailing `.00` dropped. `123456` cents is `1,234.56`, `120000` is `1,200`, `5` is `0.05`. Don't use `Double` for it: split with integer division and remainder.
- Replace every place that formats an LNBit amount: the balance in the inventory, `/pay` messages, bank and account screens, shops, auction listings and notices, casino machines, quest rewards, mob-drop notices, the license price.

### 1.3 Read what players type

- `/pay #casino 12.5`, shop prices, listing prices and casino bets accept up to **two decimals** (`.` or `,`). More decimals are an error ("at most 2 decimals"), never a silent rounding. Parse to cents with integer arithmetic, not `toDouble() * 100`.
- Amounts stay positive and at most 10^12 LNBits.

### 1.4 Rules that now involve cents

- Shop lots and auction prices: a price is a whole number of cents, at least 1 cent. The auction tax is `auctionTaxPercent` of the price **rounded down to the cent**, which the site computes; the mod doesn't.
- Mob drops (`POST /mints`): the mod keeps counting in whatever it counts, but sends **cents**. Keep the same economy as before: if a drop was 3 LNBits, send 300.
- Casino machines: bets and payouts are cents. A machine that paid whole LNBits keeps doing so (the amounts are just multiples of 100), but nothing now forces it to.
- Quest rewards arrive already priced by the site, in cents.

### 1.5 Test it

- Round trip: type `0.1`, `0.10`, `0,1`, `12`, `12.34`, `12.345` (refused), `-1` (refused), `0` (refused).
- Format: `0` → `0`, `1` → `0.01`, `100` → `1`, `100000012` → `1,000,000.12`.
- A balance of 1,234.56 survives a `/pay` of 0.01 and shows 1,234.55.

## 2. The Market

### 2.1 What players see

- **`/market`** opens a screen with category tabs (the three tiers or item groups), for each item: its icon and name, the price to sell and to buy for 1 and for 64 items, a percentage badge against the base price `p0` (green below it for buyers, red above, or the reverse: pick one convention and keep it), a sparkline if the site sends one, and the player's own **efficiency** per tier (the current rate, 100 %, 50 % or 10 %, and how much is left before it drops).
- **Hover**: the exact payout (or cost) of selling (or buying) the stack under the cursor, computed locally (see 2.3), with the average price per item and the rate that applies.
- An item that isn't `sellable` shows no sell price. An item that isn't `buyable` shows no buy price. A `enabled: false` item isn't shown at all.
- Selling: click an item, then a quantity (1, 16, 64, a full inventory, or a number). Only matching items in the player's inventory count. Buying: the same, with the account that pays (the player's default one unless they pick another).
- Show the player when a payout is `capped` (the server's mint budget is nearly used): "The market is paying less today."

### 2.2 Sync with the site

- On start and on every reconnection, call `GET /state` and keep it: settings, tiers, `mintRemaining`, `revision` and the items with their parameters and stock.
- Keep the economy event stream (`GET /events`, topic `economy`) open as for accounts:
  - `market` `{ revision, items: [{ id, stock, at }] }`: update those items' `stock` and `stockAt` in your copy.
  - `market-config` `{ revision }`: read `/state` again.
  - If `revision` in a `market` event is larger than yours, you missed a config change: read `/state`.
- Between events nothing is stale beyond a second or so, because the drift is a pure function of time (see 2.3): recompute it at the moment you render.
- `GET /players/:uuid` gives the player's window for the efficiency display: call it when the screen opens, and again after each of their orders (the order's answer carries the new stock but not the window).
- Never block the server thread on HTTP. Calls go through your usual async client; the screen shows a spinner until the answer comes.
- At start, send the **recipe graph** with `PUT /recipes`: every recipe of the recipe manager (crafting shaped and shapeless, smelting, blasting, smoking, campfire cooking, stonecutting), mods included, as `{ type, output: { id, count }, inputs: [{ id, count }] }`. For an ingredient that accepts several items (a tag), send one recipe per item the tag matches. Send it again when the set of recipes changes (a data-pack reload). The site answers the problems its validator finds: log them for the admins.

### 2.3 Computing prices

The site is authoritative: the mod's numbers are a **preview**. The site's total can differ by a few cents because of floating point, and the order's tolerance (1 %) absorbs that. Use `Double` and follow the formulas exactly so the difference stays at the last bits.

Definitions for one item, with `σ` the spread and `r` the rate of the player's bracket:

```
clamp(x, lo, hi) = min(hi, max(lo, x))
pRef(s)          = clamp(p0 * (s0 / s)^k, pMin, pMax)
sA               = s0 * (p0 / pMax)^(1 / k)     // below sA the price is flat at pMax
sB               = s0 * (p0 / pMin)^(1 / k)     // above sB the price is flat at pMin
```

Drift to the current time, before anything else (use the stock's own `stockAt`, and `now` as the site's clock when you have it; the difference is seconds):

```
sNow = s0 + (stock - s0) * (1 - alpha)^(hoursSince(stockAt))
```

`I(a, b)`, the integral of `pRef` from stock `a` to `b` (`a <= b`), is the sum over the three pieces:

```
F(s) = k == 1 ? p0 * s0 * ln(s)
               : p0 * s0^k * s^(1 - k) / (1 - k)

I(a, b) = pMax * len([a, b] ∩ (0, sA])
        + (F(min(b, sB)) - F(max(a, sA)))            if the middle piece is crossed
        + pMin * len([a, b] ∩ [sB, ∞))
```

**Preview of a purchase** of `q` items from stock `s = sNow`:

```
d    = min(q, s - sMin)
cost = (1 + σ) * ( I(s - d, s) + (q - d) * pRef(sMin) )
total = ceil(cost * 100)            // cents
```

**Preview of a sale** of `q` items, from stock `s = sNow`, with the player's window `w` in the item's tier (nominal value, in LNBits, from `GET /players/:uuid`, converted from cents), thresholds `q1 < q2` (LNBits), rates `mid`, `tail` (as fractions):

```
pay = 0
while q > 0:
    if   w <  q1: r = 1,    cap = q1 - w
    elif w <  q2: r = mid,  cap = q2 - w
    else:         r = tail, cap = ∞

    if s >= sMax:                                   // the stock stays; the price is pRef(sMax)
        p = pRef(sMax)
        n = min(q, cap / p)
        pay += (1 - σ) * r * n * p ;  w += n * p ;  q -= n
        continue

    d = min(r * q, sMax - s)                        // stock this segment would walk
    if I(s, s + d) / r > cap:                       // the bracket ends inside the segment
        d = inverse(I, s, cap * r) - s              // find b with I(s, b) = cap * r
    v  = I(s, s + d)                                // what the walked stock is worth
    pay += (1 - σ) * v
    w   += v / r                                    // nominal value counted in the window
    q   -= d / r
    s   += d
total = floor(pay * 100)             // cents
```

Quantities can be fractional inside the loop: the item at a bracket boundary is split. `inverse` can be a bisection to a relative precision of 1e-9, or the closed form on the power piece: for `k ≠ 1`, `b = (a^(1-k) + C * (1 - k) / (p0 * s0^k))^(1 / (1 - k))`, and on a flat piece `b = a + C / price`; use the right piece for `a`.

The `mintRemaining` from `/state` caps the payout: `total = min(total, mintRemaining)`, and then show it as capped.

Do not recompute prices on the server thread for every frame; compute when the screen opens, on an event that touches the item, and on hover for the stack under the cursor.

### 2.4 Test vectors

One item, to check the arithmetic on both sides:

```
p0 = 0.05   pMin = 0.0025   pMax = 0.15   s0 = 120000   sMin = 12000   sMax = 1200000
k = 1.3     alpha = 0.05    σ = 0.15
tier: q1 = 5000, q2 = 15000, mid = 0.5, tail = 0.1       // LNBits
```

Derived: `sA = 51542.430769`, `sB = 1202191.216004`.

| Case                                         | Result                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `pRef(120000)`                               | 0.050000                                                                        |
| `pRef(60000)`                                | 0.123114                                                                        |
| `pRef(200000)`                               | 0.025738                                                                        |
| `pRef(12000)` (flat at pMax)                 | 0.150000                                                                        |
| `pRef(1200000)`                              | 0.002506                                                                        |
| sell 1, `s = 120000`, `w = 0`                | 0.04 → 4 cents                                                                  |
| buy 1, `s = 120000`                          | 0.06 → 6 cents                                                                  |
| sell 10,000, `s = 120000`, `w = 0`           | 403.355577 → **40,335** cents; new stock 130,000; window 474.535973             |
| sell 100,000, `s = 120000`, `w = 0`          | 2,826.520139 → **282,652** cents; new stock 220,000; window 3,325.317811        |
| sell 100,000, `s = 120000`, `w = 4000`       | 1,976.726592 → **197,672** cents; new stock 181,187.853730; window 7,651.121393 |
| sell 2,304, `s = 120000`, `w = 16000` (tail) | 9.779798 → **977** cents; new stock 120,230.4                                   |
| sell 10,000, `s = 1150000` (reaches `sMax`)  | 22.385769 → **2,238** cents; new stock 1,160,000                                |
| buy 10,000, `s = 120000`                     | 608.283094 → **60,829** cents; new stock 110,000                                |
| buy 10,000, `s = 20000` (hits `sMin`)        | 1,725.000000 → **172,500** cents; new stock 12,000                              |
| drift 24 h from stock 180,000                | 137,519.341460                                                                  |
| drift 36.5 h from stock 12,000               | 103,391.311169                                                                  |

The window's nominal values are in LNBits, not cents. A test must pass with an error under 1e-6 on the numbers above and under 2 cents on totals. Two orders of 50,000 must pay the same as one of 100,000 (within a cent each) when nothing else changes.

### 2.5 Selling

1. Check on the server thread, with no HTTP: the player is at the screen, the item is `sellable` and `enabled`, the quantity is 1 to `maxOrderItems` (2,304), and every item is **plain**: no damage, no enchantments, no custom name, no NBT other than the default, and not taken from inside a shulker box, bundle or other container. A tool or armor is never in the catalog, but check anyway.
2. **Take the items aside** (escrow): remove them from the inventory and keep them in memory and on disk, with the order's `idempotencyKey` (a fresh UUID).
3. `POST /orders` with `direction: "sell"`, the quantity and `expectedTotal` (your preview, in cents).
4. On success, the site has minted the payout on the personal account: tell the player the total and, for a `capped` answer, why. Drop the escrow. Update the stock from the answer.
5. On a **definitive refusal**, give the items back and tell the player why. Definitive means an HTTP answer in the 4xx range that is not `priceChanged`, or a 409 `priceChanged`: show the new `quote` and let them confirm again, with a new key.
6. On a **timeout, a connection error or a 5xx**, the outcome is unknown. **Do not give the items back and do not drop them.** Keep the escrow and retry the same request with the same key, a few times with a delay. A `replayed: true` answer is a success. Only after a definitive answer do you settle.
7. The escrow is stored on disk (the player's UUID, the key, the items, the time). On server start, replay every pending order with its key and settle it. A player who logs in with a pending order is told it is being settled.

### 2.6 Buying

1. Check: the item is `buyable` and `enabled`, the quantity is 1 to 2,304, and the account is one the player can spend from.
2. `POST /orders` with `direction: "buy"`, `account` if they picked one, and `expectedTotal` (your preview, in cents).
3. On success the money is burned and the answer carries a `mailboxItemId`. Claim it at once with the existing mailbox claim (`POST /mailbox/:id/claim`, with a key of its own), asking for the `count` that fits in the inventory. The rest stays in the mailbox for the player, and you tell them so.
4. Persist the order's key and its `mailboxItemId` until the claim answers. After a crash, read the mailbox: the items are there until claimed, so nothing is lost and nothing is given twice (the claim is idempotent by key).
5. On a refusal, nothing moved: tell the player why. `priceChanged` carries a new `quote`: show it.
6. On a timeout, retry with the same key as for a sale.

### 2.7 Answers and messages

Show a clear message for each problem code, in the game's language (English and French): `insufficientFunds`, `frozen`, `notEligible`, `itemDisabled`, `notSellable`, `notBuyable`, `zeroPayout` ("sell a few more"), `priceChanged` (with the new total), `disabled` (the market is closed for now), `notLinked`.

### 2.8 Edge cases

- **Two players trade the same item at once.** The site serializes them; one may get `priceChanged`. That is normal.
- **The preview and the answer differ by a cent or two.** The answer is authoritative and the player sees it. Never "fix" it.
- **The player drops an item between the preview and the click.** Check the inventory again at step 2 of a sale, and abort without calling the site.
- **A flag is off.** `/state` still answers, but orders answer `disabled`. Hide the buy or the sell side if `settings.buy` or `settings.sell` is false.
- **Items the site doesn't know.** An item that isn't in `/state` isn't traded: show nothing and don't call the site.
- **Reload and reconnection.** After the event stream reconnects, read `/state` again; don't trust a copy older than the last `revision` you saw.

### 2.9 Config

Nothing to configure by hand: the API address and the secret are already the ones of the economy mod. The Market's own settings (spread, thresholds, limits) come from `/state`, so an admin changes them without a restart.

## 3. Done when

- Every money field goes through `X-Economy-Units: cents`, and no `Double` carries an amount.
- Amounts display and parse as in 1.2 and 1.3, in every screen.
- The vectors in 2.4 pass in a unit test of the pricing code.
- A sale, a purchase, a refusal, a `priceChanged`, a timeout with replay and a restart in the middle of a sale each behave as in 2.5 and 2.6, checked on a real server against a site with the `economy.market` flag on.
- The recipe graph is sent at start, and a validator problem shows up in the log.
