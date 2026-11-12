import { z } from 'zod';

import { minecraftUsername, minecraftUuid } from './warden.ts';

// Economy contracts, shared by the routes and the pages. See docs/economy.md.
// Responses are schemas too, so the API reference is built from the same definitions as the types.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const ECONOMY_PROBLEMS = [
  'notFound',
  'notEligible',
  'notLinked',
  'playerNotFound',
  'insufficientFunds',
  'frozen',
  'closed',
  'notAllowed',
  'sameAccount',
  'handleTaken',
  'noLicense',
  'typeLocked',
  'tooManyAccounts',
  'tooManyMembers',
  'alreadyMember',
  'alreadyInvited',
  'lastOwner',
  'balanceNotZero',
  'personalAccount',
  'alreadyReversed',
  'notReversible',
  'idempotencyMismatch',
  'invalidCursor',
  'confirmMismatch',
  'shopDisabled',
  'priceChanged',
  'noBuyBack',
  'tooManyListings',
  'listingGone',
  'alreadyClaimed',
] as const;
export type EconomyProblem = (typeof ECONOMY_PROBLEMS)[number];

/** The largest amount one transaction moves: far above any real need, far below 2^53. */
export const ECONOMY_MAX_AMOUNT = 1_000_000_000_000;

export const economyAmount = z
  .int()
  .positive()
  .max(ECONOMY_MAX_AMOUNT)
  .describe('Whole LNBits. There are no decimals.');

/** Handles nobody can take, so no player account can pass for the staff or the site. */
export const RESERVED_HANDLES = ['server', 'lnb', 'admin', 'staff', 'bank', 'system'] as const;

/** A shared account's handle, without its `#`: 3 to 24 lower-case letters, digits and dashes. */
export const economyHandle = z
  .string()
  .trim()
  .transform((handle) => handle.replace(/^#/, '').toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z\d](?:[a-z\d-]{1,22})[a-z\d]$/)
      .refine((handle) => !(RESERVED_HANDLES as readonly string[]).includes(handle), {
        message: 'reserved',
      }),
  )
  .describe('Lower case, without the `#`. A leading `#` is removed.');

/** What a shared account is for. `casino` needs a casino licence, and never changes again. */
export const ECONOMY_ACCOUNT_TYPES = ['team', 'shop', 'casino'] as const;
export const economyAccountType = z.enum(ECONOMY_ACCOUNT_TYPES);
export type EconomyAccountType = z.infer<typeof economyAccountType>;

export const economyAccountName = z.string().trim().min(1).max(32);
export const economyMemo = z.string().trim().min(1).max(140);
export const economyRole = z.enum(['owner', 'member', 'viewer']);
export type EconomyRole = z.infer<typeof economyRole>;

export const ECONOMY_TRANSACTION_KINDS = [
  'payment',
  'casino',
  'shop',
  'trade',
  'auction',
  'mint',
  'burn',
  'reversal',
] as const;
export const economyTransactionKind = z.enum(ECONOMY_TRANSACTION_KINDS);
export type EconomyTransactionKind = z.infer<typeof economyTransactionKind>;
/** Kinds that move money between players, counted as volume. Mint, burn and reversals aren't. */
export const ECONOMY_VOLUME_KINDS = ['payment', 'casino', 'shop', 'trade', 'auction'] as const;

export const economyReason = z.enum([
  'startingBalance',
  'adjustment',
  'accountClosed',
  'auctionTax',
  'casinoLicense',
  'mobDrop',
]);
export type EconomyReason = z.infer<typeof economyReason>;

/** An account in a request: its ID, or a shared account's handle (with or without `#`). */
export const economyAccountRef = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe("The account's ID, or a shared account's handle.");

export const economyAccountParams = z.object({ accountId: z.uuid() });
export const economyMemberParams = z.object({
  accountId: z.uuid(),
  userId: z.string().min(1).max(64),
});
export const economyInvitationParams = z.object({ invitationId: z.uuid() });
export const economyAccountInvitationParams = z.object({
  accountId: z.uuid(),
  invitationId: z.uuid(),
});
export const economyTransactionParams = z.object({
  transactionId: z.coerce.number().int().positive(),
});
export const economyHandleParams = z.object({ handle: economyHandle });
export const economyUuidParams = z.object({ uuid: minecraftUuid });

export const economyCursorQuery = z.object({
  cursor: z.string().max(40).optional().describe('`nextCursor` from the previous page.'),
});

function page<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().describe('Null on the last page.'),
  });
}

