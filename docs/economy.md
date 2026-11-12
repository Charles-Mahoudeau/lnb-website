# Economy

The Minecraft economy runs on the site: every balance, every account and every movement of money lives here, and the LNB Minecraft server only asks. This page is the contract between the site and the economy mod (`lnb-economy`, Kotlin for Forge): the model, the rules and every route under `/api/economy`.

The currency is the **LNBit**: whole numbers, no decimals.

## Accounts

- Every LNB account with a Minecraft account linked through Warden (so, for now, Epitech students: see `docs/warden.md`) gets one **personal account**, opened on first need: the first look-up by the server, or the first visit to `/minecraft/bank`. The starting balance (0 by default, set in the admin) is minted on it.
- Money belongs to the LNB account, not to a Minecraft account: two linked Minecraft accounts share the same money, and unlinking one changes nothing.
- **Shared accounts** are for a team, a shop or a casino. Each has a name and a unique **handle**: 3 to 24 lower-case letters, digits or dashes, always written with a `#` (`#casino-royal`). `server`, `lnb`, `admin`, `staff`, `bank` and `system` are reserved. A handle never changes and stays taken after its account is closed, so nobody can pose as a closed casino.
- A shared account has a **type**: `team` (the default), `shop` or `casino`. Personal accounts have none (`type: null`). Owners switch between `team` and `shop` freely. `casino` needs a **casino licence** (see below), and a casino stays a casino: its type can't change any more. Admins set any type without a licence, to tag the casinos that were there before.
- Roles in a shared account: **owner** (renames, invites, changes roles, removes members, closes the account, spends), **member** (spends, reads the history) and **viewer** (reads the history). An account always keeps at least one owner. A player owns 3 shared accounts at most and an account has 20 members at most, pending invitations included; both limits are set in the admin.
- Players join a shared account by **invitation**, sent by an owner to a linked Minecraft username and accepted on the site or in the game. Usernames are case-sensitive, as on the server.
- A shared account can only be closed once its balance is 0.
- Each player has a **default account**, the one that pays when they name none (`/pay`, shops). It is stored on the site, so it's the same on all their Minecraft accounts. When they can no longer spend from it (removed, viewer, frozen, closed), the personal account pays instead.
- Casinos are shared accounts of type `casino`, run by players. The server credits them for bets and pays winnings from them.
- **Casino licences.** A player buys a licence in the game, for `casinoLicensePrice` (100,000 by default, set in the admin), which is burned. The licence belongs to the LNB account and is **free** until it is used: making a shared account a casino, when opening it or later, binds one of the owner's free licences to it, for good. Closing the casino doesn't free its licence.

## The ledger

- Money only moves through **transactions**, each made of **entries** that add up to zero. An entry without an account is LNB itself: a negative one creates money (**mint**), a positive one destroys it (**burn**). Nothing else creates or destroys money.
- A balance never goes below zero. Every balance is cached on its account and written in the same database transaction as the entries, with the accounts locked in ID order, so two transfers at once can't overspend or deadlock.
- Nothing is ever updated or deleted. A mistake is undone by a **reversal**: a new transaction with the opposite entries. A transaction can be reversed once, a reversal can't be reversed, and a reversal is refused when an account no longer holds the money.
- Kinds: `payment` (between players), `casino` (bets and payouts), `shop` (orders at a player shop), `trade` (the money part of a trade), `auction` (a sale at the auction house), `mint`, `burn` and `reversal`. Mint and burn carry a reason: `startingBalance`, `adjustment` (an admin, with a message), `accountClosed`, `mobDrop` (a mint: what the mobs a player killed dropped) or `casinoLicense` (a burn: the price of a licence). An auction sale that burns a tax carries the reason `auctionTax`, counted with the burns.
- **Frozen accounts** take and give nothing. An account is frozen when an admin freezes it, or when its owner has a site or Warden ban in force. Admin adjustments and reversals still work on frozen accounts.
- When an LNB account is deleted (by an admin, or after 24 months without sign-in), its personal account is emptied (the money is burned with the reason `accountClosed`), closed and anonymized: its entries stay, without a link to the person. A shared account left without an owner passes to its oldest member, or is emptied and closed when nobody is left. This runs right after the deletion, and every night in case an account went another way.

