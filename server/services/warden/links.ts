import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  deviceCode,
  minecraftAccount,
  minecraftUsername,
  wardenLinkRequest,
  wardenPlayer,
} from '~~/server/db/schema';
import { uuidMatchesUsername } from '~~/server/lib/minecraft';
import { wardenEnv } from '~~/server/lib/warden-env';

import { wardenAuditService } from './audit';
import {
  insertDeviceCode,
  LINK_CODE_LIFETIME_SECONDS as EXPIRES_IN_SECONDS,
  POLL_INTERVAL_SECONDS,
  WARDEN_CLIENT_ID as CLIENT_ID,
} from './codes';
import { wardenDeviceLinkService } from './device-links';
import { wardenModerationService } from './moderation';
import { wardenPlayerService } from './players';
import { refuse } from './shared';
import type { Tx } from './shared';

import type { LinkProblem } from '#shared/schemas/link';
import type {
  WardenLinkPreview,
  WardenLinkRequest,
  WardenLinkRequestBody,
  WardenLinkRequestStatus,
} from '#shared/schemas/warden';

function toResponse(row: {
  id: string;
  userCode: string;
  expiresAt: Date;
  boundUserId: string | null;
}): WardenLinkRequest {
  const verificationUri = new URL('/link', wardenEnv().BETTER_AUTH_URL);
  const complete = new URL(verificationUri);
  complete.searchParams.set('code', row.userCode);
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
 * Creates a link code for a Minecraft account. A known token binds it to that player, and a
 * pending request for the same account is returned again.
 */
async function create(
  body: WardenLinkRequestBody,
  options: { tx?: Tx } = {},
): Promise<WardenLinkRequest> {
  if (!uuidMatchesUsername(body)) refuse(400, 'invalidUuid');
  const run = async (tx: Tx) => {
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
    if (pending && pending.boundUserId === boundUserId && pending.username === body.username) {
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
        boundUserId,
      })
      .returning({ id: wardenLinkRequest.id });
    return toResponse({ id: request!.id, userCode: code.userCode, expiresAt, boundUserId });
  };
  return options.tx ? run(options.tx) : db.transaction(run);
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
  const device = await wardenDeviceLinkService.preview(input);
  if (device) return device;
  const [row] = await db
    .select({
      uuid: wardenLinkRequest.minecraftUuid,
      username: wardenLinkRequest.username,
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
  return { kind: 'minecraft', ...row, limit: await wardenPlayerService.limit(db, input.actorId) };
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
    data: { requestId: request.id, username: request.username },
  });
  return undefined;
}

export const wardenLinkService = { create, status, preview, approve };