// ---- Accounts, as their members see them -------------------------------------------------------

export const economyAccountView = z.object({
  id: z.uuid(),
  kind: z.enum(['personal', 'shared']),
  type: economyAccountType
    .nullable()
    .describe('What a shared account is for. Null for the personal account.'),
  handle: z.string().nullable().describe('Shared accounts only, without the `#`.'),
  name: z.string().nullable().describe('Shared accounts only.'),
  balance: z.number(),
  role: economyRole.describe('Always `owner` for the personal account.'),
  frozen: z
    .boolean()
    .describe('Frozen by an admin, or the owner is banned: no money goes in or out.'),
  memberCount: z.number(),
});
export type EconomyAccountView = z.infer<typeof economyAccountView>;

/** Who is on the other side of a transaction. */
export const economyCounterparty = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('player'),
    name: z.string().nullable().describe('First name and initial, or null when hidden.'),
    username: z.string().nullable().describe('The main Minecraft username.'),
  }),
  z.object({ type: z.literal('account'), handle: z.string(), name: z.string() }),
  z.object({ type: z.literal('lnb').describe('Money created or destroyed by LNB.') }),
  z.object({ type: z.literal('deleted').describe('An account that no longer exists.') }),
  z.object({ type: z.literal('several') }),
]);
export type EconomyCounterparty = z.infer<typeof economyCounterparty>;

/** A transaction, seen from one account. */
export const economyTransactionView = z.object({
  id: z.number(),
  at: isoDate,
  kind: economyTransactionKind,
  reason: economyReason.nullable(),
  memo: z.string().nullable(),
  amount: z.number().describe('For this account: positive in, negative out.'),
  balanceAfter: z.number(),
  counterparty: economyCounterparty,
  reversed: z.boolean(),
});
export type EconomyTransactionView = z.infer<typeof economyTransactionView>;
export const economyTransactionPage = page(economyTransactionView);
export type EconomyTransactionPage = z.infer<typeof economyTransactionPage>;

/** A player's casino licences. */
export const economyLicenseCount = z.object({
  total: z.number().describe('Every licence the player bought.'),
  free: z.number().describe('Those not yet used for a casino.'),
});
export type EconomyLicenseCount = z.infer<typeof economyLicenseCount>;

export const economyInvitationView = z.object({
  id: z.uuid(),
  account: z.object({ id: z.uuid(), handle: z.string(), name: z.string() }),
  role: economyRole,
  invitedBy: z.string().nullable().describe('First name and initial, or null.'),
  createdAt: isoDate,
});
export type EconomyInvitationView = z.infer<typeof economyInvitationView>;

/** GET /api/economy/me */
export const economyMe = z.object({
  eligible: z
    .boolean()
    .describe('Has a Minecraft account linked through Warden, from a school that can play.'),
  accounts: z.array(economyAccountView).describe('The personal account first.'),
  invitations: z.array(economyInvitationView),
  defaultAccountId: z.uuid().nullable(),
  hideFromBaltop: z.boolean(),
  rank: z.number().nullable().describe('Place on the baltop. Null when hidden or not eligible.'),
  ownedShared: z.number(),
  maxOwnedShared: z.number(),
  casinoLicenses: economyLicenseCount,
});
export type EconomyMe = z.infer<typeof economyMe>;

export const economyMemberView = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  uuid: z.string().nullable().describe('The main Minecraft account, for its head.'),
  username: z.string().nullable(),
  role: economyRole,
  joinedAt: isoDate,
});
export type EconomyMemberView = z.infer<typeof economyMemberView>;

export const economyPendingInvitation = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  uuid: z.string().nullable(),
  username: z.string().nullable(),
  role: economyRole,
  createdAt: isoDate,
});
export type EconomyPendingInvitation = z.infer<typeof economyPendingInvitation>;

