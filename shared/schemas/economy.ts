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

export const economyAccountName = z.string().trim().min(1).max(32);
export const economyMemo = z.string().trim().min(1).max(140);
export const economyRole = z.enum(['owner', 'member', 'viewer']);
export type EconomyRole = z.infer<typeof economyRole>;

export const ECONOMY_TRANSACTION_KINDS = ['payment', 'casino', 'mint', 'burn', 'reversal'] as const;
export const economyTransactionKind = z.enum(ECONOMY_TRANSACTION_KINDS);
export type EconomyTransactionKind = z.infer<typeof economyTransactionKind>;
/** Kinds that move money between players, counted as volume. Mint, burn and reversals aren't. */
export const ECONOMY_VOLUME_KINDS = ['payment', 'casino'] as const;

export const economyReason = z.enum(['startingBalance', 'adjustment', 'accountClosed']);
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
export const economyCreateBody = z.object({ name: economyAccountName, handle: economyHandle });
export type EconomyCreateBody = z.input<typeof economyCreateBody>;

/** PATCH /api/economy/accounts/:accountId */
export const economyRenameBody = z.object({ name: economyAccountName });

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

// ---- Admins -----------------------------------------------------------------------------------

export const economyAdminAccountsQuery = economyCursorQuery.extend({
  q: z.string().trim().max(100).optional().describe('Handle, account name or player name.'),
  kind: z.enum(['personal', 'shared']).optional(),
});
export type EconomyAdminAccountsQuery = z.input<typeof economyAdminAccountsQuery>;

export const economyAdminAccountRow = z.object({
  id: z.uuid(),
  kind: z.enum(['personal', 'shared']),
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
  updatedAt: isoDate,
});
export type EconomySettingsView = z.infer<typeof economySettingsView>;

/** PATCH /api/economy/admin/settings */
export const economySettingsBody = z
  .object({
    startingBalance: z.int().min(0).max(1_000_000),
    maxOwnedShared: z.int().min(0).max(50),
    maxMembers: z.int().min(1).max(200),
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
      handle: z.string().nullable(),
      name: z.string().nullable(),
      ownerUserId: z.string().nullable(),
      balance: z.number(),
      members: z.array(z.object({ userId: z.string(), role: economyRole })),
    }),
  ),
});
export type EconomyExport = z.infer<typeof economyExport>;
