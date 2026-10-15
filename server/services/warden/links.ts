import { randomUUID } from 'node:crypto';

import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  deviceCode,
  minecraftAccount,
  minecraftUsername,
  wardenLinkRequest,
  wardenPlayer,
} from '~~/server/db/schema';
import { generateDeviceCode, generateLinkCode } from '~~/server/lib/link-codes';
import { uuidMatchesAccount } from '~~/server/lib/minecraft';
import { wardenEnv } from '~~/server/lib/warden-env';

import { wardenAuditService } from './audit';
import { wardenModerationService } from './moderation';
import { wardenPlayerService } from './players';
import { wardenSettingsService } from './settings';
import { refuse } from './shared';
import type { Tx } from './shared';

import type { LinkProblem } from '#shared/schemas/link';
import type {
  WardenLinkPreview,
  WardenLinkRequest,
  WardenLinkRequestBody,
  WardenLinkRequestStatus,
} from '#shared/schemas/warden';

const CLIENT_ID = 'warden';
const EXPIRES_IN_SECONDS = 10 * 60;
const POLL_INTERVAL_SECONDS = 5;

function toResponse(row: {
  id: string;
  userCode: string;
  expiresAt: Date;
  boundUserId: string | null;
}): WardenLinkRequest {
  const verificationUri = new URL('/link', wardenEnv().BETTER_AUTH_URL);
  const complete = new URL(verificationUri);
  complete.searchParams.set('user_code', row.userCode);
  return {
    requestId: row.id,
    userCode: row.userCode,
    expiresAt: row.expiresAt.toISOString(),
    expiresIn: Math.max(0, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000)),
    interval: POLL_INTERVAL_SECONDS,
    verificationUri: verificationUri.toString(),
    verificationUriComplete: complete.toString(),
    boundToUser: row.boundUserId !== null,
  };
}

/**
 * Creates a link code for a Minecraft account, for the Minecraft server. With a known token,
 * only that player can link it. A pending request for the same account is returned again.
 */
async function create(body: WardenLinkRequestBody, tx?: Tx): Promise<WardenLinkRequest> {
  if (!uuidMatchesAccount(body)) refuse(400, 'invalidUuid');
  const run = async (tx: Tx) => {
    const settings = await wardenSettingsService.get(tx);
    if (body.cracked && !settings.allowCracked) refuse(403, 'crackedNotAllowed');

    const [linked] = await tx
      .select({ uuid: minecraftAccount.uuid })
      .from(minecraftAccount)
      .where(eq(minecraftAccount.uuid, body.uuid));
    if (linked) refuse(409, 'alreadyLinked');

    const bound = body.token ? await wardenPlayerService.findByToken(body.token, tx) : undefined;
    const boundUserId = bound?.userId ?? null;
    if (boundUserId && (await wardenModerationService.activeBan(boundUserId, tx))) {
      refuse(403, 'banned');
    }

    const [pending] = await tx
      .select({
        id: wardenLinkRequest.id,
        userCode: deviceCode.userCode,
        expiresAt: deviceCode.expiresAt,
        boundUserId: wardenLinkRequest.boundUserId,
        username: wardenLinkRequest.username,
        cracked: wardenLinkRequest.cracked,
      })
      .from(wardenLinkRequest)
      .innerJoin(deviceCode, eq(deviceCode.id, wardenLinkRequest.deviceCodeId))
      .where(
        and(
          eq(wardenLinkRequest.minecraftUuid, body.uuid),
          eq(deviceCode.status, 'pending'),
          gt(deviceCode.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(wardenLinkRequest.createdAt))
      .limit(1);
    if (
      pending &&
      pending.boundUserId === boundUserId &&
      pending.username === body.username &&
      pending.cracked === body.cracked
    ) {
      return toResponse(pending);
    }

    const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000);
    const code = await insertDeviceCode(tx, expiresAt);
    const [request] = await tx
      .insert(wardenLinkRequest)
      .values({
        deviceCodeId: code.id,
        minecraftUuid: body.uuid,
        username: body.username,
        cracked: body.cracked,
        boundUserId,
      })
      .returning({ id: wardenLinkRequest.id });
    return toResponse({ id: request!.id, userCode: code.userCode, expiresAt, boundUserId });
  };
  return tx ? run(tx) : db.transaction(run);
}

/** A Better Auth device code for Warden, so /link claims and expires it like any other. */
async function insertDeviceCode(tx: Tx, expiresAt: Date) {
  // A million codes: retry on the rare clash with a live one, inside a savepoint.
  for (let attempt = 0; attempt < 5; attempt++) {
    const values = {
      id: randomUUID(),
      deviceCode: generateDeviceCode(),
      userCode: generateLinkCode(),
      expiresAt,
      status: 'pending',
      pollingInterval: POLL_INTERVAL_SECONDS * 1000,
      clientId: CLIENT_ID,
    };
    const inserted = await tx
      .insert(deviceCode)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: deviceCode.id });
    if (inserted.length) return values;
  }
  throw new Error('Could not find a free link code');
}