## Authentication

| Caller           | How                                                               |
| ---------------- | ----------------------------------------------------------------- |
| Minecraft server | `Authorization: Bearer <WARDEN_SERVER_SECRET>`, as for Warden     |
| Player           | The site session cookie                                           |
| Admin            | The site session cookie, with the `admin` or `economy-admin` role |

Only the server moves money. The economy mod on a player's computer never calls the site: it asks the server, which is trusted. Players can't pay from the site.

## Conventions

- Bodies and responses are JSON. Their Zod schemas are in `shared/schemas/economy.ts`, and the full reference for every route is at `/api/docs`.
- An account in a request is its ID or, for a shared account, its handle (a leading `#` is accepted).
- Amounts are positive whole numbers, at most 10^12.
- Errors have an HTTP status and a `data.problem` code, listed with each route.
- Lists take `cursor` and return `{ items, nextCursor }`, with `nextCursor` null on the last page.

## Minecraft server routes

Under `/api/economy/server`, behind the `economy.serverApi` flag, limited to 3000 calls a minute (`economy-server`).

| Route                                                   | What it does                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /players/:uuid`                                    | The player's accounts (personal first, each with its `type`), the account that pays by default, `casinoLicenses: { total, free }` and `casinoLicensePrice`. Opens the personal account if needed. For the balance in the inventory and "My accounts". |
| `PUT /players/:uuid/default-account`                    | `{ "account": "<id or handle>" }`, or `null` for the personal account. The player must be able to spend from it.                                                                                                                                      |
| `GET /accounts/:handle`                                 | A shared account: ID, name, type, balance and whether it's frozen. For `/pay #handle` and casino machines.                                                                                                                                            |
| `POST /accounts`, `PATCH /accounts/:handle`             | Opens a shared account from the game, or renames it and changes its type. Behind the `economy.sharedAccounts` flag too. See below.                                                                                                                    |
| `GET /accounts/:handle/members`                         | The members of a shared account, and for owners the invitations waiting. Behind `economy.sharedAccounts` too.                                                                                                                                         |
| `POST /accounts/:handle/invitations`, `DELETE …/:id`    | Invites a player, or cancels an invitation. Behind `economy.sharedAccounts` too.                                                                                                                                                                      |
| `GET /players/:uuid/invitations`                        | The invitations waiting for a player. Behind `economy.sharedAccounts` too.                                                                                                                                                                            |
| `POST /invitations/:id/accept`, `…/decline`             | Answers an invitation from the game. Behind `economy.sharedAccounts` too.                                                                                                                                                                             |
| `POST /licenses`                                        | Buys a casino licence. Behind the `economy.casinoLicenses` flag too. See below.                                                                                                                                                                       |
| `POST /mints`                                           | Mints what mobs dropped. Behind the `economy.mobDrops` flag too. See below.                                                                                                                                                                           |
| `POST /transfers`                                       | Moves money in one call, behind the `economy.transfers` flag too. See below.                                                                                                                                                                          |
| `POST /auctions`, `GET /auctions`                       | Lists one stack at the auction house; the listings up now. Behind the `economy.auctions` flag too. See below.                                                                                                                                         |
| `POST /auctions/:id/buy`                                | Buys a listing. Behind the `economy.auctions` flag too.                                                                                                                                                                                               |
| `POST /auctions/:id/cancel`                             | Its seller takes a listing back. Not behind `economy.auctions`.                                                                                                                                                                                       |
| `GET /players/:uuid/listings`                           | A player's listings up now, with the limits for new ones.                                                                                                                                                                                             |
| `GET /players/:uuid/mailbox`, `POST /mailbox/:id/claim` | The items waiting for a player, and claiming one to hand it over. Not behind `economy.auctions`.                                                                                                                                                      |
| `GET /players/:uuid/sales`, `POST …/sales/seen`         | A player's sales they weren't told about yet, and marking them told. Not behind `economy.auctions`. See below.                                                                                                                                        |
| `POST /trades`                                          | The money part of a trade, in one call. Behind the `economy.trades` flag too. See below.                                                                                                                                                              |
| `POST /shops`, `PUT /shops/:id`                         | Registers a shop, or saves its settings again. Behind the `economy.shops` flag too. See below.                                                                                                                                                        |
| `GET /shops/:id`                                        | A shop: its account, item, prices and place, and whether it's off.                                                                                                                                                                                    |
| `POST /shops/:id/disable`                               | Closes a shop whose block was broken. Not behind `economy.shops`, so a broken shop always stops selling.                                                                                                                                              |
| `POST /shops/:id/orders`                                | Buys lots from a shop, or sells them back to it. Behind the `economy.shops` flag too. See below.                                                                                                                                                      |