/** GET /api/economy/accounts/:accountId */
export const economyAccountDetail = economyAccountView.extend({
  members: z.array(economyMemberView),
  invitations: z.array(economyPendingInvitation).describe('Owners only; empty for the others.'),
  maxMembers: z.number(),
});
export type EconomyAccountDetail = z.infer<typeof economyAccountDetail>;

/** POST /api/economy/accounts */
export const economyCreateBody = z.object({
  name: economyAccountName,
  handle: economyHandle,
  type: economyAccountType
    .optional()
    .describe("`team` without it. `casino` uses one of the caller's free casino licences."),
});
export type EconomyCreateBody = z.input<typeof economyCreateBody>;

/** PATCH /api/economy/accounts/:accountId */
export const economyAccountPatchBody = z
  .object({
    name: economyAccountName,
    type: economyAccountType.describe(
      "`casino` uses one of the caller's free casino licences, and never changes again.",
    ),
  })
  .partial()
  .refine((body) => body.name !== undefined || body.type !== undefined, {
    message: 'name or type',
  });
export type EconomyAccountPatchBody = z.infer<typeof economyAccountPatchBody>;

/** PATCH /api/economy/me */
export const economyMePatchBody = z
  .object({
    defaultAccountId: z.uuid().nullable().describe('Null pays with the personal account.'),
    hideFromBaltop: z.boolean(),
  })
  .partial();
export type EconomyMePatchBody = z.infer<typeof economyMePatchBody>;

/** POST /api/economy/accounts/:accountId/invitations */
export const economyInviteBody = z.object({
  username: minecraftUsername.describe('A linked Minecraft username.'),
  role: economyRole,
});
export type EconomyInviteBody = z.infer<typeof economyInviteBody>;

/** PATCH /api/economy/accounts/:accountId/members/:userId */
export const economyMemberRoleBody = z.object({ role: economyRole });

// ---- Baltop -----------------------------------------------------------------------------------

export const economyBaltop = z.object({
  players: z.array(
    z.object({
      rank: z.number(),
      name: z.string().nullable().describe('First name and initial, or null when hidden.'),
      uuid: z.string().nullable().describe('The main Minecraft account, for its head.'),
      username: z.string().nullable(),
      balance: z.number(),
      me: z.boolean(),
    }),
  ),
  shared: z.array(
    z.object({
      rank: z.number(),
      handle: z.string(),
      name: z.string(),
      balance: z.number(),
      memberCount: z.number(),
    }),
  ),
  me: z
    .object({ rank: z.number(), balance: z.number() })
    .nullable()
    .describe('Null when hidden or not eligible.'),
});
export type EconomyBaltop = z.infer<typeof economyBaltop>;

// ---- The Minecraft server ---------------------------------------------------------------------

/** GET /api/economy/server/players/:uuid */
export const economyServerPlayer = z.object({
  userId: z.string(),
  defaultAccountId: z.uuid().describe('The account that pays when none is named.'),
  accounts: z.array(economyAccountView).describe('The personal account first.'),
});
export type EconomyServerPlayer = z.infer<typeof economyServerPlayer>;

/** PUT /api/economy/server/players/:uuid/default-account */
export const economyServerDefaultBody = z.object({
  account: economyAccountRef.nullable().describe('Null pays with the personal account.'),
});

/** GET /api/economy/server/accounts/:handle */
export const economyServerAccount = z.object({
  id: z.uuid(),
  handle: z.string(),
  name: z.string(),
  type: economyAccountType,
  balance: z.number(),
  frozen: z.boolean(),
});
export type EconomyServerAccount = z.infer<typeof economyServerAccount>;

/** POST /api/economy/server/transfers */
export const economyTransferBody = z
  .object({
    idempotencyKey: z
      .uuid()
      .describe(
        'Made by the server for each move. Sending it again returns the first result instead of paying twice.',
      ),
    from: z
      .object({
        player: minecraftUuid
          .optional()
          .describe('The player who pays. The site checks they may spend from the account.'),
        account: economyAccountRef
          .optional()
          .describe("Without it, the player's default account pays."),
      })
      .refine((from) => from.player ?? from.account, { message: 'player or account' })
      .describe(
        'A player, with or without an account, or an account alone. An account alone pays only for `casino` (a payout).',
      ),
    to: z
      .object({
        player: minecraftUuid.optional().describe("Credits the player's personal account."),
        account: economyAccountRef.optional(),
      })
      .refine((to) => Boolean(to.player) !== Boolean(to.account), {
        message: 'player or account',
      })
      .describe('A player or an account, not both.'),
    amount: economyAmount,
    kind: z.enum(['payment', 'casino']).default('payment'),
    memo: economyMemo.optional().describe("The player's message, shown to both sides."),
  })
  .refine((body) => body.from.player ?? body.kind === 'casino', {
    path: ['from'],
    message: 'only a casino pays without a player',
  });
