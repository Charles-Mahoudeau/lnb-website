# Market

The Market is the server's own shop: a commodity exchange where players sell raw and processed items to mint LNBits, or buy items to burn them. It is a faucet for farmers and a sink for people with money to spend. Prices move with supply, so no single farm can break the economy.

This page is the contract between the site and the economy mod (`lnb-economy`, see `docs/market-mod.md` for what the mod must do), and the rules behind the pages. It extends `docs/economy.md`: accounts, the ledger, idempotency keys and flags work as described there.

> Status: slices 1 to 4 are built: cents in the ledger, then the engine, the ledger kind, the server, admin and public routes, the jobs and the tests, then the admin pages and the public page. The mod document (`docs/market-mod.md`) is final. Still to do: the mod itself (outside this repository) and the tuning of the numbers (catalog, thresholds, spread, mint budget). The Market ships **off** (`economy.market`, `economy.market.sell` and `economy.market.buy` are seeded disabled by the migration). The design came out of the economy update document and a grilling session on 2026-11-20. The starting catalog below is a draft to simulate before launch.

See "What was built differently" at the end for where the code departs from this page.

## Principles

- **The site is the source of truth, always.** The stock of every item, the earnings windows and every trade live in the database. The mod never decides an amount: it previews prices from state the site pushes, and sends orders the site prices again.
- **The Market is for farmers.** Prices stay modest so the auction house is usually the better deal for players. The Market's buy and sell prices are a floor and a ceiling around player trade, and the spread keeps room between them.
- **Only the Market, quests, mob drops and valid prediction pools create money.** The Market creates it only when a player sells (`marketSale`), and destroys it when a player buys (`marketPurchase`).
- **Frozen accounts and banned players can't trade.** As everywhere in the economy.
- **The name.** "Market" in the UI, `/market` in the game, `market` in the ledger. "Shop" already means a player's shop block (`docs/economy.md`).

## Units

From the cents migration, the ledger counts **cents of LNBit** (1 LNBit = 100 cents) as `bigint`. Balances, entries, prices of shops and auction listings, the casino license price and the starting balance all follow. Limits are unchanged in LNBits (10^12) and so 10^14 cents, below JavaScript's safe integer limit.

- Existing routes take `X-Economy-Units: cents` to opt in. Without it, a request is read as whole LNBits (multiplied by 100) and an answer is rounded down to whole LNBits, so the site and the mod can be deployed in any order. The legacy mode goes away once every mod sends the header.
- **Market routes are cents-only**: they never read the header, and every money field is an integer number of cents.
- The site shows LNBits with two decimals and drops a trailing `.00` (`1,234.5`, `12`).
- Market **prices per item** can be below a cent (5 % of a 4-cent cobblestone is 0.2 cents). They are parameters, stored as `numeric(20,6)` and sent as JSON numbers. Only an order's **total** is rounded to a whole cent: down for a sale, up for a purchase.

## Items

An item is a Minecraft registry ID (`minecraft:cobblestone`). The catalog starts with 30 vanilla items in three tiers; an admin can add any registry ID later, mods included. Items are never deleted, only turned off (`enabled`).

| Parameter             | Meaning                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `tier`                | 1 (heavily automated), 2 (semi-automated or processed) or 3 (manual or exploration). Drives the defaults and the player's window. |
| `p0`                  | Base price: LNBits per item when the stock is at `s0`.                                                                            |
| `pMin`, `pMax`        | Floor and ceiling of the reference price.                                                                                         |
| `s0`                  | Equilibrium stock. Also the market's depth: a large `s0` means a trade barely moves the price.                                    |
| `sMin`, `sMax`        | Bounds of the stock. Defaults: `0.1 × s0` and `10 × s0`.                                                                          |
| `k`                   | Elasticity exponent: how steeply the price reacts to stock.                                                                       |
| `alpha`               | Hourly drift: the share of the gap to `s0` that closes each hour.                                                                 |
| `sellable`, `buyable` | Whether players can sell it to the Market, or buy it from it. Both off for items that must not be traded.                         |
| `enabled`             | Off hides the item entirely. Its stock keeps its value.                                                                           |