### Transfers

```json
{
  "idempotencyKey": "7b0f4a3e-6d1c-4b8e-9f2a-1c3d5e7f9a0b",
  "from": { "player": "<uuid>", "account": "casino-royal" },
  "to": { "player": "<uuid>" },
  "amount": 250,
  "kind": "payment",
  "memo": "for the diamonds"
}
```

- `from.player` is the player who pays. Without `from.account`, their default account pays; with it, they must be its owner or a member. A banned player can't pay from any account.
- `from.account` alone (no player) pays only for `kind: "casino"`: a casino machine paying out from its own account.
- `to` is a player (their personal account) or an account, not both.
- `memo` is optional, up to 140 characters, and shown to both sides.
- `idempotencyKey` is a UUID the server makes for each move. Sending the same request again (after a timeout, say) returns the first result with `replayed: true` and moves nothing. The same key with a different request is a 409 `idempotencyMismatch`.
- The answer is `{ transactionId, replayed, amount, from: { accountId, handle, balance }, to: { … } }`, with each balance right after the transfer.
- Problems: `notLinked` (404), `notFound` (404), `notEligible` (403), `notAllowed` (403), `insufficientFunds`, `frozen`, `closed`, `sameAccount`, `idempotencyMismatch` (409).

### Shared accounts from the game

The game does what `/minecraft/bank` does, for the player the server names: `player` is always the acting player's Minecraft UUID, the site finds their LNB account and applies the rules of the player routes (limits, roles, handles). One difference: in the game an account is no secret, so a player outside it is told `notAllowed` (403), not `notFound`. Strings are never null in these answers: a username nobody can name any more is `""`.

