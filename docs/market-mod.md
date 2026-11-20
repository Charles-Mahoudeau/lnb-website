# Market: what the mod must do

This is the specification for `lnb-economy` (Kotlin for Forge), for two linked changes: **LNBit cents** across the whole mod, and the new **Market** (`/market`). It is written to be followed without asking the site team. The routes were checked against the site's code and tests; the numbers in the test vectors were produced by running `shared/utils/market.ts`, the site's own pricing code. The site side is described in `docs/market.md`, and the economy contract it builds on is `docs/economy.md`. When this page and the live reference at `/api/docs` disagree, `/api/docs` wins: tell the site owner.

The rule behind everything: **the site decides every amount.** The mod shows, previews, validates inventories and moves items. It never sends a price for the site to accept, only the total the player saw (`expectedTotal`), which the site checks.

## Contents

1. [Order of work](#1-order-of-work)
2. [Cents](#2-cents)
3. [Talking to the Market](#3-talking-to-the-market)
4. [Routes, with examples](#4-routes-with-examples)
5. [Errors and what to do](#5-errors-and-what-to-do)
6. [Live changes (SSE)](#6-live-changes-sse)
7. [Computing prices](#7-computing-prices)
8. [Test vectors](#8-test-vectors)
9. [Selling](#9-selling)
10. [Buying and the mailbox](#10-buying-and-the-mailbox)
11. [Flags, frozen players and edge cases](#11-flags-frozen-players-and-edge-cases)
12. [What players see](#12-what-players-see)
13. [Rollout](#13-rollout)
14. [Manual QA checklist](#14-manual-qa-checklist)
15. [Done when](#15-done-when)
16. [Open points](#16-open-points)

## 1. Order of work

1. Cents everywhere (section 2). The Market uses it and every existing screen is touched by it.
2. The Market client: state, SSE, recipes (sections 3 to 6).
3. The pricing code, with the vectors as unit tests (sections 7 and 8).
4. Selling and buying (sections 9 and 10).
5. The screens (section 12).

## 2. Cents

The site's ledger counts cents (1 LNBit = 100 cents) as integers. The mod must speak cents everywhere it talks to the site, and show LNBits with two decimals.

### 2.1 Talk in cents

- Add the header `X-Economy-Units: cents` to **every** call to `/api/economy/server/**` and `/api/quests/server/**`, including `GET /events`. Without it the site is in **legacy mode**: it reads a request as whole LNBits (multiplied by 100) and rounds every money field of an answer down to whole LNBits, which loses cents silently. The answer repeats the header; any value other than `cents` or `lnbits` is a 400 `invalidUnits`. Legacy mode disappears once every mod sends the header, so don't depend on it.
- With the header, every money field is an integer number of cents in requests and answers: `amount`, `balance`, `balanceAfter`, `tax`, `price`, `sellPrice`, `buyPrice`, `lotPrice`, `expectedLotPrice`, `casinoLicensePrice`, `startingBalance`, `rewardToday`, `payout`. The list lives in `server/lib/economy-units.ts` (`MONEY_FIELDS`). Counts (shop lots, item counts, quest objective amounts) were never multiplied. When in doubt: if it was a count of LNBits before, it is cents now.
- **The Market routes (`/api/economy/server/market/**`) never read the header** and are never converted. They always speak cents for totals, and plain numbers in LNBits for per-item prices and thresholds (see 2.2). Sending the header there is harmless.
- Use `Long` for amounts. Never `Double`, never `Float`. 10^12 LNBits is 10^14 cents, which fits a `Long` and a JSON number exactly (below 2^53).

### 2.2 Which Market numbers are cents and which are not

This is the one place to read carefully, because the Market mixes units on purpose.

| Field                                                                 | Where                    | Unit                                             |
| --------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `total`, `expectedTotal`, `brackets[].total`, `account.balance`       | quotes, orders           | integer cents                                    |
| `mintRemaining`                                                       | `/state`                 | integer cents                                    |
| `tiers[].q1`, `tiers[].q2`                                            | `/state`                 | integer cents of nominal value                   |
| `tiers[].midPercent`, `tailPercent`                                   | `/state`                 | integer percent (50 means 0.5)                   |
| `settings.sigma`                                                      | `/state`                 | fraction (0.15)                                  |
| `settings.tolerancePercent`                                           | `/state`                 | percent (1 means 1 %)                            |
| `p0`, `pMin`, `pMax`, `price` (in a quote or an order answer)         | `/state`, quotes, orders | LNBits per item, `Double`, can be below one cent |
| `s0`, `sMin`, `sMax`, `stock`, `k`, `alpha`                           | `/state`                 | `Double`                                         |
| `me.tiers[].nominal`, `toNextBracket`, `q1`, `q2` (a player's window) | `/players/:uuid`         | **LNBits**, `Double` (not cents)                 |
| `me.tiers[].rate`, `nextRate`, `brackets[].rate`                      | `/players/:uuid`, quotes | fraction (0.5 means 50 %)                        |

So the thresholds are cents in `/state.tiers` and LNBits in a player's window. Convert `/state` thresholds by dividing by 100 before they enter the formulas of section 7.

### 2.3 Show LNBits

- One formatting function for the whole mod: `cents / 100` with two decimals, thousands separated, and the trailing `.00` dropped. `123456` cents is `1,234.56`, `120000` is `1,200`, `5` is `0.05`. Don't use `Double` for it: split with integer division and remainder.
- Replace every place that formats an LNBit amount: the balance in the inventory, `/pay` messages, bank and account screens, shops, auction listings and notices, casino machines, quest rewards, mob-drop notices, the license price.

### 2.4 Read what players type

- `/pay #casino 12.5`, shop prices, listing prices and casino bets accept up to **two decimals** (`.` or `,`). More decimals are an error ("at most 2 decimals"), never a silent rounding. Parse to cents with integer arithmetic, not `toDouble() * 100`.
- Amounts stay positive and at most 10^12 LNBits.

### 2.5 Rules that now involve cents

- Shop lots and auction prices: a price is a whole number of cents, at least 1 cent. The auction tax is `auctionTaxPercent` of the price **rounded down to the cent**, which the site computes; the mod doesn't.
- Mob drops (`POST /mints`): the mod keeps counting in whatever it counts, but sends **cents**. Keep the same economy as before: if a drop was 3 LNBits, send 300.
- Casino machines: bets and payouts are cents. A machine that paid whole LNBits keeps doing so (the amounts are just multiples of 100), but nothing now forces it to.
- Quest rewards arrive already priced by the site, in cents.

### 2.6 Test it

- Parse: `0.1`, `0.10`, `0,1`, `12`, `12.34` accepted; `12.345` (refused), `-1` (refused), `0` (refused).
- Format: `0` gives `0`, `1` gives `0.01`, `100` gives `1`, `100000012` gives `1,000,000.12`.
- A balance of 1,234.56 survives a `/pay` of 0.01 and shows 1,234.55.

## 3. Talking to the Market

### 3.1 Transport and authentication

- Base: the economy API address the mod already has, path `/api/economy/server/market`.
- `Authorization: Bearer <WARDEN_SERVER_SECRET>`, the same secret as the other economy routes. A wrong secret is a 401 with no `data`.
- Bodies and answers are JSON (`Content-Type: application/json`). Dates are ISO 8601 strings.
- `player` is always the acting player's Minecraft UUID (with dashes, as the other routes take it).
- Every Market route also needs the `economy.serverApi` flag, and the rate limit `economy-server` applies. A 429 means "not processed, wait and retry".
- Never block the server thread on HTTP. Calls go through the usual async client, and the screen shows a spinner until the answer comes.

### 3.2 Error format

Every refusal has an HTTP status and a `data.problem` code. The JSON body is the standard Nitro error:

```json
{
  "statusCode": 409,
  "statusMessage": "priceChanged",
  "message": "priceChanged",
  "data": { "problem": "priceChanged", "quote": { "...": "..." } }
}
```

Read `data.problem`. Some refusals have no `data.problem`: a 400 `Bad Request` (a malformed body), a 401, a 429 and a bare 5xx. Section 5 says what to do for each.

### 3.3 On start and on every reconnection

1. `GET /state`: keep it whole (settings, tiers, `mintRemaining`, `revision`, items with their parameters and stock).
2. Open `GET /api/economy/server/events` (SSE, topic `economy`) and keep it open (section 6).
3. `PUT /recipes` with the recipe graph (section 4.5), whether or not the Market is open.

`GET /state` and `GET /players/:uuid` answer **503 `disabled`** while `economy.market` is off. Treat that as "Market closed": hide `/market`, keep the SSE open, and call `GET /state` again on the next `market-config` event or on a timer (a minute).

## 4. Routes, with examples

All examples use one item, the one of the test vectors (section 8), so the numbers can be checked. Floats are rounded here; the real answers carry full `Double` precision.

### 4.1 `GET /state`

No body. Answer (`marketState`):

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
  "tiers": [
    { "tier": 1, "q1": 3500, "q2": 9300, "midPercent": 40, "tailPercent": 5 },
    { "tier": 2, "q1": 2900, "q2": 7000, "midPercent": 40, "tailPercent": 5 },
    { "tier": 3, "q1": 3500, "q2": 9300, "midPercent": 40, "tailPercent": 5 }
  ],
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
      "stockAt": "2026-11-21T10:00:00.000Z"
    }
  ]
}
```

- `items` holds **only enabled items**. An item that disappears from a later `/state` was turned off: remove it. `enabled` is not a field of the state.
- `stock` is already drifted to `asOf`, and `stockAt` equals `asOf`. From there the mod drifts it itself (7.2).
- `settings.sell` and `settings.buy` tell which direction is open (flags `economy.market.sell`, `economy.market.buy`).
- `tiers[].q1`, `q2` are **cents**; `midPercent` and `tailPercent` are percents (section 2.2).
- `revision` grows with every committed change of an item, a setting, a tier or the recipes.

### 4.2 `GET /players/:uuid`

The player's window, for the "your efficiency" display. Answer (`marketPlayerWindow`), here after selling 10,000 cobblestone in the vector item's tier:

```json
{
  "tiers": [
    {
      "tier": 1,
      "nominal": 474.535973,
      "rate": 1,
      "toNextBracket": 4525.464027,
      "q1": 5000,
      "q2": 15000,
      "nextRate": 0.5
    },
    {
      "tier": 2,
      "nominal": 0,
      "rate": 1,
      "toNextBracket": 5000,
      "q1": 5000,
      "q2": 15000,
      "nextRate": 0.5
    },
    {
      "tier": 3,
      "nominal": 0,
      "rate": 1,
      "toNextBracket": 5000,
      "q1": 5000,
      "q2": 15000,
      "nextRate": 0.5
    }
  ],
  "capped": false
}
```

- All of `nominal`, `toNextBracket`, `q1`, `q2` are **LNBits** (not cents). `nominal` is what the player sold in the last 24 hours in that tier, before any reduction (a rolling window).
- `rate` is the share of the price paid now (`1`, then the tier's mid rate, then its tail rate), as a fraction.
- `toNextBracket` is the nominal LNBits still sellable at the current rate; `null` in the last bracket (then `nextRate` is `null` too).
- `nextRate` is the rate after the next threshold.
- `capped: true` means the 30-day mint budget is spent: sales pay nothing (a sale is refused `zeroPayout`).
- Errors: 404 `notLinked`, 403 `notEligible`, 503 `disabled`.

This `me` window is everything an efficiency UI needs: per tier, a meter filled to `nominal / q2` with a tick at `q1/q2`, the current `rate` as a percentage, "`toNextBracket` LNBits left at this rate, then `nextRate`". The window recovers by itself as old sales leave the 24-hour span. The same data is `me` on the public `GET /api/market`, used by the website's own meter.

Call it when the screen opens and after each of the player's orders: an order's answer carries the new stock but not the window. A sale adds its `nominal` (the `window - w` of the pricing code) to it.

### 4.3 `POST /quote`

The site's own price for a player, an item and a quantity, changing nothing. Use it for items the mod doesn't know, for checks and for a "what does the site say" debug. The mod normally previews locally (section 7).

Request (`marketQuoteBody`): `{ player, item, direction, quantity }`, `quantity` 1 to 32767 (the order's limit `maxOrderItems` applies, see below).

```json
{
  "player": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "item": "minecraft:cobblestone",
  "direction": "sell",
  "quantity": 100000
}
```

Answer (`marketQuote`), for a player whose tier-1 window is 4,000 LNBits:

```json
{
  "direction": "sell",
  "item": "minecraft:cobblestone",
  "quantity": 100000,
  "total": 197672,
  "capped": false,
  "brackets": [
    { "rate": 1, "quantity": 22375.707459, "total": 85000 },
    { "rate": 0.5, "quantity": 77624.292541, "total": 112672 }
  ],
  "price": 0.029264,
  "stock": 181187.85373
}
```

(The quantity above 2,304 is only for the example; a real order is capped, 4.4.)

- `total`: cents. A sale is floored, a purchase rounded up, a capped sale is cut to the budget left.
- `brackets` (sales only): what each rate paid. The item at a boundary is split, so `quantity` can be fractional. The totals add up to the uncapped sale total; when `capped` is true, `total` is what is paid and the brackets still show the uncapped sale.
- `price`: the reference price after the order, LNBits per item. `stock`: the stock after.
- Errors: 404 `notLinked`, `notFound` (unknown item); 403 `notEligible`; 409 `itemDisabled`, `notSellable`, `notBuyable`; 400 `tooManyItems` (quantity above `maxOrderItems`); 503 `disabled` (the Market or that direction is off).
- A quote does not check funds, frozen accounts or `zeroPayout`.

### 4.4 `POST /orders`

Request (`marketOrderBody`):

| Field            | Type            | Notes                                                                                                 |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `idempotencyKey` | UUID            | A fresh `UUID.randomUUID()` per order, kept until the order is settled.                               |
| `player`         | Minecraft UUID  | The acting player.                                                                                    |
| `item`           | registry ID     | `minecraft:cobblestone`, lower case.                                                                  |
| `direction`      | `sell` or `buy` |                                                                                                       |
| `quantity`       | integer         | 1 to `settings.maxOrderItems` (2,304 by default). Above it is a 400 `tooManyItems`. Hard limit 32767. |
| `expectedTotal`  | integer cents   | What the player saw, 0 to 10^14.                                                                      |
| `account`        | string          | A purchase only: the ID or `#handle` of the paying account. Without it, the player's default account. |

**A sale** (10,000 cobblestone, a window of 0 in tier 1):

```json
{
  "idempotencyKey": "c0a8e1a2-7b0f-4f6e-9a55-3d3b6a0f0c11",
  "player": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "item": "minecraft:cobblestone",
  "direction": "sell",
  "quantity": 10000,
  "expectedTotal": 40335
}
```

Answer (`marketOrderResult`):

```json
{
  "direction": "sell",
  "item": "minecraft:cobblestone",
  "quantity": 10000,
  "total": 40335,
  "capped": false,
  "brackets": [{ "rate": 1, "quantity": 10000, "total": 40335 }],
  "price": 0.045059,
  "stock": 130000,
  "transactionId": 18231,
  "replayed": false,
  "account": {
    "accountId": "7d1f3a0e-5c9b-4d86-8a3c-2f6a7a4d9e10",
    "handle": null,
    "balance": 140335
  }
}
```

`account` is the **personal** account that was credited (`handle` is `null` for a personal account); `balance` is its new balance in cents. Use it to refresh the player's balance. The money was minted: nothing else to do.

**A purchase** (64 cobblestone):

```json
{
  "idempotencyKey": "4a1b0e0e-2a3f-45d2-b2c9-9d9f2b3d7a02",
  "player": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "item": "minecraft:cobblestone",
  "direction": "buy",
  "quantity": 64,
  "expectedTotal": 369,
  "account": "casino-royal"
}
```

Answer:

```json
{
  "direction": "buy",
  "item": "minecraft:cobblestone",
  "quantity": 64,
  "total": 369,
  "capped": false,
  "price": 0.050035,
  "stock": 119936,
  "transactionId": 18232,
  "replayed": false,
  "account": {
    "accountId": "b3f1b6a2-0d57-4f6b-8f2f-6f0a4a1c3e55",
    "handle": "casino-royal",
    "balance": 12500
  },
  "mailboxItemId": "e2f0f6b4-3a7e-4a0c-9d5b-1c7a7b3c9d21"
}
```

A purchase has no `brackets`, `capped` is always `false`, and the money was burned: claim `mailboxItemId` at once (section 10).

**What the site checks, in this order** (useful to know which refusals prove that nothing moved):

1. The key: an order already made with this key gives its first answer with `replayed: true`, **even when the Market or the direction is off**. The same key with another request (player, account, item, direction, quantity or `expectedTotal` differ) is 409 `idempotencyMismatch`. A key used by any other ledger transaction is also `idempotencyMismatch`.
2. The flags, for a new order only: 503 `disabled` if `economy.market` or the direction's flag is off.
3. The item: 404 `notFound`, 409 `itemDisabled`, `notSellable` or `notBuyable`, 400 `tooManyItems` for a quantity above `maxOrderItems`.
4. The player: 404 `notLinked`, 403 `notEligible`, 409 `frozen` (a site or Warden ban in force, or a frozen account).
5. A purchase's account: 403 `notAllowed` (the player can't spend from it), 404 `notFound`.
6. The price: a sale cut to 0 cents is 409 `zeroPayout`. A total worse than the tolerance is 409 `priceChanged` with the quote.
7. The ledger: a purchase the account can't afford is 409 `insufficientFunds`.

Then, in one database transaction: the ledger entry, the order, the mailbox item (purchase) or the window event (sale), and the stock. Nothing is half-done.

**`priceChanged`.** The site accepts a sale when `total >= expectedTotal * (1 - tolerance)` and a purchase when `total <= expectedTotal * (1 + tolerance)`. Otherwise:

```json
{
  "statusCode": 409,
  "statusMessage": "priceChanged",
  "message": "priceChanged",
  "data": {
    "problem": "priceChanged",
    "quote": {
      "direction": "sell",
      "item": "minecraft:cobblestone",
      "quantity": 10000,
      "total": 40335,
      "capped": false,
      "brackets": [{ "rate": 1, "quantity": 10000, "total": 40335 }],
      "price": 0.045059,
      "stock": 130000
    }
  }
}
```

Nothing moved. Show the new `quote.total` and let the player confirm again with a **new** idempotency key. An `expectedTotal` that is better for the player than the site's (a sale expecting less, a purchase expecting more) is accepted, and the order pays or charges the site's total, not the expected one.

**`capped`.** When the 30-day mint budget (`mintRemaining`) is smaller than the sale, the order's `total` is what is left and `capped` is `true`. The tolerance rule still applies to that capped total: if the player's `expectedTotal` (your preview, which should already apply `min(total, mintRemaining)`) is more than the tolerance above it, the answer is a `priceChanged` whose `quote.capped` is `true`. If nothing is left, the order is refused `zeroPayout`. In both cases tell the player that the market is paying less today. The brackets of a capped sale are the uncapped ones; `total` and `capped` say what was paid.

**Idempotency key behaviour.**

- Generate the key when the player confirms, store it with the order (on disk for a sale), and reuse it for every retry of that same order. A new order, or a `priceChanged` confirmation, gets a new key.
- A retry with the same key and the same request returns the **first answer** with `replayed: true`, even long after (the answer is stored). Treat `replayed: true` as a success.
- A retry whose request differs in any of the fields above is 409 `idempotencyMismatch`. This means a bug in the mod (a key reused) or a key collision: never change an order under a key. For a sale in escrow the 409 `idempotencyMismatch` proves that a transaction exists under this key: keep the escrow, log it loudly, and ask an admin (it should never happen).
- The check runs before the item, player and price checks: once an order exists, a retry gets its answer whatever changed since, flags included (see 5.3).

### 4.5 `PUT /recipes`

Sends the recipe graph, so the site's loop validator knows which items can be crafted from which. Not behind `economy.market`: send it whether or not the Market is open.

Request (`marketRecipeBody`): `{ "recipes": [ ... ] }`, 1 to 100,000 recipes, each:

| Field    | Notes                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `type`   | The recipe type, 1 to 100 characters: `minecraft:crafting_shaped`, `minecraft:smelting`, `minecraft:stonecutting`, a mod's own. |
| `output` | `{ id, count }`: the item ID and how many one craft makes (1 to 1000).                                                          |
| `inputs` | 1 to 27 entries `{ id, count }`: the item ID and how many one craft consumes in total (1 to 1000).                              |

```json
{
  "recipes": [
    {
      "type": "minecraft:crafting_shaped",
      "output": { "id": "minecraft:stone_bricks", "count": 4 },
      "inputs": [{ "id": "minecraft:stone", "count": 4 }]
    },
    {
      "type": "minecraft:smelting",
      "output": { "id": "minecraft:stone", "count": 1 },
      "inputs": [{ "id": "minecraft:cobblestone", "count": 1 }]
    }
  ]
}
```

- Send every recipe of the recipe manager: crafting (shaped and shapeless), smelting, blasting, smoking, campfire cooking and stonecutting, mods included.
- Merge repeated ingredients: if a recipe needs 2 of one item in two slots, send one input with `count: 2`.
- For an ingredient that accepts several items (a tag), send **one recipe per item the tag matches**.
- Send the whole graph every time (it replaces the stored one). Send it at start and again when the set of recipes changes (a data-pack reload). A graph identical to the stored one changes nothing and sends no event, so a restart is free.
- Answer:

```json
{ "stored": 1432, "changed": true, "problems": [] }
```

`stored` is the number of recipes now stored, `changed` whether the graph differed from the stored one, and `problems` the loops the validator finds in the **current catalog** with this graph (each `{ item, value, cost, path }`). `PUT /recipes` itself **does not refuse** a graph: a non-empty `problems` only means an admin must reprice or switch an item off. Log each problem (`item`, `value`, `cost`) at warning level for the admins. A malformed body is a 400.

The refusals named `noRecipes` and `loop` are the **admin's**, not the mod's: when an admin saves a catalog change or settings (`PATCH /items/:id`, `POST /items`, `PATCH /settings`, `POST /validate`), the site answers 409 `noRecipes` if no recipe graph was ever stored, and 409 `loop` (with `data.loops`) if the change would let an item be crafted for less than it sells for. The mod never sees them, but this is why the graph must be sent at start: **without it, an admin cannot enable or reprice items** (closing doors, such as `enabled`, `sellable` or `buyable` off, is always allowed).

## 5. Errors and what to do

### 5.1 The table

"Definitive" means the order did not happen (for a first attempt) or is proven not to exist (for a retry, see 5.2). **Only a definitive refusal lets a sale return its items.**

| Status | `data.problem`                       | Meaning                                                   | Definitive         | What the mod does                                                                                  |
| ------ | ------------------------------------ | --------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| 200    | none                                 | Done, or `replayed: true`                                 | success            | Settle the order (sale: drop the escrow; purchase: claim the mailbox item).                        |
| 400    | none (`Bad Request`)                 | Malformed body                                            | yes                | A bug: return the items, log it.                                                                   |
| 400    | `tooManyItems`                       | Quantity above `maxOrderItems`                            | yes                | A stale `/state`: return the items, read `/state` again.                                           |
| 401    | none                                 | Wrong server secret                                       | no                 | Configuration error. Keep the escrow, log loudly, retry later.                                     |
| 403    | `notEligible`                        | The player can't use the economy (not eligible)           | yes                | Return the items, "your account can't trade".                                                      |
| 403    | `notAllowed`                         | The player can't spend from the chosen account            | yes                | Nothing moved: "you can't spend from this account".                                                |
| 404    | `notLinked`                          | No LNB account linked to this Minecraft account           | yes                | Return the items, "link your account on the website".                                              |
| 404    | `notFound`                           | Unknown item, or unknown account                          | yes                | Return the items. For an item: read `/state` again, the item was removed.                          |
| 409    | `itemDisabled`                       | The item was turned off                                   | yes                | Return the items, "this item is no longer traded". Read `/state`.                                  |
| 409    | `notSellable`, `notBuyable`          | The direction is off for this item                        | yes                | Return the items. Read `/state`.                                                                   |
| 409    | `zeroPayout`                         | A sale would pay 0 cents (too few items, or budget spent) | yes                | Return the items, "sell a few more" (or "the market is not paying today" when `me.capped`).        |
| 409    | `priceChanged` (with `quote`)        | The total got worse beyond the tolerance                  | yes                | Return the items, show `quote.total`, ask again with a **new key**.                                |
| 409    | `insufficientFunds`                  | The account can't afford a purchase                       | yes                | "Not enough LNBits".                                                                               |
| 409    | `frozen`                             | The player's accounts are frozen or banned                | yes                | Return the items. "Your account is frozen": no further detail.                                     |
| 409    | `idempotencyMismatch`                | The key was used for another request                      | see 4.4            | A mod bug. Keep any escrow, log loudly, alert an admin.                                            |
| 429    | none                                 | Rate limited, not processed                               | no                 | Wait (honour a `Retry-After` header if there is one) and retry the same request with the same key. |
| 503    | `disabled` (with `flag`)             | The Market, or the direction, is off                      | first attempt only | See 5.3.                                                                                           |
| 5xx    | none, or a timeout, or no connection | Unknown                                                   | no                 | **Unknown outcome.** Keep the escrow and retry with the same key (see 5.2).                        |

`data.flag` names the flag that was off in a 503 `disabled` (`economy.market`, `economy.market.sell` or `economy.market.buy`).

### 5.2 Unknown outcomes

A timeout, a connection error, a 5xx, a 429 or a 401 tells nothing about whether the order was committed. The site's answer is stored under the key, so:

- **Retry the exact same request with the same key**, with a growing delay (1 s, 2 s, 4 s, 8 s, then every 30 s, for as long as it takes), also across restarts.
- A `replayed: true` answer is a success; settle as for a normal success.
- A definitive refusal on a retry is also definitive for the order: the site looks for an order with the key **before** any other check, so a refusal other than 503 proves that no order exists under that key.
- A sale's items stay in escrow throughout. They are never given back and never dropped on an unknown outcome.

### 5.3 503 `disabled`

- It is definitive: the site looks at the key first, so a stored order is always answered (`replayed: true`) even while the Market is off. A 503 `disabled` therefore proves that no order exists under that key and nothing moved. Return the items and say the market is closed.
- Retrying an unknown outcome with the same key while the Market is off settles it: the answer is the first one, or a definitive refusal.

## 6. Live changes (SSE)

`GET /api/economy/server/events` is a Server-Sent Events stream, shared with the other economy events (`accounts`, `invitation`). `Authorization` as above. Each event has an `id`, an `event` type and a JSON `data`. Send `Last-Event-ID` when reconnecting to resume after the last event you handled; without it the stream starts from now (so also read `/state` after a reconnection). A `ping` event comes after 25 quiet seconds, and events are kept for a day.

| Event           | Data                                       | When                                                                                                  | What the mod does                                                                                                                                                                                          |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `market`        | `{ revision, items: [{ id, stock, at }] }` | Orders moved stocks. At most one a second, with the latest stock of each item touched since the last. | For each item: `stock = stock` and `stockAt = at` in your copy (they are the stock **right after the order**, not drifted). If `revision` is larger than yours, you missed a config change: read `/state`. |
| `market-config` | `{ revision }`                             | An admin changed an item, a tier or a setting, or the recipes changed.                                | Read `/state` again (it replaces everything).                                                                                                                                                              |

- Flag changes send **no** event. The mod learns of a flag from `settings.sell` and `settings.buy` in `/state`, or from a 503 `disabled`. Re-read `/state` at least every few minutes while the screen is open, or when an order answers `disabled`.
- Between events nothing is stale beyond a second or so, because the drift is a pure function of time: recompute it at the moment you render (7.2).
- Never trust a copy older than the last `revision` you saw.

## 7. Computing prices

The site is authoritative: the mod's numbers are a **preview**. The site's total can differ by a few cents because of floating point, and the order's tolerance (1 %) absorbs that. Use `Double` and follow the formulas exactly so the difference stays at the last bits.

### 7.1 Definitions

For one item, with `σ` (`settings.sigma`) the spread and `r` the rate of the player's bracket:

```
clamp(x, lo, hi) = min(hi, max(lo, x))
pRef(s)          = clamp(p0 * (s0 / s)^k, pMin, pMax)
sA               = s0 * (p0 / pMax)^(1 / k)     // below sA the price is flat at pMax
sB               = s0 * (p0 / pMin)^(1 / k)     // above sB the price is flat at pMin
```

The thresholds `q1`, `q2` of the player's tier in LNBits are `state.tiers[].q1 / 100`, `q2 / 100`, or the `q1`, `q2` of the player's window (already LNBits). The rates `mid` and `tail` are `midPercent / 100` and `tailPercent / 100`.

### 7.2 Drift

Drift the stock to the current time, before anything else (use the stock's own `stockAt` and the current time; the clock difference with the site is seconds at most):

```
sNow = s0 + (stock - s0) * (1 - alpha)^(hoursSince(stockAt))      // hours, fractional, never negative
```

### 7.3 The integral

`I(a, b)`, the integral of `pRef` from stock `a` to `b` (`a <= b`), is the sum over the three pieces. It is continuous, so a sale split in several orders pays the same as one order:

```
F(s) = k == 1 ? p0 * s0 * ln(s)                  // the site treats |1 - k| < 1e-9 as 1
               : p0 * s0^k * s^(1 - k) / (1 - k)

I(a, b) = 0                                       if b <= a
        = pMax * max(0, min(b, sA) - max(a, 0))
        + (F(min(b, sB)) - F(max(a, sA)))        if min(b, sB) > max(a, sA)
        + pMin * max(0, b - max(a, sB))
```

`inverse(a, C)` is the `b >= a` with `I(a, b) = C`. Walk the pieces from `a`: on the flat top piece (`a < sA`), `b = a + C / pMax` if `C` fits before `sA`, else subtract `pMax * (sA - a)` from `C` and continue from `sA`. On the power piece, if `C` fits before `sB` (compare with `F(sB) - F(from)`): for `k != 1`, `b = (from^(1-k) + C * (1 - k) / (p0 * s0^k))^(1 / (1 - k))`, for `k = 1`, `b = from * exp(C / (p0 * s0))`; else subtract and continue from `sB`. On the last flat piece, `b = from + C / pMin`.

### 7.4 Preview of a purchase

A purchase of `q` items from stock `s = sNow`. The stock never goes below `sMin`; items bought past it still cost `pRef(sMin)`, and the stock stays at `sMin`:

```
d     = min(q, max(0, s - sMin))
cost  = (1 + σ) * ( I(s - d, s) + (q - d) * pRef(sMin) )
total = ceil(cost * 100 - 1e-6)           // cents. New stock: s - d
```

### 7.5 Preview of a sale

A sale of `q` items from stock `s = sNow`, with the player's window `w` in the item's tier (LNBits of nominal value, from `GET /players/:uuid`), thresholds `q1 < q2` (LNBits) and rates `mid`, `tail` (fractions). Selling `n` items at rate `r` walks `r * n` of stock and pays `(1 - σ)` of the integral over that walked span. The sale is cut exactly at the bracket boundaries. Past `sMax` the stock stays at `sMax` but the sale still pays at `pRef(sMax)`.

```
pay = 0
while q > 1e-9:
    if   w <  q1: r = 1,    cap = q1 - w            // cap: nominal LNBits left in this bracket
    elif w <  q2: r = mid,  cap = q2 - w
    else:         r = tail, cap = infinity

    if s >= sMax:                                   // the stock stays; the price is pRef(sMax)
        p = pRef(sMax)
        n = min(q, cap / p)
        pay += (1 - σ) * r * n * p
        if n == q: w += n * p ; q = 0
        else:      w = the bracket's threshold ; q -= n
        continue

    d = r * q                                       // stock this segment would walk
    if d >= sMax - s: d = sMax - s ; reachedMax = true
    if I(s, s + d) / r > cap:                       // the bracket ends inside the segment
        d = inverse(s, cap * r) - s ; endsHere = true ; reachedMax = false
    v    = I(s, s + d)                              // what the walked stock is worth
    pay += (1 - σ) * v
    if endsHere:  w = the bracket's threshold       // exact, no rounding sliver
    else:         w += v / r                        // nominal value counted in the window
    if endsHere or reachedMax: q -= d / r else q = 0
    s = reachedMax ? sMax : s + d
total = floor(pay * 100 + 1e-6)                     // cents. Then total = min(total, mintRemaining)
```

Quantities can be fractional inside the loop: the item at a bracket boundary is split. The `1e-6` is an epsilon so that float noise (a price that is exactly 1,725 LNBits) doesn't cost a cent; the site uses it, so the mod should too. The loop runs a few passes at most (three brackets).

The window the sale adds is `w_end - w_start` (LNBits). Keep it if you update your copy of the player's window locally; otherwise read it again.

`mintRemaining` from `/state` (cents) caps the payout: `total = min(total, mintRemaining)`, and then show it as capped. It is a global budget, so other players' sales lower it between your preview and the order: that is a `priceChanged`, which is fine.

Do not recompute prices for every frame. Compute when the screen opens, on an event that touches the item, and on hover for the stack under the cursor.

## 8. Test vectors

One item, to check the arithmetic on both sides. All figures were produced by running `shared/utils/market.ts`.

```
p0 = 0.05   pMin = 0.0025   pMax = 0.15   s0 = 120000   sMin = 12000   sMax = 1200000
k = 1.3     alpha = 0.05    σ = 0.15
tier: q1 = 5000, q2 = 15000, mid = 0.5, tail = 0.1       // LNBits
```

Derived: `sA = 51542.430769`, `sB = 1202191.216004`.

The pricing unit tests are in `test/unit/market-pricing.test.ts`; they use the same vectors.

### 8.1 Reference price

| Case                                                            | Result   |
| --------------------------------------------------------------- | -------- |
| `pRef(120000)`                                                  | 0.050000 |
| `pRef(60000)`                                                   | 0.123114 |
| `pRef(200000)`                                                  | 0.025738 |
| `pRef(130000)`                                                  | 0.045059 |
| `pRef(12000)` and `pRef(30000)` (flat at pMax, both below `sA`) | 0.150000 |
| `pRef(1200000)`                                                 | 0.002506 |
| `pRef(1500000)` (flat at pMin, above `sB`)                      | 0.002500 |

### 8.2 Sales

| Case                                                        | Total (LNBits, exact) | Cents       | New stock      | Window after (LNBits) |
| ----------------------------------------------------------- | --------------------- | ----------- | -------------- | --------------------- |
| sell 1, `s = 120000`, `w = 0`                               | 0.04                  | **4**       | 120,001        | 0.05                  |
| sell 1,000, `s = 120000`, `w = 0`                           |                       | **4,227**   | 121,000        | 49.730885             |
| sell 2,304, `s = 120000`, `w = 0` (a full inventory)        |                       | **9,671**   | 122,304        | 113.783137            |
| sell 10,000, `s = 120000`, `w = 0`                          | 403.355577            | **40,335**  | 130,000        | 474.535973            |
| sell 100,000, `s = 120000`, `w = 0`                         | 2,826.520139          | **282,652** | 220,000        | 3,325.317811          |
| sell 20,000, `s = 120000`, `w = 4000` (stays below `q1`)    |                       | **76,826**  | 140,000        | 4,903.843783          |
| sell 100,000, `s = 120000`, `w = 4000` (crosses `q1`)       | 1,976.726592          | **197,672** | 181,187.853730 | 7,651.121393          |
| sell 2,304, `s = 120000`, `w = 16000` (tail bracket)        | 9.779798              | **977**     | 120,230.4      | 16,115.056442         |
| sell 10,000, `s = 1150000` (near `sMax`, does not reach it) | 22.385769             | **2,238**   | 1,160,000      | 26.336199             |
| sell 10,000, `s = 1195000` (reaches `sMax`, stock capped)   |                       | **2,132**   | 1,200,000      | 25.093405             |
| sell 10,000, `s = 1200000` (at `sMax`: stock stays)         |                       | **2,130**   | 1,200,000      | 25.059362             |
| sell 1,000, `s = 1200000`, `w = 16000` (at `sMax`, tail)    |                       | **21**      | 1,200,000      | 16,002.505936         |

Notes on the sales:

- The row "sell 20,000 with `w = 4000`" ends at a window of 4,903.84, still below `q1` (5,000): a single bracket at rate 1.
- Selling 100,000 with `w = 4000` crosses `q1`: brackets `[{ rate: 1, quantity: 22375.707459, total: 85000 }, { rate: 0.5, quantity: 77624.292541, total: 112672 }]`. The part totals add up to the sale total (cumulative floors; the remainder goes to the last part).
- At `sMax` the stock stays at `sMax` and the price is `pRef(sMax) = 0.002506`, but the sale still pays (and still adds to the window at `n * pRef(sMax)`).
- The tail-bracket sale (`w = 16000`): the window is already past `q2`, so a single bracket at rate 0.1 applies: 2,304 items walk only 230.4 of stock (new stock 120,230.4).

### 8.3 Purchases

| Case                                                               | Total (LNBits, exact) | Cents       | New stock |
| ------------------------------------------------------------------ | --------------------- | ----------- | --------- |
| buy 1, `s = 120000`                                                | 0.06                  | **6**       | 119,999   |
| buy 64, `s = 120000`                                               |                       | **369**     | 119,936   |
| buy 2,304, `s = 120000`                                            |                       | **13,416**  | 117,696   |
| buy 10,000, `s = 120000`                                           | 608.283094            | **60,829**  | 110,000   |
| buy 10,000, `s = 20000` (hits `sMin`)                              | 1,725.000000          | **172,500** | 12,000    |
| buy 100, `s = 12050` (50 items to `sMin`, 50 more at `pRef(sMin)`) | 1,725.000000          | **1,725**   | 12,000    |
| buy 64, `s = 12000` (already at `sMin`: stock stays)               |                       | **1,104**   | 12,000    |
| buy 100, `s = 1300000` (above `sMax`, flat at pMin)                |                       | **29**      | 1,299,900 |

The "buy 10,000 from 20,000" case pays 8,000 items at `pMax = 0.15` (the stock is below `sA`) and 2,000 more at `pRef(sMin) = 0.15`, all times 1.15 = 1,725 LNBits exactly: this is why the epsilon in `ceil(cost * 100 - 1e-6)` matters.

### 8.4 Drift

| Case                           | Result         |
| ------------------------------ | -------------- |
| drift 24 h from stock 180,000  | 137,519.341460 |
| drift 36.5 h from stock 12,000 | 103,391.311169 |

### 8.5 The case `k = 1`

Same item with `k = 1` (the logarithmic antiderivative): `sA = 40000`, `sB = 2400000`.

| Case                                          | Result                                 |
| --------------------------------------------- | -------------------------------------- |
| `pRef(120000)`, `pRef(60000)`, `pRef(200000)` | 0.050000, 0.100000, 0.030000           |
| sell 10,000, `s = 120000`, `w = 0`            | **40,821** cents, window 480.256246    |
| sell 100,000, `s = 120000`, `w = 0`           | **309,129** cents, window 3,636.814821 |
| buy 10,000, `s = 120000`                      | **60,038** cents                       |
| buy 64, `s = 120000`                          | **369** cents                          |

### 8.6 Tolerances and properties

- A test passes with an error under 1e-6 on the figures above (prices, windows, stocks) and exactly on the cent totals of the pricing code (the epsilon rule above). Against the site, accept 2 cents of difference on a total.
- Two sales of 50,000 in a row (the window and the stock carried over) pay the same as one of 100,000, within a cent each, when nothing else changes.
- `inverse(a, I(a, b)) = b` for any `a < b`.

## 9. Selling

1. Check on the server thread, with no HTTP: the player is at the screen, the item is `sellable` and `enabled` (present in the state with `sellable: true`), `settings.sell` is true, the quantity is 1 to `settings.maxOrderItems` (2,304), and every item is **plain**: no damage, no enchantments, no custom name, no NBT other than the default, and not taken from inside a shulker box, bundle or other container. A tool or armor is never in the catalog, but check anyway.
2. **Take the items aside** (escrow): remove them from the inventory and keep them in memory and **on disk**, with the order's `idempotencyKey` (a fresh UUID), the player's UUID, the item, the quantity, `expectedTotal` and the time. Check the inventory again at this step: if the player dropped an item since the preview, abort without calling the site.
3. `POST /orders` with `direction: "sell"`, the quantity and `expectedTotal` (your preview, in cents).
4. **On success** (200, `replayed` true or false): the site has minted the payout on the personal account. Tell the player the total and, for `capped: true`, why. Drop the escrow (delete the entry on disk only after the answer is handled). Update the stock from the answer, and refresh the balance from `account.balance`.
5. **On a definitive refusal** (5.1): give the items back and tell the player why. For `priceChanged`, show the new `quote.total` and, if they confirm, start again from step 1 with a **new key**.
6. **On a timeout, a connection error, a 5xx, a 429 or a 401**, the outcome is unknown. **Do not give the items back and do not drop them.** Keep the escrow and retry the same request with the same key (5.2). Only after a definitive answer do you settle.
7. The escrow is stored on disk (player UUID, key, item, quantity, items, expected total, time). **On server start, replay every pending order** with its key and settle it. A player who logs in with a pending order is told it is being settled; if they were offline when it settles, hold the items (on a refusal) or the message (on a success) until they log in. Returned items go to the inventory, or the player's mailbox if it is full: never drop them on the floor.
8. If the player disconnects mid-sale, the order still settles; nothing in the flow depends on the player being online except messages.

## 10. Buying and the mailbox

1. Check: the item is `buyable` and `enabled`, `settings.buy` is true, the quantity is 1 to 2,304, and the account is one the player can spend from (otherwise `notAllowed`).
2. `POST /orders` with `direction: "buy"`, `account` if they picked one, and `expectedTotal` (your preview, in cents). Persist the order's key (disk) before sending.
3. **On success** the money was burned and the answer carries a `mailboxItemId`. Persist it next to the key at once, then claim it:

   ```
   POST /api/economy/server/mailbox/{mailboxItemId}/claim
   X-Economy-Units: cents
   { "player": "<uuid>", "idempotencyKey": "<a fresh UUID, stored>", "count": 40 }
   ```

   `count` is optional: omit it to take the whole item, or pass how many fit in the inventory. Answer (`economyMailboxClaimResult`): the mailbox view `{ id, item: { id, name, snbt }, count, reason, createdAt, replayed }`, where `count` is the number **claimed** (hand over exactly that many) and `reason` is `market`.

4. **Partial claims.** If `count` is smaller than the item's count (only a Market purchase can be claimed in part), the claimed row keeps its `id` and the claim key, with `count` set to what was claimed, and the rest waits in **a new mailbox row with a new `id`** (same item, reason `market`). Tell the player that the rest waits in their mailbox, and find it with `GET /api/economy/server/players/:uuid/mailbox`. Claim it later the same way (new key per claim). `count` above the item's count is 400 `invalidCount`.
5. **Crashes and retries.** Persist the key and the `mailboxItemId` until the claim answers. After a crash, read the mailbox: the items are there until claimed, so nothing is lost and nothing is given twice, because the claim is idempotent by key: the same key returns the same part with `replayed: true` (hand over only on the first, non-replayed answer when you can tell, otherwise on the first success you record on disk), another key on a claimed item is 409 `alreadyClaimed`.
6. **On a refusal** of the order, nothing moved (no money, no mailbox item): tell the player why. For `priceChanged`, show the new `quote` and allow a new attempt with a new key.
7. **On a timeout, connection error or 5xx**, retry the order with the same key (5.2). The answer, replayed or not, carries the same `mailboxItemId`.
8. A claim of an item that is not in the player's mailbox, or not theirs, is 404 `notFound`.

## 11. Flags, frozen players and edge cases

### 11.1 The flags

Three flags, all off at launch, switched by an admin at `/admin/settings/flags`. Each is also readable from `/state`.

| Flag                  | Off means                                                                                                                                            | What the mod does                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `economy.market`      | The whole Market is closed. `GET /state`, `GET /players/:uuid`, `POST /quote`, `POST /orders` all answer 503 `disabled`. `PUT /recipes` still works. | `/market` says "the market is closed". Keep the SSE open. Re-read `/state` on a timer. Escrowed sales keep retrying (5.3). |
| `economy.market.sell` | The Market is open, but sales (and sale quotes) answer 503 `disabled`. `/state.settings.sell` is false.                                              | Hide the sell side. Don't escrow. A sale already in escrow retries (5.3).                                                  |
| `economy.market.buy`  | Same for purchases. `/state.settings.buy` is false.                                                                                                  | Hide the buy side.                                                                                                         |

Order of opening: `economy.market` first, then `.sell`, then `.buy` (section 13). A child flag only matters when the Market is on.

### 11.2 Frozen and banned players

A player with a site or Warden ban in force, or whose account is frozen, can't trade: their orders answer 409 `frozen`. A sale gives the items back; a purchase moves nothing. Don't show a reason beyond "your account is frozen". Quotes and `/players/:uuid` still answer for them, so the screen opens; the order is refused.

### 11.3 Other edge cases

- **Two players trade the same item at once.** The site serializes them; one may get `priceChanged`. That is normal.
- **The preview and the answer differ by a cent or two.** The answer is authoritative and the player sees it. Never "fix" it.
- **The player drops an item between the preview and the click.** Check the inventory again at step 2 of a sale, and abort without calling the site.
- **Items the site doesn't know.** An item that isn't in `/state` isn't traded: show nothing and don't call the site (`POST /quote` answers 404 `notFound` if you want to ask).
- **Reload and reconnection.** After the event stream reconnects, read `/state` again; don't trust a copy older than the last `revision` you saw.
- **2,304 items per order.** `settings.maxOrderItems` (36 stacks, a full inventory) can be changed by an admin (1 to 32767); always read it from `/state`. Larger requests are a 400 `tooManyItems`.
- **An account that can't spend.** A purchase from a shared account the player is only a viewer of is 403 `notAllowed`.
- **Mint budget spent.** Sales are refused `zeroPayout`; `me.capped` is true. The budget refills as old sales leave the 30-day span.

## 12. What players see

- **`/market`** opens a screen with category tabs (the three tiers, or item groups), for each item: its icon and name, the price to sell and to buy for 1 and for 64 items, a percentage badge against the base price `p0` (`(pRef - p0) / p0`; green above, red below, section 16 point 3), and the player's own **efficiency** per tier (section 4.2: the current rate, 100 %, 50 % or 10 %, and how much is left before it drops). Each item also shows its price history (24 h, 7 days, 30 days, 1 year) from the public `GET /api/market/items/:id/history`, and the website's sparkline comes from `GET /api/market`.
- **Hover**: the exact payout (or cost) of selling (or buying) the stack under the cursor, computed locally (section 7), with the average price per item and the rate that applies.
- An item that isn't `sellable` shows no sell price. An item that isn't `buyable` shows no buy price. An item absent from `/state` isn't shown at all.
- Selling: click an item, then a quantity (1, 16, 64, a full inventory, or a number, up to `maxOrderItems`). Only matching plain items in the player's inventory count. Buying: the same, with the account that pays (the player's default one unless they pick another).
- Show the player when a payout is `capped` or `me.capped` is true: "The market is paying less today."
- Show a clear message for each problem code, in the game's language (English and French): `insufficientFunds`, `frozen`, `notEligible`, `itemDisabled`, `notSellable`, `notBuyable`, `zeroPayout` ("sell a few more"), `priceChanged` (with the new total), `disabled` (the market is closed for now), `notLinked`, `notAllowed`.
- **Efficiency UI** from `me.tiers`: per tier, a meter filled to `nominal / q2`, a tick at `q1 / q2`, the current `rate` as a percentage, and "`toNextBracket` LNBits at this rate, then `nextRate`" (nothing in the last bracket). `nominal` is the value before reduction, so the meter measures how much the player sold, not what they were paid.

### 12.1 Config

Nothing to configure by hand: the API address and the secret are already the ones of the economy mod. The Market's own settings (spread, tolerance, thresholds, limits) come from `/state`, so an admin changes them without a restart.

## 13. Rollout

### 13.1 Order of deployment

1. **The site first.** It is deployed with the cents migration and the Market, which ships **off** (the three flags are seeded disabled). It works with the **current** mod unchanged, thanks to legacy mode: a request without `X-Economy-Units` is read as whole LNBits and answered rounded down to whole LNBits.
2. **The mod after.** Ship the cents change (section 2) first or together with the Market. The Market routes need no header; the other routes need it, or the mod stays in legacy mode (and loses cents).
3. The mod sends the recipe graph at start. Check the site's admin (`/admin/economy/market`, Overview, "Needs a look") shows when the list was last sent.
4. Only then turn the Market on, as below. While the flags are off, the mod hides `/market`.

A retry of a legacy call made before the site deploy may report `idempotencyMismatch` (the key's fingerprint changed units). Rare and harmless.

### 13.2 Turning the Market on

Done by an admin, one flag at a time, in `/admin/settings/flags`. The Market starts with tight caps: lower the numbers first in `/admin/economy/market/settings`, then open the doors.

1. Before any flag: set `mintCapPercent` low (a few percent), `maxOrderItems` low (for example 256), and review the catalog and tiers. Check Overview shows the recipe graph is present and no loop.
2. `economy.market` on: the screen and the read routes work, orders still answer `disabled` for the direction flags. Check `/market` in the game and `/minecraft/market` on the site agree.
3. `economy.market.sell` on: players can sell. Watch Overview (minted today, capped orders, flooded items) for a day. Raise `mintCapPercent` and `maxOrderItems` only when it is calm.
4. `economy.market.buy` on: players can buy. Watch the burn and the stocks.
5. To stop: switch the direction flags off first (orders answer `disabled`), the Market flag last. Prefer a quiet moment, so no sale is in escrow (5.3).

### 13.3 What to watch

The admin's Overview shows minted and burned over 30 days, the mint budget used, orders in the last 24 hours and how many were capped, items flooded (stock at 3 times its target or more) and scarce (half or less), and the recipe list's age. Settings › Activity lists every change.

## 14. Manual QA checklist

On a real server against a site with the flags on, with two test players (one linked and eligible, one banned) and a shared account:

- [ ] Start with the Market off: `/market` says closed, nothing crashes, the SSE connects.
- [ ] Turn `economy.market` on: the screen opens with prices; sell and buy are refused for the direction flags still off.
- [ ] Turn `economy.market.sell` on: sell 1 item, 64 items, a full inventory (2,304). The payout matches the preview within a cent, the balance changes by `account.balance`, the stock on the screen moves, and the site's `/minecraft/market` shows the new price.
- [ ] A sale crossing `q1` (set a low `q1` in Settings): the average price shows the split and the player's meter moves to 50 %.
- [ ] A sale in the tail bracket pays at the tail rate (5 % by default).
- [ ] A sale with a damaged tool, a renamed item, an enchanted book and an item inside a shulker box is refused by the mod without calling the site.
- [ ] `priceChanged`: change the stock from the admin between preview and click (reset stock). The new total is shown and the player can confirm again; the items were returned in between.
- [ ] `zeroPayout`: sell one item whose payout rounds to 0 cents; the items come back.
- [ ] Mint cap: set `mintCapPercent` very low. A sale is `capped` (partial payout) then refused; the message is shown.
- [ ] Timeout in the middle of a sale (block the network for 20 s after sending): the items stay in escrow, then the retry succeeds with `replayed: true` or the first answer; the player is paid once.
- [ ] Restart the Minecraft server in the middle of a sale: on start the pending order replays and settles, the items are not duplicated nor lost.
- [ ] Turn `economy.market.buy` on: buy 1, 64, 2,304. The mailbox item is claimed at once; with a nearly full inventory, a partial claim hands over what fits and the rest is in the mailbox; claim it later.
- [ ] Crash the server right after a purchase answered (before the claim): after restart, the items are claimed once, not twice.
- [ ] Purchase from a shared account (`account: "#handle"`): the balance of that account drops; a player who is only a viewer is refused `notAllowed`.
- [ ] Insufficient funds: a purchase above the balance is refused with the right message, nothing moves.
- [ ] A banned or frozen player is refused `frozen`; a sale gives the items back.
- [ ] Turn a flag off while the screen is open: the screen reacts (on the next event or timer), and orders answer `disabled`.
- [ ] Change an item's price in the admin: the mod's screen updates within seconds (`market-config`).
- [ ] An item turned off in the admin disappears from the screen.
- [ ] The recipe graph: restart the server, then check the admin's recipe count; reload a data pack and see it change. Add a recipe that makes a sellable item from cheap purchasable items: the site logs a loop problem in the answer of `PUT /recipes`, and the mod logs it.
- [ ] Cents: `/pay 0.01`, `/pay 12,5`, `/pay 12.345` (refused), the balance display, a shop price with 2 decimals.
- [ ] Both languages: every problem message appears in English and French.

## 15. Done when

- Every money field of the old routes goes through `X-Economy-Units: cents`, and no `Double` carries an amount.
- Amounts display and parse as in 2.3 and 2.4, in every screen.
- The vectors of section 8 pass in a unit test of the pricing code (sales, purchases, drift, `k = 1`, the `sMax` and `sMin` cases).
- A sale, a purchase, a refusal, a `priceChanged`, a `capped` sale, a timeout with replay, a partial claim and a restart in the middle of a sale each behave as in sections 9 and 10, checked on a real server against a site with the three flags on.
- The recipe graph is sent at start and on a data-pack reload, and a validator problem shows up in the log.
- The SSE events refresh the screen (`market` and `market-config`), and a flag turned off is handled.
- The QA checklist (section 14) is fully ticked.

## 16. Open points

For the site owner to decide. The mod does not wait for them unless said so.

1. **Retries while the Market is off** (decided): the site answers a stored order with the same key whatever the flags (5.3). The mod keeps retrying the same key and gets the first answer; admins need no precaution.
2. **Quantity above `maxOrderItems`** (decided): a 400 with `data.problem` `tooManyItems`. The mod still reads the limit from `/state` and avoids it.
3. **Colour convention** of the price badge (decided): green when the price is above `p0`, red when below, neutral near 0, with the arrow and sign kept. The website does this; the mod follows.
4. **Numeric tuning** was simulated for about 9 active players and 105,000 LNBits in circulation (`docs/market.md`, "Tuning"), and must be revisited as the economy grows: the starting catalog, the tiers' thresholds (`q1`, `q2`, rates), the spread, the mint budget percentage and the items per order. The mod reads them from `/state`, so they don't change the mod.
5. **Price history in the game** (decided: yes). The in-game screen shows price history. Use the public `GET /api/market/items/:id/history?period=24h|7d|30d|1y` (no auth, answers 503 when the Market is off); the server routes have no history of their own.
6. **Notifications** (decided: no). The mod does not tell a player that their 24-hour window recovered.
7. **The Prism wrapper** and the other launcher files are outside this document (`docs/modpack.md`).