export type EconomyTransferBody = z.input<typeof economyTransferBody>;

const transferSide = z.object({
  accountId: z.uuid(),
  handle: z.string().nullable(),
  balance: z.number().describe('Right after this transfer.'),
});

export const economyTransferResult = z.object({
  transactionId: z.number(),
  replayed: z.boolean().describe('True when the key had already been used: nothing moved again.'),
  amount: z.number(),
  from: transferSide,
  to: transferSide,
});
export type EconomyTransferResult = z.infer<typeof economyTransferResult>;

// Trades: two players swap items in the game, with money on either side or both.

const tradeSide = z.object({
  player: minecraftUuid,
  account: economyAccountRef
    .optional()
    .describe(
      "The account this player trades with: it pays when they give more money, and is paid when they give less. The player's default account without it.",
    ),
});

export const economyTradeBody = z
  .object({
    idempotencyKey: z.uuid(),
    from: tradeSide.describe('The player who gives more money.'),
    to: tradeSide.describe('The other player.'),
    amount: economyAmount.describe('What `from` gave minus what `to` gave.'),
    memo: economyMemo.optional(),
  })
  .refine((body) => body.from.player !== body.to.player, {
    path: ['to'],
    message: 'two players',
  });
export type EconomyTradeBody = z.input<typeof economyTradeBody>;

// Player shops: a block in the game selling one item for an account, and maybe buying it back.

/** The longest item SNBT a shop keeps: a few heavily enchanted, renamed items fit easily. */
export const ECONOMY_SHOP_MAX_SNBT = 32_768;
/** The most lots one order moves: a full shop of 27 stacks of 1, with room to spare. */
export const ECONOMY_SHOP_MAX_LOTS = 10_000;

export const economyShopParams = z.object({ shopId: z.uuid() });

const shopItem = z.object({
  id: z.string().trim().min(1).max(128).describe('The item, such as `minecraft:diamond`.'),
  snbt: z
    .string()
    .min(1)
    .max(ECONOMY_SHOP_MAX_SNBT)
    .describe('The item as the game saved it, with every component. Kept as is, never read.'),
  name: z.string().trim().min(1).max(64).describe('Its name in the game.'),
});

const shopPosition = z.object({
  world: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe('The dimension, such as `minecraft:overworld`.'),
  x: z.int(),
  y: z.int(),
  z: z.int(),
});

export const economyShopSettings = z
  .object({
    player: minecraftUuid.describe('Who saves the shop: an owner or member of the account.'),
    account: economyAccountRef.describe(
      'The account that sells, and pays for what is bought back.',
    ),
    item: shopItem,
    lotSize: z.int().min(1).max(99).describe('How many items one lot holds.'),
    sellPrice: economyAmount.describe('What a buyer pays for one lot.'),
    buyPrice: economyAmount
      .optional()
      .describe("What the shop pays for one lot it buys back. Without it, the shop doesn't buy."),
    position: shopPosition,
  })
  .refine((body) => body.buyPrice === undefined || body.buyPrice <= body.sellPrice, {
    path: ['buyPrice'],
    message: 'at most the sell price',
  });
export type EconomyShopSettings = z.input<typeof economyShopSettings>;

export const economyShopDisableBody = z.object({
  idempotencyKey: z.uuid().describe('Sent by the server with every call it may repeat. Ignored.'),
  player: minecraftUuid.optional().describe('Who broke the shop, when a player did.'),
});

export const economyShopDisabledReason = z.enum(['removed', 'admin']);