Each item also keeps its **stock** `s` and the time it was last updated (`stockAt`).

Tier defaults, used when an item doesn't override them:

| Tier | `k` | `pMin`     | `pMax` | `alpha` |
| ---- | --- | ---------- | ------ | ------- |
| 1    | 1.3 | 5 % of p0  | 3 × p0 | 5 %     |
| 2    | 0.9 | 15 % of p0 | 3 × p0 | 10 %    |
| 3    | 0.5 | 40 % of p0 | 2 × p0 | 20 %    |

## Pricing

### The reference price

```
pRef(s) = clamp(p0 × (s0 / s)^k, pMin, pMax)
```

More stock means a lower price. With `k = 1`, doubling the stock halves the price. Two breakpoints split the curve in three pieces:

- `sA = s0 × (p0 / pMax)^(1/k)`: below it the price is flat at `pMax`.
- `sB = s0 × (p0 / pMin)^(1/k)`: above it the price is flat at `pMin`.
- Between them, the power curve.

### Spread

`σ` (15 % by default) is the spread. A sale pays the reference price times `(1 − σ)`, a purchase costs it times `(1 + σ)`. Buying and selling right after loses about 30 %, so no round trip profits.

### Moving along the curve

A trade does not use one unit price. The Market integrates the reference price along the stock it moves through, so selling 4,096 items at once pays exactly what 4,096 sales of one item would, and no price is quoted that the next item would not get. With `I(a, b)` the integral of `pRef` from stock `a` to stock `b`:

- Power piece, `k ≠ 1`: `∫ p0 × s0^k × s^(−k) ds = p0 × s0^k × s^(1−k) / (1 − k)`.
- Power piece, `k = 1`: `p0 × s0 × ln(s)`.
- Flat pieces: `pMax × length` or `pMin × length`.

`I` is the sum over the pieces the interval crosses. It is closed form: no loop over items.

### A purchase

Buying `q` items lowers the stock by `q`, but never below `sMin`. Below `sMin` the price stays at `pRef(sMin)`: scarce goods are always buyable at about `pMax`, there is no "out of stock".

```
d     = min(q, s − sMin)                     // stock actually consumed
cost  = (1 + σ) × ( I(s − d, s) + (q − d) × pRef(sMin) )
total = ceil(cost × 100) cents
```

### A sale

Selling raises the stock, but only by the share the player is paid for (see the next section), never above `sMax`. Past `sMax` a sale still pays at `pRef(sMax)` but the stock stays there, so the recovery time after a dump is bounded.

### Mean reversion

Stock drifts back to `s0` by itself, and the drift is computed **lazily** from the time since `stockAt`, with no hourly job:

```
s ← s0 + (s − s0) × (1 − alpha)^Δh        Δh = hours since stockAt, fractional
```

Every read and every trade applies it first, then writes `s` and `stockAt` again when it changes the stock. A pure function of the stored state, so the mod computes the same value for a preview.

### Diminishing returns

Per player and per tier, the Market tracks the **nominal value** of what they sold over the last 24 hours (a rolling window, exact: the sum of their sale events younger than 24 h). Nominal means before any reduction: `I / rate` of the stock walked. Their window `w` decides the **rate** `r` of the next sale:

| Window `w`        | Rate `r`             |
| ----------------- | -------------------- |
| below `q1`        | 100 %                |
| from `q1` to `q2` | `midPercent` (50 %)  |
| from `q2` on      | `tailPercent` (10 %) |

A sale at rate `r` pays and moves the stock **by the paid share**: selling `n` items walks `r × n` of stock along the curve, and the player is paid `(1 − σ) × I` over that walked span. So a farmer past the thresholds earns less per item, and the price doesn't crash for everyone because of what they dump at 10 %. An order that crosses a threshold is split exactly at the boundary: the boundary is found by inverting `I`, so a sale pays the same in one order as in several.

