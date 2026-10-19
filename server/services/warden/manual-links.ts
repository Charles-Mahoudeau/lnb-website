import { aliasedTable, and, desc, eq, gt, ilike, inArray, isNotNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { deviceCode, minecraftAccount, user, wardenLinkRequest } from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { wardenEnv } from '~~/server/lib/warden-env';

import { wardenAuditService } from './audit';
import { wardenLinkService } from './links';
import { mojang } from './mojang';
import { refuse } from './shared';
import type { Db } from './shared';

import type {
  WardenManualLinkBody,
  WardenManualLinkView,
  WardenMinecraftLookup,
  WardenUserOption,
} from '#shared/schemas/warden';
import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';

// Link codes made by hand on the admin panel, for players who can't get one from the server.

const RECENT_DAYS = 7;

/**
 * The account a username names: from Mojang for premium accounts, worked out from the name for
 * cracked ones, as offline-mode servers do. Says who linked it already, if anyone.
 */
async function lookup(input: {
  username: string;
  cracked: boolean;
}): Promise<WardenMinecraftLookup> {
  let account: { uuid: string; username: string };
  if (input.cracked) {
    account = { uuid: offlineUuid(input.username), username: input.username };
  } else {
    const profile = await mojang.profile(input.username);
    if (!profile) refuse(404, 'unknownMinecraftUsername');
    account = profile;
  }
  return { ...account, cracked: input.cracked, linkedTo: await owner(db, account.uuid) };
}

async function owner(dbx: Db, uuid: string) {
  const [row] = await dbx
    .select({ userId: user.id, name: user.name })
    .from(minecraftAccount)
    .innerJoin(user, eq(user.id, minecraftAccount.userId))
    .where(eq(minecraftAccount.uuid, uuid));
  return row ?? null;
}

/** Whether a user exists and Warden is open to their school. */
async function requireEligible(dbx: Db, userId: string) {
  const [row] = await dbx.select({ tenantId: user.tenantId }).from(user).where(eq(user.id, userId));
  const app = getLinkApp('warden');
  if (!row) refuse(404, 'notFound');
  if (!app || !canLinkFromSchool(app, row.tenantId)) refuse(403, 'schoolNotAllowed');
}

/** Makes a link code by hand. With `userId`, only that player can use it. */
async function create(input: {
  body: WardenManualLinkBody;
  actorId: string;
}): Promise<WardenManualLinkView> {
  const account = await lookup(input.body);
  if (account.linkedTo) refuse(409, 'alreadyLinked');

  const id = await db.transaction(async (tx) => {
    if (input.body.userId) await requireEligible(tx, input.body.userId);
    const request = await wardenLinkService.create(
      { uuid: account.uuid, username: account.username, cracked: account.cracked },
      { tx, boundUserId: input.body.userId, createdByUserId: input.actorId },
    );
    await wardenAuditService.record(tx, {
      action: 'link.request',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: input.body.userId ?? null,
      targetMinecraftUuid: account.uuid,
      data: { requestId: request.requestId, username: account.username, cracked: account.cracked },
    });
    return request.requestId;
  });
  return (await views([id]))[0]!;
}

/** Cancels a code an admin made, while it's still waiting. */
async function cancel(input: { id: string; actorId: string }): Promise<WardenManualLinkView> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ request: wardenLinkRequest, code: deviceCode })
      .from(wardenLinkRequest)
      .innerJoin(deviceCode, eq(deviceCode.id, wardenLinkRequest.deviceCodeId))
      .where(and(eq(wardenLinkRequest.id, input.id), isNotNull(wardenLinkRequest.createdByUserId)))
      .for('update');
    if (!row) refuse(404, 'notFound');
    if (row.code.status !== 'pending' || row.code.expiresAt <= new Date()) {
      refuse(409, 'linkRequestClosed');
    }
    await tx.update(deviceCode).set({ status: 'denied' }).where(eq(deviceCode.id, row.code.id));
    await tx
      .update(wardenLinkRequest)
      .set({ cancelledAt: new Date() })
      .where(eq(wardenLinkRequest.id, input.id));
    await wardenAuditService.record(tx, {
      action: 'link.cancel',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: row.request.boundUserId,
      targetMinecraftUuid: row.request.minecraftUuid,
      data: { requestId: input.id, username: row.request.username },
    });
  });
  return (await views([input.id]))[0]!;
}

/** Codes made by hand in the last 7 days, newest first. */
async function recent(): Promise<WardenManualLinkView[]> {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000);
  const rows = await db
    .select({ id: wardenLinkRequest.id })
    .from(wardenLinkRequest)
    .where(
      and(isNotNull(wardenLinkRequest.createdByUserId), gt(wardenLinkRequest.createdAt, since)),
    )
    .orderBy(desc(wardenLinkRequest.createdAt))
    .limit(100);
  return views(rows.map((row) => row.id));
}

const forUser = aliasedTable(user, 'for_user');
const byUser = aliasedTable(user, 'by_user');
const linkedUser = aliasedTable(user, 'linked_user');

async function views(ids: string[]): Promise<WardenManualLinkView[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      request: wardenLinkRequest,
      code: deviceCode,
      forName: forUser.name,
      byName: byUser.name,
      linkedName: linkedUser.name,
    })
    .from(wardenLinkRequest)
    .innerJoin(deviceCode, eq(deviceCode.id, wardenLinkRequest.deviceCodeId))
    .leftJoin(forUser, eq(forUser.id, wardenLinkRequest.boundUserId))
    .leftJoin(byUser, eq(byUser.id, wardenLinkRequest.createdByUserId))
    .leftJoin(linkedUser, eq(linkedUser.id, deviceCode.userId))
    .where(inArray(wardenLinkRequest.id, ids))
    .orderBy(desc(wardenLinkRequest.createdAt));
  const now = new Date();
  const link = new URL('/link', wardenEnv().BETTER_AUTH_URL);
  return rows.map(({ request, code, forName, byName, linkedName }) => {
    const status: WardenManualLinkView['status'] = request.cancelledAt
      ? 'cancelled'
      : code.status === 'approved'
        ? 'linked'
        : code.status === 'denied'
          ? 'denied'
          : code.expiresAt <= now
            ? 'expired'
            : 'pending';
    link.searchParams.set('code', code.userCode);
    return {
      id: request.id,
      userCode: code.userCode,
      createdAt: request.createdAt.toISOString(),
      expiresAt: code.expiresAt.toISOString(),
      verificationUriComplete: link.toString(),
      account: {
        uuid: request.minecraftUuid,
        username: request.username,
        cracked: request.cracked,
      },
      for: request.boundUserId && forName ? { userId: request.boundUserId, name: forName } : null,
      by:
        request.createdByUserId && byName
          ? { userId: request.createdByUserId, name: byName }
          : null,
      status,
      linkedBy:
        status === 'linked' && code.userId && linkedName
          ? { userId: code.userId, name: linkedName }
          : null,
    };
  });
}

/** LNB players of Warden's schools, by name or email, to make a code for. */
async function searchUsers(q: string): Promise<WardenUserOption[]> {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const app = getLinkApp('warden');
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(user)
    .where(or(ilike(user.name, pattern), ilike(user.email, pattern)))
    .orderBy(user.name)
    .limit(20);
  return rows
    .filter((row) => app && canLinkFromSchool(app, row.tenantId))
    .slice(0, 8)
    .map(({ userId, name, email, image }) => ({ userId, name, email, image }));
}

export const wardenManualLinkService = { lookup, create, cancel, recent, searchUsers };