/** Where a link request stands, for the Minecraft server. */
async function status(
  id: string,
): Promise<{ status: WardenLinkRequestStatus; userId: string | null }> {
  const [row] = await db
    .select({
      status: deviceCode.status,
      expiresAt: deviceCode.expiresAt,
      userId: deviceCode.userId,
    })
    .from(wardenLinkRequest)
    .innerJoin(deviceCode, eq(deviceCode.id, wardenLinkRequest.deviceCodeId))
    .where(eq(wardenLinkRequest.id, id));
  if (!row) refuse(404, 'notFound');
  if (row.status === 'approved') return { status: 'approved', userId: row.userId };
  if (row.status === 'denied') return { status: 'denied', userId: null };
  if (row.expiresAt <= new Date()) return { status: 'expired', userId: null };
  return { status: 'pending', userId: null };
}

/** The Minecraft account behind a code the user has claimed on /link. */
async function preview(input: { actorId: string; userCode: string }): Promise<WardenLinkPreview> {
  const [row] = await db
    .select({
      uuid: wardenLinkRequest.minecraftUuid,
      username: wardenLinkRequest.username,
      cracked: wardenLinkRequest.cracked,
    })
    .from(wardenLinkRequest)
    .innerJoin(deviceCode, eq(deviceCode.id, wardenLinkRequest.deviceCodeId))
    .where(
      and(
        eq(deviceCode.userCode, input.userCode),
        eq(deviceCode.userId, input.actorId),
        eq(deviceCode.clientId, CLIENT_ID),
      ),
    );
  if (!row) refuse(404, 'notFound');
  return { ...row, limit: await wardenPlayerService.limit(db, input.actorId) };
}

/**
 * Links the account behind an approved Warden code, inside /api/link/approve's transaction, after
 * it checked the code and the school. Returns a problem for /link instead of throwing.
 */
async function approve(
  tx: Tx,
  input: { actorId: string; deviceCodeId: string },
): Promise<LinkProblem | undefined> {
  const [request] = await tx
    .select()
    .from(wardenLinkRequest)
    .where(eq(wardenLinkRequest.deviceCodeId, input.deviceCodeId))
    .for('update');
  if (!request) return 'unknown';
  if (request.boundUserId && request.boundUserId !== input.actorId) return 'wrongAccount';

  const settings = await wardenSettingsService.get(tx);
  if (request.cracked && !settings.allowCracked) return 'unknown';

  // Lock the player row, so two approvals at once can't both pass the limit.
  await wardenPlayerService.ensure(tx, input.actorId);
  await tx
    .select({ userId: wardenPlayer.userId })
    .from(wardenPlayer)
    .where(eq(wardenPlayer.userId, input.actorId))
    .for('update');

  const [taken] = await tx
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, request.minecraftUuid));
  if (taken) return 'minecraftAccountTaken';

  const limit = await wardenPlayerService.limit(tx, input.actorId);
  if (limit.used >= limit.max) return 'accountLimitReached';

  await tx.insert(minecraftAccount).values({
    uuid: request.minecraftUuid,
    userId: input.actorId,
    username: request.username,
    cracked: request.cracked,
  });
  await tx
    .insert(minecraftUsername)
    .values({ minecraftUuid: request.minecraftUuid, username: request.username });
  await tx
    .update(deviceCode)
    .set({ status: 'approved' })
    .where(eq(deviceCode.id, input.deviceCodeId));
  await wardenAuditService.record(tx, {
    action: 'link',
    actor: { source: 'web', userId: input.actorId },
    targetUserId: input.actorId,
    targetMinecraftUuid: request.minecraftUuid,
    data: { requestId: request.id, username: request.username, cracked: request.cracked },
  });
  return undefined;
}

export const wardenLinkService = { create, status, preview, approve };