Purchases do not offset the window. The window is per tier, so spreading sales over the tier's items doesn't escape it.

The algorithm, with vectors a mod can check against, is in `docs/market-mod.md`.

### Mint cap

Like quests, the Market has a rolling budget: over 30 days it mints at most `mintCapPercent` (25 % by default) of the money in circulation. A sale past the budget is paid what's left and the answer says `capped: true`. The state the mod reads carries `mintRemaining`, so its preview already shows the capped payout.

### Orders and slippage

An order names the **total** the player saw (`expectedTotal`, in cents). The site prices it again and accepts it when:

- a sale pays at least `expectedTotal × (1 − tolerance)`, or
- a purchase costs at most `expectedTotal × (1 + tolerance)`,

with `tolerance` set to 1 % by default. Otherwise it answers `priceChanged` (409) with a fresh `quote`, and nothing moves. The tolerance also absorbs the last-bit differences between the site's and the mod's floating point.

### Limits

- An order covers 1 to 2,304 items (36 stacks, a full inventory) of one item.
- A sale whose total rounds to 0 cents is `zeroPayout` (409).
- Only plain items are sold: no damage, enchantments, custom name, NBT or container contents. The mod checks, because the site only knows IDs. Tools and armor are never in the catalog.

## The ledger

- Kind `market`. A sale is one `mint` with the reason `marketSale`, on the player's **personal** account. A purchase is one `burn` with the reason `marketPurchase`, from the account they name or their default one. The memo is the count and the item (`32 × Cobblestone`).
- Each order is a line in `market_order`, with the transaction, the item, the direction, the quantity, the total and the stock before and after.
- Each sale also writes a `market_sale` event (user, tier, nominal value, time) that feeds the window. Events older than two days are pruned.
- Frozen accounts, banned players and linking rules answer as in transfers.

### Purchases and the mailbox

A purchase never hands items over directly. The order creates a **mailbox item** for the whole quantity (`source: market`, the item ID, no SNBT) in the same database transaction as the burn, and the mod claims it at once with the existing claim call. The claim is idempotent, so a crash between paying and handing over never gives the items twice nor loses them. Claiming takes an optional `count`: when the inventory holds only part, the mod claims that part and the rest waits in the mailbox for the player.

Sales use the other order: the mod takes the items aside, calls the site, and gives them back only on a definitive refusal (see `docs/market-mod.md`).

## Recipes and the loop validator

Dynamic prices make crafting loops possible: buy sand cheaply after a dump, smelt it, sell glass at a shortage price. The site refuses any catalog where one exists.

- The mod sends the server's **recipe graph** (crafting, smelting, blasting, smoking, campfire, stonecutting; mods included) when it starts, with `PUT /api/economy/server/market/recipes`. The site stores it (`market_recipe`) and the admin sees each item's recipes in its editor.
- The validator works on worst-case prices that can be reached on different items at the same time: it buys at `pMin × (1 + σ)` and sells at `pMax × (1 − σ)`.
  - The **cost** of an item is the cheapest way to obtain it: buy it (if `buyable`) or craft it from items that themselves have a cost. An input the Market doesn't sell has no cost: it can't be bought, so it is no loop, just play.
  - The **value** of an item is its sale price if `sellable`.
  - A catalog is refused when some `sellable` item can be **crafted** for less than its value (`loop`, with the recipe path in the answer).
- It runs when an admin saves an item or the settings (it can also be run as a dry run, `POST /validate`), when the recipe graph changes, and answers which side to switch off or reprice. The same item bought and sold directly is no loop: the stock is shared, so only time arbitrage remains, and the spread and the window bound it.
- With a graph the mod hasn't sent yet, saving is refused (`noRecipes`) rather than skipped.

## Minecraft server routes

