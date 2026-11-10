# Economy

The Minecraft economy runs on the site: every balance, every account and every movement of money lives here, and the LNB Minecraft server only asks. This page is the contract between the site and the economy mod (`lnb-economy`, Kotlin for Forge): the model, the rules and every route under `/api/economy`.

The currency is the **LNBit**: whole numbers, no decimals.

## Accounts

- Every LNB account with a Minecraft account linked through Warden (so, for now, Epitech students: see `docs/warden.md`) gets one **personal account**, opened on first need: the first look-up by the server, or the first visit to `/minecraft/bank`. The starting balance (0 by default, set in the admin) is minted on it.
- Money belongs to the LNB account, not to a Minecraft account: two linked Minecraft accounts share the same money, and unlinking one changes nothing.
- **Shared accounts** are for a team, a shop or a casino. Each has a name and a unique **handle**: 3 to 24 lower-case letters, digits or dashes, always written with a `#` (`#casino-royal`). `server`, `lnb`, `admin`, `staff`, `bank` and `system` are reserved. A handle never changes and stays taken after its account is closed, so nobody can pose as a closed casino.
- Roles in a shared account: **owner** (renames, invites, changes roles, removes members, closes the account, spends), **member** (spends, reads the history) and **viewer** (reads the history). An account always keeps at least one owner. A player owns 3 shared accounts at most and an account has 20 members at most, pending invitations included; both limits are set in the admin.
- Players join a shared account by **invitation**, sent by an owner to a linked Minecraft username and accepted on the site. Usernames are case-sensitive, as on the server.
- A shared account can only be closed once its balance is 0.
- Each player has a **default account**, the one that pays when they name none (`/pay`, shops). It is stored on the site, so it's the same on all their Minecraft accounts. When they can no longer spend from it (removed, viewer, frozen, closed), the personal account pays instead.
- Casinos are ordinary shared accounts, run by players. The server credits them for bets and pays winnings from them.

## The ledger

- Money only moves through **transactions**, each made of **entries** that add up to zero. An entry without an account is LNB itself: a negative one creates money (**mint**), a positive one destroys it (**burn**). Nothing else creates or destroys money.
- A balance never goes below zero. Every balance is cached on its account and written in the same database transaction as the entries, with the accounts locked in ID order, so two transfers at once can't overspend or deadlock.
- Nothing is ever updated or deleted. A mistake is undone by a **reversal**: a new transaction with the opposite entries. A transaction can be reversed once, a reversal can't be reversed, and a reversal is refused when an account no longer holds the money.
- Kinds: `payment` (between players), `casino` (bets and payouts), `mint`, `burn` and `reversal`. Mint and burn carry a reason: `startingBalance`, `adjustment` (an admin, with a message) or `accountClosed`.
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

| Route                                | What it does                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /players/:uuid`                 | The player's accounts (personal first) and the account that pays by default. Opens the personal account if needed. For the balance in the inventory and "My accounts". |
| `PUT /players/:uuid/default-account` | `{ "account": "<id or handle>" }`, or `null` for the personal account. The player must be able to spend from it.                                                       |
| `GET /accounts/:handle`              | A shared account: ID, name, balance and whether it's frozen. For `/pay #handle` and casino machines.                                                                   |
| `POST /transfers`                    | Moves money in one call, behind the `economy.transfers` flag too. See below.                                                                                           |

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

## Player routes

Under `/api/economy`, for signed-in players, behind the `economy` flag; creating, renaming and closing shared accounts, invitations and members also need `economy.sharedAccounts`, and the baltop `economy.baltop`.

| Route                                                      | What it does                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /me`, `PATCH /me`                                     | Accounts, invitations, the default account, the baltop opt-out and rank. `PATCH` sets `defaultAccountId` and `hideFromBaltop`. |
| `GET /baltop`                                              | The 50 richest players and the 20 richest shared accounts, and the caller's place.                                             |
| `POST /accounts`                                           | Opens a shared account, with the caller as owner.                                                                              |
| `GET /accounts/:id`, `PATCH`, `DELETE`                     | An account with its members (owners also see pending invitations); renaming; closing.                                          |
| `GET /accounts/:id/transactions`                           | The history, newest first, 50 per page. Viewers can read it.                                                                   |
| `POST /accounts/:id/invitations`, `DELETE …/:invitationId` | Invites a linked Minecraft username, or cancels an invitation.                                                                 |
| `PATCH /accounts/:id/members/:userId`, `DELETE`            | Changes a role, or removes a member (a member removes themselves to leave).                                                    |
| `POST /invitations/:id/accept`, `…/decline`                | Answers an invitation.                                                                                                         |

## Admin routes

Under `/api/economy/admin`, for economy admins and site admins. Never behind a flag. Every change is written to `admin_audit` (`economy.*`) and shows on the Overview.

| Route                                                 | What it does                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /stats?period=7d\|30d\|90d\|all`                 | Money in circulation per day, minted and burned per day and by reason, volume by kind, active players, the distribution of wealth (top 10 % share, Gini, histogram) and the largest shared accounts.                                                |
| `GET /accounts`, `GET /accounts/:id`                  | Every account, richest first, with a search; one account with its members and its flows over 30 days.                                                                                                                                               |
| `GET /accounts/:id/transactions`                      | An account's history.                                                                                                                                                                                                                               |
| `POST /accounts/:id/adjustments`                      | Mints or burns, with a reason the members see.                                                                                                                                                                                                      |
| `POST /accounts/:id/freeze`                           | Freezes (a reason is required) or unfreezes.                                                                                                                                                                                                        |
| `GET /transactions`, `POST /transactions/:id/reverse` | The whole ledger with filters; reversing a transaction, with a reason.                                                                                                                                                                              |
| `GET /settings`, `PATCH /settings`                    | The starting balance and the two limits.                                                                                                                                                                                                            |
| `GET /export`, `POST /reset`                          | Site admins only. The export lists every open account with its balance and members. The reset deletes every account, the ledger and the stats (the settings stay) after typing `reset the economy`. There are no seasons: a reset is a fresh start. |

Closed days of the charts come from `economy_daily_stat`, written every night by the `economy:snapshot` task (Paris days), which also tidies up after deleted players. The current day is computed live.

## Pages

- `/minecraft/bank`: the player's accounts on the left, the chosen one on the right with its balance, "Pays by default", and History, Members and Settings tabs. Players without a linked Minecraft account are sent to Warden.
- `/minecraft/baltop`: the top three in a band, then players and shared accounts side by side. Players show as first name and initial (as in-game), then their username; those who hid their name in Warden show their username alone. Players can leave the ranking; shared accounts can't.
- `/admin/economy`: Overview, Accounts (with each account's page), Ledger and Settings.

## Not built yet

These hang on the same ledger and come next, with their own routes: the auction house (listings and items stored on the site, a mailbox for items, a sale tax that is burned), trades (the money part in one call, with a reversal if the item swap fails), and player shops (registered on the site, selling and optionally buying items at a fixed price).
