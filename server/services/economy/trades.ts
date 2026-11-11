import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';

import { economyAccountService } from './accounts';
import { economyLedger } from './ledger';
import { canSpend } from './rules';
import { hashRequest, player, previousByKey } from './server';
import { bannedUsers, refuse } from './shared';
import type { Tx } from './shared';

import type { EconomyTradeBody, EconomyTransferResult } from '#shared/schemas/economy';
import { economyTradeBody } from '#shared/schemas/economy';

// Trades: two players swap items in the game, with money on either side. The server holds both
// sides' items aside, then sends the money part here in one call: what one player gave minus what
// the other gave, so a trade is one transaction between two accounts. See docs/economy.md.

type Body = ReturnType<typeof economyTradeBody.parse>;
type Side = Body['from'];

/** The account a player trades with: the one they chose, which they must spend from, or their default. */
async function sideAccount(tx: Tx, side: Side) {
  const who = await player(tx, side.player);
  if (!side.account) {
    const id = await economyAccountService.resolveDefault(tx, who.userId, who.personal.id);
    return { userId: who.userId, account: await economyAccountService.byRef(tx, id) };
  }
  const account = await economyAccountService.byRef(tx, side.account);
  if (!canSpend(await economyAccountService.roleIn(tx, account, who.userId))) {
    refuse(403, 'notAllowed');
  }
  return { userId: who.userId, account };
}

function print(body: Body): string {
  return hashRequest({
    kind: 'trade',
    from: { player: body.from.player, account: body.from.account ?? null },
    to: { player: body.to.player, account: body.to.account ?? null },
    amount: body.amount,
    memo: body.memo ?? null,
  });
}

/**
 * The money part of a trade, in one call and one transaction. Both players must be different LNB
 * accounts, and neither may be banned. Sending the same key again gives back the first result.
 */
async function trade(input: EconomyTradeBody): Promise<EconomyTransferResult> {
  const body = economyTradeBody.parse(input);
  const fingerprint = print(body);
  const previous = await previousByKey(db, body.idempotencyKey, fingerprint);
  if (previous) return previous;

  try {
    return await db.transaction(async (tx) => {
      const from = await sideAccount(tx, body.from);
      const to = await sideAccount(tx, body.to);
      // Two Minecraft accounts of the same person would only move money between their own accounts.
      if (from.userId === to.userId) refuse(409, 'sameAccount');
      if ((await bannedUsers(tx, [from.userId, to.userId])).size) refuse(409, 'frozen');
      if (from.account.id === to.account.id) refuse(409, 'sameAccount');

      const posted = await economyLedger.post(tx, {
        kind: 'trade',
        memo: body.memo,
        actor: { source: 'minecraft', userId: from.userId, minecraftUuid: body.from.player },
        idempotencyKey: body.idempotencyKey,
        fingerprint,
        legs: [
          { accountId: from.account.id, amount: -body.amount },
          { accountId: to.account.id, amount: body.amount },
        ],
      });
      return {
        transactionId: posted.transactionId,
        replayed: false,
        amount: body.amount,
        from: {
          accountId: from.account.id,
          handle: from.account.handle,
          balance: posted.balances.get(from.account.id) ?? 0,
        },
        to: {
          accountId: to.account.id,
          handle: to.account.handle,
          balance: posted.balances.get(to.account.id) ?? 0,
        },
      };
    });
  } catch (error) {
    // The same key sent twice at once: the second one lost the race, so answer like a retry.
    if (isUniqueViolation(error)) {
      const raced = await previousByKey(db, body.idempotencyKey, fingerprint);
      if (raced) return raced;
    }
    throw error;
  }
}

export const economyTradeService = { trade };