Under `/api/economy/server/market`, behind the `economy.serverApi` and `economy.market` flags, limited as `economy-server`. `player` is always a Minecraft UUID.

| Route                | What it does                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /state`         | Everything the mod needs to compute prices: settings, tiers, `mintRemaining`, `revision` and every enabled item with its parameters and stock. See below.    |
| `GET /players/:uuid` | The player's window per tier: `{ tier, nominal, rate, toNextBracket, q1, q2, nextRate }` (LNBits and fractions, not cents), and `capped`.                    |
| `POST /quote`        | `{ player, item, direction, quantity }`: the site's own quote, with brackets and the total, changing nothing. For checks and for items the mod doesn't know. |
| `POST /orders`       | Sells or buys. See below.                                                                                                                                    |
| `PUT /recipes`       | `{ recipes: [{ type, output: { id, count }, inputs: [{ id, count }] }] }`: replaces the recipe graph, then runs the validator and answers its problems.      |

```json
{
  "revision": 41,
  "asOf": "2026-11-21T10:00:00.000Z",
  "settings": {
    "sigma": 0.15,
    "tolerancePercent": 1,
    "maxOrderItems": 2304,
    "sell": true,
    "buy": true
  },
  "tiers": [{ "tier": 1, "q1": 500000, "q2": 1500000, "midPercent": 50, "tailPercent": 10 }],
  "mintRemaining": 83000000,
  "items": [
    {
      "id": "minecraft:cobblestone",
      "tier": 1,
      "sellable": true,
      "buyable": true,
      "p0": 0.05,
      "pMin": 0.0025,
      "pMax": 0.15,
      "s0": 120000,
      "sMin": 12000,
      "sMax": 1200000,
      "k": 1.3,
      "alpha": 0.05,
      "stock": 130000,
      "stockAt": "2026-11-21T09:58:12.000Z"
    }
  ]
}
```

`q1`, `q2` and `mintRemaining` are cents. `revision` grows with every change of parameters or settings.

### Orders

```json
{
  "idempotencyKey": "<uuid>",
  "player": "<uuid>",
  "account": "casino-royal",
  "item": "minecraft:cobblestone",
  "direction": "sell",
  "quantity": 2304,
  "expectedTotal": 9780
}
```

- `account` is optional and only for a purchase: the account that pays, else the player's default one. A sale always pays the personal account.
- One database transaction: the item row is locked and drifted to now, the player's window is read under a lock, the total is computed, the ledger transaction and the order are written, the stock moves. A retry with the same key gives back the first answer with `replayed: true`; the same key on another request is `idempotencyMismatch` (409).
- The answer: `{ transactionId, replayed, direction, item, quantity, total, capped, brackets, price, stock, account }`, with `brackets: [{ rate, quantity, total }]` for a sale (what each rate paid), `price` the new reference price, `stock` the new stock and `account: { accountId, handle, balance }` the one that moved. A purchase adds `mailboxItemId`.
- Problems: `notLinked`, `notFound` (404, unknown item), `notEligible`, `notAllowed` (403), `itemDisabled`, `notSellable`, `notBuyable`, `zeroPayout`, `priceChanged` (409, with `quote`), `insufficientFunds`, `frozen`, `idempotencyMismatch` (409), `disabled` (503, a flag is off, or `economy.market.sell` or `economy.market.buy` for that direction).

### Live changes

On the `economy` topic of `GET /api/economy/server/events`:

| Event           | Data                                       | Sent when                                                                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `market`        | `{ revision, items: [{ id, stock, at }] }` | An order changed stocks. At most one a second, the latest stock of each item touched since the last one.                   |
| `market-config` | `{ revision }`                             | An admin changed an item, a tier or a setting, or the recipes did: the mod reads `/state` again. A flag change sends none. |

## Player routes

Behind `economy.market`, rate-limited as a read.

- `GET /api/market`, public: every enabled item with its reference price, the price of 1 and of 64 items to sell and to buy, its delta against `p0` and a 24-hour sparkline. Signed in with a linked Minecraft account, also `me`: the window and the current rate of each tier, and how much is left before the next bracket.
- `GET /api/market/items/:id/history?period=24h|7d|30d|1y`, public: the price over time.

There is no trading on the site: only the server moves money.

## Admin routes

Under `/api/economy/admin/market`, for `admin` and `economy-admin`. Never behind a flag. Every change is written to `audit` (`economy.market.*`) and shows in Settings › Activity.

| Route                                    | What it does                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /items`, `POST`, `PATCH /items/:id` | The catalog. Changing parameters creates a version (`market_item_version`). `keepPrice` (true by default) recomputes the stock so the current price doesn't jump; with false the price follows the new curve. |
| `POST /items/:id/reset-stock`            | Puts the stock back to `s0`, with a reason.                                                                                                                                                                   |
| `POST /validate`                         | A dry run: a proposed catalog change against the recipes, answering the loops it would allow.                                                                                                                 |
| `GET /recipes`                           | The stored recipe graph, with the recipes of an item.                                                                                                                                                         |
| `GET /settings`, `PATCH /settings`       | Global and per-tier settings (below).                                                                                                                                                                         |
| `GET /stats?period=7d\|30d\|90d\|all`    | Minted and burned per day and per item, volume, the mint cap used over 30 days, the busiest sellers and the stock of every item.                                                                              |
| `GET /orders`                            | Every order, newest first, with filters.                                                                                                                                                                      |