export const economyServerShop = z.object({
  id: z.uuid(),
  account: z.object({
    id: z.uuid(),
    kind: z.enum(['personal', 'shared']),
    handle: z.string().nullable(),
  }),
  item: z.object({ id: z.string(), name: z.string() }),
  lotSize: z.number(),
  sellPrice: z.number(),
  buyPrice: z.number().nullable(),
  position: shopPosition,
  disabled: z.boolean(),
  disabledReason: economyShopDisabledReason.nullable(),
});
export type EconomyServerShop = z.infer<typeof economyServerShop>;

export const economyShopDirection = z.enum(['buy', 'sell']);

export const economyShopOrderBody = z.object({
  idempotencyKey: z.uuid(),
  player: minecraftUuid,
  account: economyAccountRef
    .optional()
    .describe(
      "`buy`: the account that pays, the player's default one without it. `sell`: the account paid, the personal one without it.",
    ),
  direction: economyShopDirection.describe('`buy` from the shop, or `sell` back to it.'),
  lots: z.int().positive().max(ECONOMY_SHOP_MAX_LOTS),
  expectedLotPrice: economyAmount.describe(
    'The lot price the player saw. Another price is a 409 `priceChanged`.',
  ),
});
export type EconomyShopOrderBody = z.input<typeof economyShopOrderBody>;

export const economyShopOrderResult = economyTransferResult.extend({
  shopId: z.uuid(),
  direction: economyShopDirection,
  lots: z.number(),
  lotPrice: z.number(),
});
export type EconomyShopOrderResult = z.infer<typeof economyShopOrderResult>;

// ---- Admins -----------------------------------------------------------------------------------

export const economyAdminAccountsQuery = economyCursorQuery.extend({
  q: z.string().trim().max(100).optional().describe('Handle, account name or player name.'),
  kind: z.enum(['personal', 'shared']).optional(),
});
export type EconomyAdminAccountsQuery = z.input<typeof economyAdminAccountsQuery>;

export const economyAdminAccountRow = z.object({
  id: z.uuid(),
  kind: z.enum(['personal', 'shared']),
  type: economyAccountType.nullable().describe('Shared accounts only.'),
  handle: z.string().nullable(),
  name: z.string().nullable(),
  owner: z
    .object({ userId: z.string(), name: z.string(), username: z.string().nullable() })
    .nullable()
    .describe('Personal accounts: the owner, null once deleted.'),
  balance: z.number(),
  memberCount: z.number(),
  frozen: z.boolean(),
  closed: z.boolean(),
  createdAt: isoDate,
});
export type EconomyAdminAccountRow = z.infer<typeof economyAdminAccountRow>;
export const economyAdminAccountPage = page(economyAdminAccountRow);
export type EconomyAdminAccountPage = z.infer<typeof economyAdminAccountPage>;

export const economyAdminAccountDetail = economyAdminAccountRow.extend({
  frozenAt: isoDate.nullable(),
  frozenReason: z.string().nullable(),
  ownerBanned: z.boolean().describe('The personal account is frozen by a site or Warden ban.'),
  members: z.array(economyMemberView),
  in30: z.number().describe('Money in over the last 30 days.'),
  out30: z.number().describe('Money out over the last 30 days.'),
});
export type EconomyAdminAccountDetail = z.infer<typeof economyAdminAccountDetail>;

/** PATCH /api/economy/admin/accounts/:accountId */
export const economyAdminAccountPatchBody = z.object({
  type: economyAccountType.describe('Any type, with no licence needed.'),
});
export type EconomyAdminAccountPatchBody = z.infer<typeof economyAdminAccountPatchBody>;

/** POST /api/economy/admin/accounts/:accountId/adjustments */
export const economyAdjustBody = z.object({
  direction: z.enum(['mint', 'burn']),
  amount: economyAmount,
  reason: economyMemo.describe("Shown in the account's history and the audit log."),
});
export type EconomyAdjustBody = z.infer<typeof economyAdjustBody>;

/** POST /api/economy/admin/accounts/:accountId/freeze */
export const economyFreezeBody = z
  .object({
    frozen: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional().describe('Required to freeze.'),
  })
  .refine((body) => !body.frozen || body.reason, { path: ['reason'] });
export type EconomyFreezeBody = z.infer<typeof economyFreezeBody>;

