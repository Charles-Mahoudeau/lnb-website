import { asc, eq, inArray } from 'drizzle-orm';

import { economyAccount, economyEntry, economyTransaction } from '~~/server/db/schema';
import type { EconomyReason, EconomyTransactionKind } from '~~/server/db/schema';

import { isBalanced, mergeLegs } from './rules';
import { bannedUsers, refuse } from './shared';
import type { EconomyActor, Tx } from './shared';

// The only code that changes a balance. Every movement of money is one transaction whose lines
// add up to zero, written with the balances it leaves. See docs/economy.md.

export interface Leg {
  /** Null is LNB: a negative line creates money, a positive one destroys it. */
  accountId: string | null;
  amount: number;
}

export interface PostInput {
  kind: EconomyTransactionKind;
  reason?: EconomyReason;
  memo?: string | null;
  actor: EconomyActor;
  idempotencyKey?: string;
  fingerprint?: string;
  reversesId?: number;
  legs: Leg[];
  /** Admin moves (adjustments, reversals, closing): allowed on frozen accounts. */
  allowFrozen?: boolean;
}

export interface Posted {
  transactionId: number;
  /** Each account's balance right after the transaction. */
  balances: Map<string, number>;
}

/**
 * Writes a transaction in the caller's database transaction. Locks the accounts in ID order, so
 * two transfers between the same accounts can't deadlock, and refuses one that would leave a
 * balance below zero or touch a frozen or closed account.
 */
async function post(tx: Tx, input: PostInput): Promise<Posted> {
  if (!isBalanced(input.legs)) throw new Error('An economy transaction must add up to zero.');
  const legs = mergeLegs(input.legs);
  const ids = legs.flatMap((leg) => (leg.accountId ? [leg.accountId] : [])).sort();
  const rows = ids.length
    ? await tx
        .select({
          id: economyAccount.id,
          balance: economyAccount.balance,
          ownerUserId: economyAccount.ownerUserId,
          frozenAt: economyAccount.frozenAt,
          closedAt: economyAccount.closedAt,
        })
        .from(economyAccount)
        .where(inArray(economyAccount.id, ids))
        .orderBy(asc(economyAccount.id))
        .for('update')
    : [];
  if (rows.length !== ids.length) refuse(404, 'notFound');
  const byId = new Map(rows.map((row) => [row.id, row]));

  if (rows.some((row) => row.closedAt)) refuse(409, 'closed');
  if (!input.allowFrozen) {
    const owners = rows.flatMap((row) => (row.ownerUserId ? [row.ownerUserId] : []));
    const banned = await bannedUsers(tx, owners);
    if (rows.some((row) => row.frozenAt || (row.ownerUserId && banned.has(row.ownerUserId)))) {
      refuse(409, 'frozen');
    }
  }

  const balances = new Map<string, number>();
  for (const leg of legs) {
    if (!leg.accountId) continue;
    const account = byId.get(leg.accountId);
    if (!account) refuse(404, 'notFound');
    const next = account.balance + leg.amount;
    if (next < 0) refuse(409, 'insufficientFunds');
    balances.set(leg.accountId, next);
  }

  const actor = input.actor;
  const [transaction] = await tx
    .insert(economyTransaction)
    .values({
      kind: input.kind,
      reason: input.reason ?? null,
      memo: input.memo ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      fingerprint: input.fingerprint ?? null,
      source: actor.source,
      actorUserId: actor.source === 'system' ? null : actor.userId,
      actorMinecraftUuid: actor.source === 'minecraft' ? actor.minecraftUuid : null,
      reversesId: input.reversesId ?? null,
    })
    .returning({ id: economyTransaction.id });
  if (!transaction) throw new Error('The transaction was not written.');

  for (const [accountId, balance] of balances) {
    await tx.update(economyAccount).set({ balance }).where(eq(economyAccount.id, accountId));
  }
  await tx.insert(economyEntry).values(
    legs.map((leg) => ({
      transactionId: transaction.id,
      accountId: leg.accountId,
      amount: leg.amount,
      balanceAfter: leg.accountId ? (balances.get(leg.accountId) ?? null) : null,
    })),
  );
  return { transactionId: transaction.id, balances };
}

/** Undoes a transaction with a new one carrying the opposite lines. Each can be undone once. */
async function reverse(
  tx: Tx,
  input: { transactionId: number; memo: string; actor: EconomyActor },
): Promise<Posted> {
  const [original] = await tx
    .select({ id: economyTransaction.id, kind: economyTransaction.kind })
    .from(economyTransaction)
    .where(eq(economyTransaction.id, input.transactionId))
    .for('update');
  if (!original) refuse(404, 'notFound');
  if (original.kind === 'reversal') refuse(409, 'notReversible');
  const [already] = await tx
    .select({ id: economyTransaction.id })
    .from(economyTransaction)
    .where(eq(economyTransaction.reversesId, original.id));
  if (already) refuse(409, 'alreadyReversed');
  const entries = await tx
    .select({ accountId: economyEntry.accountId, amount: economyEntry.amount })
    .from(economyEntry)
    .where(eq(economyEntry.transactionId, original.id));
  return post(tx, {
    kind: 'reversal',
    memo: input.memo,
    actor: input.actor,
    reversesId: original.id,
    legs: entries.map((entry) => ({ accountId: entry.accountId, amount: -entry.amount })),
    allowFrozen: true,
  });
}

/** Creates money on an account. */
function mint(
  tx: Tx,
  input: {
    accountId: string;
    amount: number;
    reason: EconomyReason;
    memo?: string;
    actor: EconomyActor;
  },
) {
  return post(tx, {
    kind: 'mint',
    reason: input.reason,
    memo: input.memo,
    actor: input.actor,
    legs: [
      { accountId: null, amount: -input.amount },
      { accountId: input.accountId, amount: input.amount },
    ],
    allowFrozen: true,
  });
}

/** Destroys money on an account. */
function burn(
  tx: Tx,
  input: {
    accountId: string;
    amount: number;
    reason: EconomyReason;
    memo?: string;
    actor: EconomyActor;
  },
) {
  return post(tx, {
    kind: 'burn',
    reason: input.reason,
    memo: input.memo,
    actor: input.actor,
    legs: [
      { accountId: input.accountId, amount: -input.amount },
      { accountId: null, amount: input.amount },
    ],
    allowFrozen: true,
  });
}

export const economyLedger = { post, reverse, mint, burn };