### Settings

| Setting                              | Default                 | Meaning                                                         |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------- |
| `sigma`                              | 15 %                    | The spread.                                                     |
| `tolerancePercent`                   | 1 %                     | The slippage an order accepts.                                  |
| `maxOrderItems`                      | 2,304                   | Items per order.                                                |
| `mintCapPercent`                     | 25 %                    | The 30-day mint budget, as a share of the money in circulation. |
| `historyDays`                        | 365                     | How long hourly snapshots are kept.                             |
| per tier `q1`, `q2`                  | 5,000 and 15,000 LNBits | The thresholds of the window.                                   |
| per tier `midPercent`, `tailPercent` | 50 % and 10 %           | The rates after each threshold.                                 |

Flags: `economy.market`, `economy.market.sell` and `economy.market.buy` (`docs/feature-flags.md`). The Market ships with `economy.market` off, and its two directions are switched on one at a time, starting with tight caps.

## Pages

- `/admin/economy/market`, in the Minecraft group of the sidebar as its own entry "Market" (right after Economy, same `economy-admin` role). Each tab is its own URL, and an item's drawer is the query `?item=<id>`, so it can be linked; closing it removes the query. A badge says whether `economy.market` is on, with a link to Settings › Feature flags for full admins (it never toggles anything).
  - **Overview** (`/admin/economy/market`): figures (minted and burned over 30 days, mint budget used, orders in the last 24 hours and how many were capped), "Needs a look" (flooded items, stock at 3 times its target or more; scarce ones, at half or less; capped orders; no recipe list ever sent, or unchanged for 14 days), the stock board per tier on a log axis from 0.1x to 10x with ticks at 1x and 3x, the minted and burned chart and the most traded items.
  - **Catalog** (`/admin/economy/market/catalog`): items by tier in a table, with a search, tier chips and a "buy or sell off" chip.
  - **Item drawer**: the price now, the curve drawn in the browser with the same functions as the server (`shared/utils/market.ts`), the parameters, "keep the current price", a simulator (an order of a number of items for a player who already sold some LNBits that day, with the bracket breakdown), the recipes that make or use the item with Loop and No loop badges (a dry run through `POST /validate` while editing), the sell and buy switches, and Reset stock, Cancel and Save. A refusal from the server (a recipe loop, no recipes, invalid values) shows in plain words and nothing is saved.
  - **Orders** (`/admin/economy/market/orders`): 50 at a time, filtered by player, item, side and capped only.
  - **Settings** (`/admin/economy/market/settings`): the spread, tolerance, items per order, mint budget, history kept, and per tier the thresholds and rates.