// The auction house: listings at a fixed price, stored on the site with their items, and a
// mailbox for items waiting for their player.

/** The most a listing can ask: far below any balance limit, so price × tax never overflows. */
export const ECONOMY_LISTING_MAX_PRICE = 1_000_000_000;
export const ECONOMY_LISTINGS_PAGE = 45;

export const economyListingParams = z.object({ listingId: z.uuid() });
export const economyMailboxParams = z.object({ itemId: z.uuid() });

const listedItem = z.object({
  id: z.string(),
  name: z.string(),
  snbt: z.string().describe('The item as the game saved it, to show it in the game.'),
});

export const economyListingBody = z.object({
  idempotencyKey: z.uuid().describe('A retry with the same key gives back the same listing.'),
  player: minecraftUuid.describe('The seller.'),
  account: economyAccountRef
    .optional()
    .describe(
      'The account paid when it sells: one the seller can spend from. Their default one without it.',
    ),
  item: shopItem,
  count: z.int().min(1).max(99).describe('How many items: one stack, sold whole.'),
  price: z.int().min(1).max(ECONOMY_LISTING_MAX_PRICE).describe('The price of the whole stack.'),
});
export type EconomyListingBody = z.input<typeof economyListingBody>;

export const economyListingStatus = z.enum(['active', 'sold', 'cancelled', 'expired']);

export const economyServerListing = z.object({
  id: z.uuid(),
  item: listedItem,
  count: z.number(),
  price: z.number(),
  seller: z.string().describe("The seller's Minecraft username."),
  status: economyListingStatus,
  createdAt: isoDate,
  expiresAt: isoDate,
});
export type EconomyServerListing = z.infer<typeof economyServerListing>;

export const economyListingsQuery = economyCursorQuery.extend({
  q: z.string().trim().max(64).optional().describe('Item name or ID.'),
  sort: z.enum(['newest', 'price', 'unitPrice']).default('newest'),
});
export type EconomyListingsQuery = z.input<typeof economyListingsQuery>;

export const economyListingPage = page(economyServerListing);
export type EconomyListingPage = z.infer<typeof economyListingPage>;

export const economyPlayerListings = z.object({
  items: z.array(economyServerListing).describe('Up now, newest first.'),
  max: z.number().describe('The most listings up at once.'),
  taxPercent: z.number(),
  days: z.number().describe('How many days a new listing stays up.'),
});
export type EconomyPlayerListings = z.infer<typeof economyPlayerListings>;

export const economyListingActionBody = z.object({
  idempotencyKey: z.uuid(),
  player: minecraftUuid,
});

export const economyListingBuyBody = economyListingActionBody.extend({
  account: economyAccountRef
    .optional()
    .describe("The account that pays. The buyer's default one without it."),
});
export type EconomyListingBuyBody = z.input<typeof economyListingBuyBody>;

export const economyMailboxReason = z.enum(['bought', 'cancelled', 'expired', 'removed']);

export const economyMailboxView = z.object({
  id: z.uuid(),
  item: listedItem,
  count: z.number(),
  reason: economyMailboxReason,
  createdAt: isoDate,
});
export type EconomyMailboxView = z.infer<typeof economyMailboxView>;

export const economyMailbox = z.object({ items: z.array(economyMailboxView) });

export const economyListingBuyResult = economyTransferResult.extend({
  from: transferSide.describe("The buyer's account."),
  to: transferSide.describe("The seller's account."),
  amount: z.number().describe('The price.'),
  tax: z.number().describe('Burned, taken from what the seller gets.'),
  listingId: z.uuid(),
  mailboxItem: economyMailboxView.describe("The item, in the buyer's mailbox, to claim."),
});
export type EconomyListingBuyResult = z.infer<typeof economyListingBuyResult>;

export const economyMailboxClaimResult = economyMailboxView.extend({
  replayed: z.boolean().describe('True when this key had already claimed it.'),
});
export type EconomyMailboxClaimResult = z.infer<typeof economyMailboxClaimResult>;

