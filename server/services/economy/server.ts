import { createHash } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import {
  economyAccount,
  economyCasinoLicense,
  economyEntry,
  economyTransaction,
  minecraftAccount,
} from '~~/server/db/schema';

import { economyAccountService } from './accounts';
import { economyLedger } from './ledger';
import { licenseCount } from './licenses';
import { canSpend } from './rules';
import { economySettingsService } from './settings';
import { bannedUsers, refuse } from './shared';
import type { Db, Tx } from './shared';
import { accountViews } from './views';

import type {
  EconomyLicenseBody,
  EconomyLicenseResult,
  EconomyMintBody,
  EconomyMintResult,
  EconomyServerAccount,
  EconomyServerPlayer,
  EconomyTransferBody,
  EconomyTransferResult,
} from '#shared/schemas/economy';
import { economyLicenseBody, economyMintBody, economyTransferBody } from '#shared/schemas/economy';

// What the Minecraft server asks of the economy: a player's accounts, an account by handle,
// transfers, casino licences and the money mobs drop. The server is trusted (WARDEN_SERVER_SECRET), but every rule is still checked here:
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
  const [rows, casinoLicenses, settings] = await Promise.all([
    economyAccountService.accountsOf(db, userId),
    licenseCount(db, userId),
    economySettingsService.get(),
  ]);
  return {
    userId,
    defaultAccountId: await economyAccountService.resolveDefault(db, userId, personal.id),
    accounts: await accountViews(db, rows),
    casinoLicenses,
    casinoLicensePrice: settings.casinoLicensePrice,
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
    type: found.type ?? 'team',
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

/** A licence already bought with this key, or nothing. */
async function previousLicense(
  dbx: Db,
  key: string,
  print: string,
): Promise<EconomyLicenseResult | undefined> {
  const [license] = await dbx
    .select()
    .from(economyCasinoLicense)
    .where(eq(economyCasinoLicense.idempotencyKey, key));
  if (!license) {
    // The key of another kind of move.
    const [other] = await dbx
      .select({ id: economyTransaction.id })
      .from(economyTransaction)
      .where(eq(economyTransaction.idempotencyKey, key));
    if (other) refuse(409, 'idempotencyMismatch');
    return undefined;
  }
  if (license.fingerprint !== print) refuse(409, 'idempotencyMismatch');
  const [payer] = await dbx
    .select({ handle: economyAccount.handle, balance: economyAccount.balance })
    .from(economyAccount)
    .where(eq(economyAccount.id, license.paidByAccountId));
  const [entry] = license.transactionId
    ? await dbx
        .select({ balanceAfter: economyEntry.balanceAfter })
        .from(economyEntry)
        .where(
          and(
            eq(economyEntry.transactionId, license.transactionId),
            eq(economyEntry.accountId, license.paidByAccountId),
          ),
        )
    : [];
  return {
    transactionId: license.transactionId,
    replayed: true,
    amount: license.price,
    from: {
      accountId: license.paidByAccountId,
      handle: payer?.handle ?? null,
      balance: entry?.balanceAfter ?? payer?.balance ?? 0,
    },
    licenses: await licenseCount(dbx, license.userId),
  };
}

/**
 * The player buys a casino licence. Its price is burned from the account they chose, or their
 * default one, which they must be able to spend from. A price of 0 gives the licence with no
 * transaction. Sending the same key again gives back the first result.
 */
async function buyLicense(input: EconomyLicenseBody): Promise<EconomyLicenseResult> {
  const body = economyLicenseBody.parse(input);
  const print = hashRequest({
    kind: 'casinoLicense',
    player: body.player,
    account: body.account ?? null,
  });
  const previous = await previousLicense(db, body.idempotencyKey, print);
  if (previous) return previous;

  try {
    return await db.transaction(async (tx) => {
      const buyer = await player(tx, body.player);
      if ((await bannedUsers(tx, [buyer.userId])).size) refuse(409, 'frozen');
      const from = body.account
        ? await economyAccountService.byRef(tx, body.account)
        : await economyAccountService
            .resolveDefault(tx, buyer.userId, buyer.personal.id)
            .then((id) => economyAccountService.byRef(tx, id));
      if (!canSpend(await economyAccountService.roleIn(tx, from, buyer.userId))) {
        refuse(403, 'notAllowed');
      }
      if (from.frozenAt) refuse(409, 'frozen');
      const { casinoLicensePrice: price } = await economySettingsService.get(tx);
      const posted =
        price > 0
          ? await economyLedger.post(tx, {
              kind: 'burn',
              reason: 'casinoLicense',
              memo: 'Casino licence',
              actor: { source: 'minecraft', userId: buyer.userId, minecraftUuid: body.player },
              idempotencyKey: body.idempotencyKey,
              fingerprint: print,
              legs: [
                { accountId: from.id, amount: -price },
                { accountId: null, amount: price },
              ],
            })
          : undefined;
      await tx.insert(economyCasinoLicense).values({
        userId: buyer.userId,
        price,
        paidByAccountId: from.id,
        transactionId: posted?.transactionId ?? null,
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
      });
      return {
        transactionId: posted?.transactionId ?? null,
        replayed: false,
        amount: price,
        from: {
          accountId: from.id,
          handle: from.handle,
          balance: posted?.balances.get(from.id) ?? from.balance,
        },
        licenses: await licenseCount(tx, buyer.userId),
      };
    });
  } catch (error) {
    // The same key sent twice at once: the second one lost the race, so answer like a retry.
    if (isUniqueViolation(error)) {
      const raced = await previousLicense(db, body.idempotencyKey, print);
      if (raced) return raced;
    }
    throw error;
  }
}

/** A mint already made with this key, or nothing. */
async function previousMint(
  dbx: Db,
  key: string,
  print: string,
): Promise<EconomyMintResult | undefined> {
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
    })
    .from(economyEntry)
    .where(eq(economyEntry.transactionId, existing.id));
  const to = entries.find((entry) => entry.accountId && entry.amount > 0);
  if (!to?.accountId) throw new Error('A mint credits an account.');
  return {
    transactionId: existing.id,
    replayed: true,
    amount: to.amount,
    to: { accountId: to.accountId, handle: null, balance: to.balanceAfter ?? 0 },
  };
}

/**
 * Creates money on a player's personal account: what the mobs they killed dropped. The server
 * batches drops, so one call covers many mobs. A frozen or banned player gets nothing. Sending the
 * same key again gives back the first result.
 */
async function mint(input: EconomyMintBody): Promise<EconomyMintResult> {
  const body = economyMintBody.parse(input);
  const print = hashRequest({
    kind: 'mint',
    player: body.player,
    amount: body.amount,
    reason: body.reason,
  });
  const previous = await previousMint(db, body.idempotencyKey, print);
  if (previous) return previous;

  try {
    return await db.transaction(async (tx) => {
      const who = await player(tx, body.player);
      const posted = await economyLedger.post(tx, {
        kind: 'mint',
        reason: body.reason,
        actor: { source: 'minecraft', userId: who.userId, minecraftUuid: body.player },
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
        legs: [
          { accountId: null, amount: -body.amount },
          { accountId: who.personal.id, amount: body.amount },
        ],
      });
      return {
        transactionId: posted.transactionId,
        replayed: false,
        amount: body.amount,
        to: {
          accountId: who.personal.id,
          handle: null,
          balance: posted.balances.get(who.personal.id) ?? 0,
        },
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await previousMint(db, body.idempotencyKey, print);
      if (raced) return raced;
    }
    throw error;
  }
}

export const economyServerService = { lookup, setDefault, account, transfer, buyLicense, mint };