- `/minecraft/market` (Minecraft menu, behind `economy.market`, no account needed to read; mock D, "mix of A and C"):
  - A header with a badge only when selling or buying is off (`sell` and `buy` of the answer).
  - "Your day at the Market": signed out, a sign-in prompt; signed in without a linked account, a "Link my account" prompt to `/minecraft/account`; linked (`me`), one tile per tier with a meter (the fill is the nominal value of the last 24 hours against `q2`, the tick sits at `q1`), the rate, and what is left at this rate before the next bracket. When `me.capped`, a notice says sales pay reduced until the mint budget recovers.
  - "Paying the most" (the five sellable items furthest above their base price) and "Cheapest to buy" (the five buyable ones furthest below it), computed in the browser and hidden when empty.
  - The price board, by tier, with a search and tier chips: reference price, the gap against the base price (`deltaPercent`, an arrow and a percentage as text), sell and buy for 1 and 64 items, a 24-hour sparkline. Below `md` the sparkline and the 64-item columns are dropped. Prices are decimals formatted like the admin does (`formatItemPrice`), totals use the cents formatter.
  - An item opens in a drawer (`?item=<id>`, so it can be linked) with four period chips (24 h, 7 days, 30 days, 1 year, from `GET /api/market/items/:id/history`), a line chart, the four quotes, and a sentence when the price is 30 % or more under or over the base price (plentiful or scarce). The public answer has no stock, so this is read from the price, not the stock.
  - The page refetches every five minutes while the tab is visible. Quotes are indicative: the footnote says the exact total is set in the game, and gives no spread figure because the public answer doesn't carry it.
  - `me.tiers` also carries `q1`, `q2` (LNBits of nominal value) and `nextRate` (null in the last bracket), added for the meter. They are on the mod's `GET /players/:uuid` too.

## Jobs

- `market:snapshot`, hourly: writes one row per item (`market_snapshot`: price, stock, time) from the drifted stock. It changes nothing.
- `market:prune`, nightly: deletes snapshots older than `historyDays` and sale events older than two days.

## Starting catalog (draft)

Prices are LNBits per item. They assume a dedicated farmer earns about 2,500 LNBits an hour at full rate, so a casino license (100,000) takes about 40 hours, and `s0 × p0` is about 6,000 / 3,000 / 1,500 LNBits for tiers 1 / 2 / 3. These numbers come from reasoning, not a simulation: run one on real play data before launch. `Buy` is off wherever an item would be a loop input or break progression.

| Tier | Item           | `p0` | `s0`    | Sell | Buy |
| ---- | -------------- | ---- | ------- | ---- | --- |
| 1    | Cobblestone    | 0.05 | 120,000 | yes  | yes |
| 1    | Sand           | 0.08 | 75,000  | yes  | no  |
| 1    | Oak Log        | 0.30 | 20,000  | yes  | yes |
| 1    | Wheat          | 0.25 | 24,000  | yes  | no  |
| 1    | Sugar Cane     | 0.20 | 30,000  | yes  | no  |
| 1    | Melon Slice    | 0.06 | 100,000 | yes  | no  |
| 1    | Kelp           | 0.10 | 60,000  | yes  | no  |
| 1    | Gunpowder      | 0.80 | 7,500   | yes  | no  |
| 1    | Bone           | 0.35 | 17,000  | yes  | no  |
| 1    | Rotten Flesh   | 0.15 | 40,000  | yes  | no  |
| 1    | String         | 0.50 | 12,000  | yes  | no  |
| 1    | Iron Ingot     | 4    | 1,500   | yes  | no  |
| 2    | Glass          | 0.50 | 6,000   | yes  | yes |
| 2    | Terracotta     | 1.50 | 2,000   | yes  | yes |
| 2    | Bricks         | 2    | 1,500   | yes  | yes |
| 2    | Cooked Beef    | 1.20 | 2,500   | yes  | no  |
| 2    | Golden Carrot  | 3    | 1,000   | yes  | no  |
| 2    | Coal           | 1.50 | 2,000   | yes  | yes |
| 2    | Copper Ingot   | 1.20 | 2,500   | yes  | yes |
| 2    | Redstone       | 1    | 3,000   | yes  | yes |
| 2    | Glowstone Dust | 1.20 | 2,500   | yes  | yes |
| 2    | Ender Pearl    | 25   | 120     | yes  | no  |
| 3    | Gold Ingot     | 12   | 125     | yes  | no  |
| 3    | Lapis Lazuli   | 1.50 | 1,000   | yes  | no  |
| 3    | Diamond        | 120  | 12      | yes  | no  |
| 3    | Emerald        | 60   | 25      | yes  | no  |
| 3    | Quartz         | 2.50 | 600     | yes  | yes |
| 3    | Slimeball      | 8    | 190     | yes  | no  |
| 3    | Blaze Rod      | 30   | 50      | yes  | no  |
| 3    | Ancient Debris | 400  | 4       | yes  | no  |