/** GET /api/economy/admin/listings */
export const economyAdminListingsQuery = economyCursorQuery.extend({
  q: z.string().trim().max(100).optional().describe('Item name or ID, or the seller.'),
  status: economyListingStatus.optional(),
});
export type EconomyAdminListingsQuery = z.input<typeof economyAdminListingsQuery>;

export const economyAdminListingRow = economyServerListing.extend({
  sellerUserId: z.string(),
  account: z.object({ id: z.uuid(), handle: z.string().nullable() }),
  buyer: z.object({ userId: z.string(), name: z.string() }).nullable(),
  endedAt: isoDate.nullable(),
});
export type EconomyAdminListingRow = z.infer<typeof economyAdminListingRow>;

export const economyAdminListingPage = page(economyAdminListingRow);
export type EconomyAdminListingPage = z.infer<typeof economyAdminListingPage>;

/** POST /api/economy/admin/listings/:listingId/remove */
export const economyAdminListingRemoveBody = z.object({ reason: economyMemo });

/** GET /api/economy/admin/shops */
export const economyAdminShopsQuery = economyCursorQuery.extend({
  q: z.string().trim().max(100).optional().describe("Item name or ID, or the account's handle."),
  status: z.enum(['on', 'off']).optional(),
});
export type EconomyAdminShopsQuery = z.input<typeof economyAdminShopsQuery>;

export const economyAdminShopRow = economyServerShop.extend({
  account: z.object({
    id: z.uuid(),
    kind: z.enum(['personal', 'shared']),
    handle: z.string().nullable(),
    name: z.string().describe("A shared account's name, or the owner's name."),
  }),
  disabledAt: isoDate.nullable(),
  createdBy: z.object({ userId: z.string(), name: z.string() }).nullable(),
  createdAt: isoDate,
  orders: z.number().describe('Orders since the shop opened.'),
  volume: z.number().describe('LNBits moved by those orders.'),
});
export type EconomyAdminShopRow = z.infer<typeof economyAdminShopRow>;

export const economyAdminShopPage = page(economyAdminShopRow);
export type EconomyAdminShopPage = z.infer<typeof economyAdminShopPage>;

/** PATCH /api/economy/admin/shops/:shopId */
export const economyAdminShopPatch = z.object({
  disabled: z
    .boolean()
    .describe('Turns the shop off, or back on. A shop whose block was broken stays off.'),
});
export type EconomyAdminShopPatch = z.infer<typeof economyAdminShopPatch>;

/** POST /api/economy/admin/transactions/:transactionId/reverse */
export const economyReverseBody = z.object({ reason: economyMemo });

/** One side of a transaction in the ledger. */
export const economyLedgerSide = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('account'),
    accountId: z.uuid(),
    handle: z.string().nullable().describe('Shared accounts.'),
    owner: z.string().nullable().describe('Personal accounts: the owner, null once deleted.'),
  }),
  z.object({ type: z.literal('lnb') }),
]);
export type EconomyLedgerSide = z.infer<typeof economyLedgerSide>;

export const economyLedgerRow = z.object({
  id: z.number(),
  at: isoDate,
  kind: economyTransactionKind,
  reason: economyReason.nullable(),
  memo: z.string().nullable(),
  amount: z.number().describe('The money moved: the sum of the positive entries.'),
  from: z.array(economyLedgerSide),
  to: z.array(economyLedgerSide),
  actor: z.string().nullable().describe('The admin or player behind it, when known.'),
  reversedBy: z.number().nullable(),
  reverses: z.number().nullable(),
});
export type EconomyLedgerRow = z.infer<typeof economyLedgerRow>;
export const economyLedgerPage = page(economyLedgerRow);
export type EconomyLedgerPage = z.infer<typeof economyLedgerPage>;

export const economyLedgerQuery = economyCursorQuery.extend({
  kind: economyTransactionKind.optional(),
  accountId: z.uuid().optional(),
  q: z.string().trim().max(100).optional().describe('In messages and reasons.'),
});
export type EconomyLedgerQuery = z.input<typeof economyLedgerQuery>;

export const ECONOMY_PERIODS = ['7d', '30d', '90d', 'all'] as const;
export const economyStatsQuery = z.object({ period: z.enum(ECONOMY_PERIODS).default('30d') });
export type EconomyPeriod = (typeof ECONOMY_PERIODS)[number];

