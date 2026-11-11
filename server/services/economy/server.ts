import { createHash } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import {
  economyAccount,
  economyEntry,
  economyTransaction,
  minecraftAccount,
} from '~~/server/db/schema';

import { economyAccountService } from './accounts';
import { economyLedger } from './ledger';
import { canSpend } from './rules';
import { bannedUsers, refuse } from './shared';
import type { Db, Tx } from './shared';
import { accountViews } from './views';

import type {
  EconomyServerAccount,
  EconomyServerPlayer,
  EconomyTransferBody,
  EconomyTransferResult,
} from '#shared/schemas/economy';
import { economyTransferBody } from '#shared/schemas/economy';

// What the Minecraft server asks of the economy: a player's accounts, an account by handle, and
// transfers. The server is trusted (WARDEN_SERVER_SECRET), but every rule is still checked here:
// who may spend, frozen accounts, balances. See docs/economy.md.

type TransferBody = ReturnType<typeof economyTransferBody.parse>;

/** The LNB account behind a linked Minecraft account. */
export async function ownerOf(dbx: Db, uuid: string): Promise<string> {
  const [account] = await dbx
    .select({ userId: minecraftAccount.userId })
    .from(minecraftAccount)
    .where(and(eq(minecraftAccount.uuid, uuid), isNull(minecraftAccount.unlinkedAt)));
  if (!account) refuse(404, 'notLinked');
  return account.userId;
}

/** The eligible player behind a Minecraft account, with their personal account opened. */
export async function player(tx: Tx, uuid: string) {
  const userId = await ownerOf(tx, uuid);
  if (!(await economyAccountService.isEligible(tx, userId))) refuse(403, 'notEligible');
  const personal = await economyAccountService.ensurePersonal(tx, userId);
  return { userId, personal };
}

/** The player's accounts, for the in-game balance and "My accounts". */
async function lookup(uuid: string): Promise<EconomyServerPlayer> {
  const { userId, personal } = await db.transaction((tx) => player(tx, uuid));
  const rows = await economyAccountService.accountsOf(db, userId);
  return {
    userId,
    defaultAccountId: await economyAccountService.resolveDefault(db, userId, personal.id),
    accounts: await accountViews(db, rows),
  };
}

/** Picks the account that pays in the game. Null goes back to the personal account. */
async function setDefault(uuid: string, ref: string | null): Promise<EconomyServerPlayer> {
  const userId = await ownerOf(db, uuid);
  const accountId = ref ? (await economyAccountService.byRef(db, ref)).id : null;
  await economyAccountService.updateMe(userId, { defaultAccountId: accountId });
  return lookup(uuid);
}

/** A shared account by handle, for a casino machine or a shop. */
async function account(handle: string): Promise<EconomyServerAccount> {
  const found = await economyAccountService.byRef(db, handle);
  if (found.kind !== 'shared') refuse(404, 'notFound');
  return {
    id: found.id,
    handle: found.handle ?? '',
    name: found.name ?? '',
    balance: found.balance,
    frozen: Boolean(found.frozenAt),
  };
}

/** The same request always gives the same fingerprint, whatever the order of its keys. */
function fingerprint(body: TransferBody): string {
  return hashRequest({
    from: { player: body.from.player ?? null, account: body.from.account ?? null },
    to: { player: body.to.player ?? null, account: body.to.account ?? null },
    amount: body.amount,
    kind: body.kind,
    memo: body.memo ?? null,
  });
}

/** A transaction already made with this key and its two sides, or nothing. */
export async function previousByKey(dbx: Db, key: string, print: string) {
  const [existing] = await dbx
    .select({ id: economyTransaction.id, fingerprint: economyTransaction.fingerprint })
    .from(economyTransaction)
    .where(eq(economyTransaction.idempotencyKey, key));
  if (!existing) return undefined;
  if (existing.fingerprint !== print) refuse(409, 'idempotencyMismatch');
  const entries = await dbx
    .select({
      accountId: economyEntry.accountId,
      amount: economyEntry.amount,
      balanceAfter: economyEntry.balanceAfter,
      handle: economyAccount.handle,
    })
    .from(economyEntry)
    .leftJoin(economyAccount, eq(economyAccount.id, economyEntry.accountId))
    .where(eq(economyEntry.transactionId, existing.id));
  const from = entries.find((entry) => entry.amount < 0);
  const to = entries.find((entry) => entry.amount > 0);
  if (!from?.accountId || !to?.accountId) throw new Error('A transfer has two accounts.');
  return {
    transactionId: existing.id,
    replayed: true,
    amount: to.amount,
    from: { accountId: from.accountId, handle: from.handle, balance: from.balanceAfter ?? 0 },
    to: { accountId: to.accountId, handle: to.handle, balance: to.balanceAfter ?? 0 },
  } satisfies EconomyTransferResult;
}

/** The SHA-256 of a request, to refuse the same key on a different one. */
export function hashRequest(canonical: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Moves money in one call: a /pay, a bet or a casino payout. The paying player must be allowed
 * to spend from the account, and neither side may be frozen. Sending the same key again gives back
 * the first result, so a retry after a timeout never pays twice.
 */
async function transfer(input: EconomyTransferBody): Promise<EconomyTransferResult> {
  const body = economyTransferBody.parse(input);
  const print = fingerprint(body);
  const previous = await previousByKey(db, body.idempotencyKey, print);
  if (previous) return previous;

  try {
    return await db.transaction(async (tx) => {
      let payerId: string | null = null;
      let from: typeof economyAccount.$inferSelect;
      if (body.from.player) {
        const payer = await player(tx, body.from.player);
        payerId = payer.userId;
        if ((await bannedUsers(tx, [payer.userId])).size) refuse(409, 'frozen');
        from = body.from.account
          ? await economyAccountService.byRef(tx, body.from.account)
          : await economyAccountService
              .resolveDefault(tx, payer.userId, payer.personal.id)
              .then((id) => economyAccountService.byRef(tx, id));
        if (!canSpend(await economyAccountService.roleIn(tx, from, payer.userId))) {
          refuse(403, 'notAllowed');
        }
      } else {
        // A casino machine paying out from its own account.
        from = await economyAccountService.byRef(tx, body.from.account ?? '');
        if (from.kind !== 'shared') refuse(403, 'notAllowed');
      }

      const to = body.to.player
        ? (await player(tx, body.to.player)).personal
        : await economyAccountService.byRef(tx, body.to.account ?? '');
      if (from.id === to.id) refuse(409, 'sameAccount');

      const posted = await economyLedger.post(tx, {
        kind: body.kind,
        memo: body.memo,
        actor: { source: 'minecraft', userId: payerId, minecraftUuid: body.from.player ?? null },
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
        legs: [
          { accountId: from.id, amount: -body.amount },
          { accountId: to.id, amount: body.amount },
        ],
      });
      return {
        transactionId: posted.transactionId,
        replayed: false,
        amount: body.amount,
        from: {
          accountId: from.id,
          handle: from.handle,
          balance: posted.balances.get(from.id) ?? 0,
        },
        to: { accountId: to.id, handle: to.handle, balance: posted.balances.get(to.id) ?? 0 },
      };
    });
  } catch (error) {
    // The same key sent twice at once: the second one lost the race, so answer like a retry.
    if (isUniqueViolation(error)) {
      const raced = await previousByKey(db, body.idempotencyKey, print);
      if (raced) return raced;
    }
    throw error;
  }
}

export const economyServerService = { lookup, setDefault, account, transfer };