The validator may still refuse parts of this table once the real recipe graph is in.

## Data

New tables (see `server/db/schema/`): `market_item` (parameters, `stock`, `stock_at`, the row locked by every order), `market_item_version`, `market_settings` and `market_tier_settings`, `market_order`, `market_sale`, `market_snapshot` and `market_recipe`. Stock and parameters are `numeric(20,6)`; every amount of money is `bigint` cents.

## Not in the Market

No bids, no limit orders, no player-set prices (that is the auction house and player shops), no trading from the site, and no other currency than the LNBit.

## What was built differently

- The mailbox reason of a purchase is `market`, not `source: market` (the column is `reason`).
- A sale the mint budget cuts to 0 cents is refused with 409 `zeroPayout`, not stored.
- Brackets are not capped when the total is: they show the uncapped sale, `total` and `capped` say what was paid.
- `GET /state` sends every stock already drifted to `asOf`, and `stockAt` equals `asOf`.
- The default-off flags are rows seeded by the migration (flags default to on otherwise), so `docs/feature-flags.md`'s "no migration needed" does not hold for them.
- A catalog change that only closes doors (`enabled`, `sellable`, `buyable` set to false) skips the loop validator. Any other change, and a new spread, runs it; with no recipe graph stored it answers 409 `noRecipes`.
- `market:prune` deletes snapshots and sale events only; orders are kept.
- `market`: at most one event a second, with the latest stock of each item touched. `market-config`: `{ revision }`, sent after every committed change of an item, a setting, a tier or the recipes. Flag changes send none: the mod reads `/state`'s `settings.sell` and `settings.buy`.
- The routes are cents only, and exempt from the units layer (`usesEconomyUnits`).
- The admin pages needed three small read-only additions: `GET /stats` also answers `today` (orders and capped orders in the last 24 hours) and `recipes` (count and when the server last changed the list, from the audit log), `GET /recipes` takes `uses` (recipes that use an item; with `item`, those that make or use it), and `GET /orders` takes `capped=true` and gives each order its lowest `rate`.
- Prices per item and the parameters are typed as plain numbers in LNBits (up to six decimals), not with `EconomyAmountInput`, which stops at cents: a cobblestone costs a fraction of a cent. Thresholds and the mint budget use cents helpers as elsewhere.
- Changing the target stock in the drawer scales `sMin` and `sMax` with it, so their share of the target stays the same.
- "Reset stock" asks for the reason the route needs, in a modal. Creating an item from the admin (`POST /items`) has no page yet.
- The catalog's sell and buy columns show whether each is on (read only); the switches are in the drawer, where the loop check can answer.
- "Orders today" is the last 24 hours, not the Paris day.