/** GET /api/economy/accounts/:accountId/balance-history, and the admin's twin. */
export const economyBalanceHistory = z.object({
  period: z.enum(ECONOMY_PERIODS),
  days: z
    .array(
      z.object({
        day: z.string().describe('YYYY-MM-DD, in Paris time.'),
        balance: z.number().describe('At the end of the day.'),
        in: z.number().describe('Money in that day.'),
        out: z.number().describe('Money out that day.'),
      }),
    )
    .describe('One per day, oldest first, up to today. Days without activity keep the balance.'),
});
export type EconomyBalanceHistory = z.infer<typeof economyBalanceHistory>;

/** GET /api/economy/admin/stats */
export const economyStats = z.object({
  period: z.enum(ECONOMY_PERIODS),
  supply: z.number().describe('Money in circulation now.'),
  supplyChange: z.number().describe('Over the period.'),
  minted: z.number(),
  burned: z.number(),
  activePlayers: z.number().describe('Players who paid at least once over the period.'),
  transactions: z.number().describe('Transactions between players over the period.'),
  moved: z.number().describe('LNBits moved between players over the period.'),
  days: z
    .array(
      z.object({
        day: z.string().describe('YYYY-MM-DD, in Paris time.'),
        supply: z.number(),
        minted: z.number(),
        burned: z.number(),
      }),
    )
    .describe('One per day, oldest first.'),
  reasons: z.array(
    z.object({
      direction: z.enum(['mint', 'burn']),
      reason: economyReason,
      amount: z.number(),
    }),
  ),
  volume: z.array(
    z.object({ kind: z.enum(ECONOMY_VOLUME_KINDS), amount: z.number(), count: z.number() }),
  ),
  distribution: z.object({
    accounts: z.number().describe('Personal accounts with money.'),
    top10Share: z.number().describe('Share of the money held by the richest 10%, from 0 to 1.'),
    gini: z.number().describe('0 is equal, 1 is one player holding everything.'),
    histogram: z.array(
      z.object({ from: z.number(), to: z.number().nullable(), count: z.number() }),
    ),
  }),
  largestShared: z.array(
    z.object({
      id: z.uuid(),
      handle: z.string(),
      name: z.string(),
      balance: z.number(),
      memberCount: z.number(),
    }),
  ),
});
export type EconomyStats = z.infer<typeof economyStats>;

export const economySettingsView = z.object({
  startingBalance: z.number(),
  maxOwnedShared: z.number(),
  maxMembers: z.number(),
  auctionTaxPercent: z.number().describe('The auction house sale tax, burned, in percent.'),
  auctionMaxListings: z.number().describe('The most listings a player has up at once.'),
  auctionDays: z.number().describe('How many days a listing stays up.'),
  updatedAt: isoDate,
});
export type EconomySettingsView = z.infer<typeof economySettingsView>;

/** PATCH /api/economy/admin/settings */
export const economySettingsBody = z
  .object({
    startingBalance: z.int().min(0).max(1_000_000),
    maxOwnedShared: z.int().min(0).max(50),
    maxMembers: z.int().min(1).max(200),
    auctionTaxPercent: z.int().min(0).max(50),
    auctionMaxListings: z.int().min(1).max(200),
    auctionDays: z.int().min(1).max(90),
  })
  .partial();
export type EconomySettingsBody = z.infer<typeof economySettingsBody>;

/** The words to type to reset the economy. */
export const ECONOMY_RESET_CONFIRM = 'reset the economy';

/** POST /api/economy/admin/reset */
export const economyResetBody = z.object({
  confirm: z.string().describe(`Must be "${ECONOMY_RESET_CONFIRM}".`),
});

/** GET /api/economy/admin/export: every open account with its balance and members. */
export const economyExport = z.object({
  exportedAt: isoDate,
  supply: z.number(),
  accounts: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['personal', 'shared']),
      type: economyAccountType.nullable(),
      handle: z.string().nullable(),
      name: z.string().nullable(),
      ownerUserId: z.string().nullable(),
      balance: z.number(),
      members: z.array(z.object({ userId: z.string(), role: economyRole })),
    }),
  ),
});
export type EconomyExport = z.infer<typeof economyExport>;