| Route                                                              | Body or query                                                | Answer                                                                                                                                                                                                                                          | Problems                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /accounts`                                                   | `{ player, handle, name, type? }`                            | 201, the account as in `accounts[]`, with the role `owner`                                                                                                                                                                                      | `notLinked` (404), `notEligible` (403), `noLicense` (403), `handleTaken`, `handleReserved`, `tooManyAccounts` (409). A malformed handle or name is a plain 400.                               |
| `PATCH /accounts/:handle`                                          | `{ player, name?, type? }`, at least one                     | The account. Owners only.                                                                                                                                                                                                                       | `notLinked`, `notFound` (404), `notAllowed`, `noLicense` (403), `typeLocked` (409)                                                                                                            |
| `GET /accounts/:handle/members?player=<uuid>`                      |                                                              | `{ account, members: [{ userId, username, role }], invitations: [{ id, username, createdAt }] }`. `username` is the first Minecraft account the member linked. `invitations` is for owners, empty for the others. Members and viewers may read. | `notLinked`, `notFound` (404), `notAllowed` (403)                                                                                                                                             |
| `POST /accounts/:handle/invitations`                               | `{ player, username, role? }`, `role` is `member` without it | 201, `{ id, username, account: { id, handle, name, type }, role, invitedBy, inviteeUuids }`: `invitedBy` is the inviter's Minecraft username, `inviteeUuids` every Minecraft account linked to the invited LNB account. Owners only.            | `notLinked`, `notFound`, `playerNotFound` (404), `notAllowed` (403), `notEligible` (409, the invited player can't have an account), `alreadyMember`, `alreadyInvited`, `tooManyMembers` (409) |
| `DELETE /accounts/:handle/invitations/:invitationId?player=<uuid>` |                                                              | 204. Owners only.                                                                                                                                                                                                                               | `notLinked`, `notFound` (404), `notAllowed` (403)                                                                                                                                             |
| `GET /players/:uuid/invitations`                                   |                                                              | `{ items: [{ id, account: { id, handle, name, type }, role, invitedBy, createdAt }] }`, oldest first                                                                                                                                            | `notLinked` (404)                                                                                                                                                                             |
| `POST /invitations/:invitationId/accept`                           | `{ player }`                                                 | The account, with the player's new role                                                                                                                                                                                                         | `notLinked`, `notFound` (404), `notEligible` (403), `tooManyMembers` (409)                                                                                                                    |
| `POST /invitations/:invitationId/decline`                          | `{ player }`                                                 | 204                                                                                                                                                                                                                                             | `notLinked`, `notFound` (404)                                                                                                                                                                 |

Every one of them also answers `disabled` (503) while `economy.serverApi` or `economy.sharedAccounts` is off. An invitation that isn't the player's is `notFound`.

### Casino licences

`POST /licenses` takes `{ idempotencyKey, player, account? }`: the player buys one licence. `account` pays, or their default account; they must be able to spend from it. The price is burned in one `burn` transaction with the reason `casinoLicense` and the memo `Casino licence`.

- The answer is `{ transactionId, replayed, amount, from: { accountId, handle, balance }, licenses: { total, free } }`. With a price of 0 the licence is given with no transaction: `transactionId` is `null`, `amount` is 0.
- It is idempotent like a transfer: the same key gives the first result with `replayed: true`, and the same key on another request is `idempotencyMismatch`.
- Problems: `notLinked`, `notFound` (404), `notEligible`, `notAllowed` (403), `insufficientFunds`, `frozen`, `idempotencyMismatch` (409), `disabled` (503).
- The `economy.casinoLicenses` flag only stops purchases: licences already bought still make casinos.

### Mob drops

`POST /mints` takes `{ idempotencyKey, player, amount, reason: "mobDrop" }`, with an amount from 1 to 100,000, and mints it on the player's **personal** account, whichever account pays by default: one `mint` transaction with the reason `mobDrop`. The server batches drops and calls once per player every so often, not once per mob.

- The answer is `{ transactionId, replayed, amount, to: { accountId, handle: null, balance } }`. It is idempotent like a transfer.
- Problems: `notLinked` (404), `notEligible` (403), `frozen` (409, the account is frozen or the player banned), `idempotencyMismatch` (409), `disabled` (503).

### Trades

Two players swap items in the game, with money on either side or both. The server takes both sides' items aside (escrow) before it calls the site, so the swap can't fail once the money moved: on success each player gets the other's items, on a refusal each gets their own back. There is never a transfer to undo.

```json
{
  "idempotencyKey": "<uuid>",
  "from": { "player": "<uuid>", "account": "diamond-corner" },
  "to": { "player": "<uuid>" },
  "amount": 70,
  "memo": "Trade with LnbTester"
}
```

- Each player trades with one account, their default one unless they pick another they own or are a member of. `from` is the player who gave more money, and `amount` what they gave minus what the other gave: a trade is one `trade` transaction between those two accounts. Equal amounts move nothing, and the server doesn't call the site.
- Two Minecraft accounts of the same person can't trade money (`sameAccount`), and a banned player can't trade (`frozen`).
- The answer and the problems are a transfer's.

### Shops

A shop is a block in the game that sells one item, in lots of 1 to 99, for an account its owner chooses (personal or shared), and may buy the same item back. There are no server shops: every shop belongs to players, so shops never create money.

```json
{
  "player": "<uuid>",
  "account": "diamond-corner",
  "item": {
    "id": "minecraft:diamond",
    "snbt": "{id:\"minecraft:diamond\",count:16}",
    "name": "Diamond"
  },
  "lotSize": 16,
  "sellPrice": 40,
  "buyPrice": 25,
  "position": { "world": "minecraft:overworld", "x": 10, "y": 64, "z": -3 }
}
```

- The player who saves a shop must be an owner or a member of its account, and of the new account when it changes. The item's SNBT is kept as the game saved it and never read; its name is shown in the history and the admin.
- `sellPrice` is what a buyer pays for one lot. `buyPrice`, optional, is what the shop pays for a lot it buys back, at most `sellPrice`, so nobody can buy and sell back at a profit.
- A shop is never deleted. Breaking its block turns it off (`removed`); saving it again turns it back on. A shop an admin turned off (`admin`) answers `shopDisabled` until an admin turns it back on.
- An order is `{ idempotencyKey, player, account?, direction, lots, expectedLotPrice }`. The site prices it from the saved prices: the server never sends an amount, and `expectedLotPrice` must be the price the player saw, or the answer is `priceChanged` (409).
  - `buy`: the player pays from `account`, or their default account, to the shop's account.
  - `sell`: the shop's account pays the player, into `account` or their personal account. The shop pays with no owner around, only at its `buyPrice` (`noBuyBack` without one) and only while it's on.
- Each order is a `shop` transaction, with the number of items and their name as the memo (`32 × Diamond`), and a line in `economy_shop_order`. The answer is a transfer's, plus `shopId`, `direction`, `lots` and `lotPrice`.
- The server holds the items aside (escrow) until the site answers, and gives them back if it refuses. Shops pay no tax.
- Problems: those of transfers, plus `shopDisabled`, `noBuyBack` and `priceChanged` (409).

### Auction house

Players list one stack (1 to 99 identical items, sold whole) at a fixed price. There are no bids. The item leaves the game when it's listed: the site keeps it as the game saved it (SNBT) and never reads it, so an item from a mod that's gone stays stored rather than lost.

- A listing is `{ idempotencyKey, player, account?, item: { id, snbt, name }, count, price }`, with a price from 1 to 10^9. The seller picks the account paid on a sale, one they can spend from (their default account otherwise). A retry with the same key gives back the same listing. A player has at most `auctionMaxListings` up at once (20 by default, `tooManyListings` beyond), and each stays up `auctionDays` (7 by default).
- Buying is one call and one `auction` transaction: the buyer pays the price, the seller's account gets it minus the tax, and the tax is burned (reason `auctionTax`). The tax is `auctionTaxPercent` of the price (5 by default), rounded down, so cheap sales may pay none. The item goes to the buyer's mailbox. Buying your own listing is `sameAccount`; a listing sold, taken back or expired is `listingGone`.
- **Mailbox.** Items waiting for a player: bought ones, and their own unsold ones (`cancelled` by them, `expired`, or `removed` by an admin). They belong to the LNB account, like money, so any of its Minecraft accounts collects them. The server claims an item with a key before handing it over: the same key gets it again (`replayed`), another finds it `alreadyClaimed`, so a crash between the claim and the hand-over never gives it twice, and the server retries with the same key.
- Expired listings end before anything reads listings or a mailbox, and every night (`economy:snapshot`).
- **Sale notices.** The answer of a purchase carries `sellerUserId`, the seller's LNB account, so the server tells them right away when they're online. A sold listing remembers whether its seller was told (`sellerNotifiedAt`): `GET /players/:uuid/sales` gives `{ items: [{ listingId, item: { id, name }, count, price, tax, buyer, soldAt }] }`, the player's sales not yet told, oldest first, 50 at most, with `buyer` the Minecraft username the buyer bought with (as `seller` on a listing). `POST /players/:uuid/sales/seen` with `{ listingIds }` (1 to 50) marks them told and answers 204; unknown IDs and other people's are ignored. Both answer `notLinked` (404).
- Taking a listing back, the mailbox, claiming and the sale notices work while `economy.auctions` is off, so nobody's items are stuck.

## Player routes

Under `/api/economy`, for signed-in players, behind the `economy` flag; creating, renaming and closing shared accounts, invitations and members also need `economy.sharedAccounts`, and the baltop `economy.baltop`.

| Route                                                        | What it does                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me`, `PATCH /me`                                       | Accounts, invitations, the default account, the baltop opt-out and rank, and the casino licences (`casinoLicenses: { total, free }`). `PATCH` sets `defaultAccountId` and `hideFromBaltop`. |
| `GET /baltop`                                                | The 50 richest players and the 20 richest shared accounts, and the caller's place.                                                                                                          |
| `POST /accounts`                                             | Opens a shared account, with the caller as owner. Takes an optional `type` (`noLicense`, 403, for a casino without a free licence).                                                         |
| `GET /accounts/:id`, `PATCH`, `DELETE`                       | An account with its members (owners also see pending invitations); renaming and changing the type (`name`, `type` or both; `noLicense`, 403, and `typeLocked`, 409); closing.               |
| `GET /accounts/:id/transactions`                             | The history, newest first, 50 per page. Viewers can read it.                                                                                                                                |
| `GET /accounts/:id/balance-history?period=7d\|30d\|90d\|all` | The balance at the end of each day (Paris time) with the money in and out that day, from the start of the period or the account's opening. Viewers can read it.                             |
| `POST /accounts/:id/invitations`, `DELETE …/:invitationId`   | Invites a linked Minecraft username, or cancels an invitation.                                                                                                                              |
| `PATCH /accounts/:id/members/:userId`, `DELETE`              | Changes a role, or removes a member (a member removes themselves to leave).                                                                                                                 |
| `POST /invitations/:id/accept`, `…/decline`                  | Answers an invitation.                                                                                                                                                                      |

## Admin routes

Under `/api/economy/admin`, for economy admins and site admins. Never behind a flag. Every change is written to `admin_audit` (`economy.*`) and shows on the Overview.

| Route                                                 | What it does                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /stats?period=7d\|30d\|90d\|all`                 | Money in circulation per day, minted and burned per day and by reason, volume by kind, active players, the distribution of wealth (top 10 % share, Gini, histogram) and the largest shared accounts.                                                                                                   |
| `GET /accounts`, `GET /accounts/:id`                  | Every account, richest first, with a search; one account with its members and its flows over 30 days.                                                                                                                                                                                                  |
| `PATCH /accounts/:id`                                 | `{ type }` sets a shared account's type, any of them and with no licence (`economy.accountType` in the audit log).                                                                                                                                                                                     |
| `GET /accounts/:id/transactions`                      | An account's history.                                                                                                                                                                                                                                                                                  |
| `GET /accounts/:id/balance-history`                   | The same balance history, for any account.                                                                                                                                                                                                                                                             |
| `POST /accounts/:id/adjustments`                      | Mints or burns, with a reason the members see.                                                                                                                                                                                                                                                         |
| `POST /accounts/:id/freeze`                           | Freezes (a reason is required) or unfreezes.                                                                                                                                                                                                                                                           |
| `GET /transactions`, `POST /transactions/:id/reverse` | The whole ledger with filters; reversing a transaction, with a reason.                                                                                                                                                                                                                                 |
| `GET /shops`, `PATCH /shops/:id`                      | Every shop, newest first, with a search, its orders and the LNBits they moved; turning a shop off or back on. A shop whose block was broken stays off until its owner places it again.                                                                                                                 |
| `GET /listings`, `POST /listings/:id/remove`          | Every auction house listing, newest first, with a search; taking one down, with a reason (the item goes back to its seller's mailbox).                                                                                                                                                                 |
| `GET /settings`, `PATCH /settings`                    | The starting balance, the two limits, the auction house tax, listings per player and listing length, and `casinoLicensePrice` (0 to 10^12).                                                                                                                                                            |
| `GET /export`, `POST /reset`                          | Site admins only. The export lists every open account with its balance and members. The reset deletes every account, the ledger, the shops, the auction house, the casino licences and the stats (the settings stay) after typing `reset the economy`. There are no seasons: a reset is a fresh start. |

Closed days of the charts come from `economy_daily_stat`, written every night by the `economy:snapshot` task (Paris days), which also tidies up after deleted players. The current day is computed live.

## Pages

- `/minecraft/bank`: the player's accounts on the left, the chosen one on the right with its balance, its type as a badge, "Pays by default", its balance over time, and History, Members and Settings tabs. Owners pick the type when opening a shared account and in Settings; `casino` is only offered with a free licence. Players without a linked Minecraft account are sent to Warden.
- `/minecraft/baltop`: the top three in a band, then players and shared accounts side by side. Players show as first name and initial (as in-game), then their username; those who hid their name in Warden show their username alone. Players can leave the ranking; shared accounts can't.
- `/admin/economy`: Overview, Accounts (with each account's page, where the type is set), Ledger and Settings.
