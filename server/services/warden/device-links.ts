import { timingSafeEqual } from 'node:crypto';

import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { deviceCode, user, wardenDeviceRequest } from '~~/server/db/schema';
import { generateDeviceCode } from '~~/server/lib/link-codes';
import { wardenEnv } from '~~/server/lib/warden-env';

import { wardenAuditService } from './audit';
import {
  insertDeviceCode,
  LINK_CODE_LIFETIME_SECONDS,
  POLL_INTERVAL_SECONDS,
  WARDEN_CLIENT_ID,
} from './codes';
import { wardenDeviceService } from './devices';
import { hashSecret } from './rules';
import { refuse } from './shared';
import type { Tx } from './shared';

import type { LinkProblem } from '#shared/schemas/link';
import type {
  WardenClientLinkRequest,
  WardenClientLinkRequestBody,
  WardenClientPoll,
  WardenLinkPreview,
} from '#shared/schemas/warden';

/** An approved request can be collected this long after its code expired. */
const APPROVED_GRACE_MS = 5 * 60 * 1000;

/** Asks to link a device. The mod keeps the poll secret and shows the code to the person. */
async function create(body: WardenClientLinkRequestBody): Promise<WardenClientLinkRequest> {
  const expiresAt = new Date(Date.now() + LINK_CODE_LIFETIME_SECONDS * 1000);
  const pollSecret = generateDeviceCode();
  const { code, request } = await db.transaction(async (tx) => {
    const code = await insertDeviceCode(tx, expiresAt);
    const [request] = await tx
      .insert(wardenDeviceRequest)
      .values({
        deviceCodeId: code.id,
        deviceName: body.deviceName,
        pollSecretHash: hashSecret(pollSecret),
      })
      .returning({ id: wardenDeviceRequest.id });
    return { code, request: request! };
  });

  const verificationUri = new URL('/link', wardenEnv().BETTER_AUTH_URL);
  const complete = new URL(verificationUri);
  complete.searchParams.set('code', code.userCode);
  return {
    requestId: request.id,
    pollSecret,
    userCode: code.userCode,
    verificationUri: verificationUri.toString(),
    verificationUriComplete: complete.toString(),
    expiresAt: expiresAt.toISOString(),
    expiresIn: LINK_CODE_LIFETIME_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  };
}

function secretMatches(sent: string, storedHash: string): boolean {
  return timingSafeEqual(Buffer.from(hashSecret(sent)), Buffer.from(storedHash));
}

/**
 * Where a request stands. Once the person approved it, the first poll creates the device and
 * returns its token, the only time it is shown. A wrong secret looks like an unknown request.
 */
async function poll(requestId: string, pollSecret: string): Promise<WardenClientPoll> {
  const [row] = await db
    .select({
      request: wardenDeviceRequest,
      code: deviceCode,
      userName: user.name,
    })
    .from(wardenDeviceRequest)
    .innerJoin(deviceCode, eq(deviceCode.id, wardenDeviceRequest.deviceCodeId))
    .leftJoin(user, eq(user.id, deviceCode.userId))
    .where(eq(wardenDeviceRequest.id, requestId));
  if (!row || !secretMatches(pollSecret, row.request.pollSecretHash)) refuse(404, 'notFound');

  // One poll per interval, counted by the database so parallel polls can't both pass.
  const [accepted] = await db
    .update(deviceCode)
    .set({ lastPolledAt: new Date() })
    .where(
      and(
        eq(deviceCode.id, row.code.id),
        or(
          isNull(deviceCode.lastPolledAt),
          lte(deviceCode.lastPolledAt, new Date(Date.now() - POLL_INTERVAL_SECONDS * 1000)),
        ),
      ),
    )
    .returning({ id: deviceCode.id });
  if (!accepted) refuse(429, 'slowDown');

  const { request, code } = row;
  if (request.redeemedAt) return { status: 'expired' };
  if (code.status === 'denied') return { status: 'denied' };
  const now = Date.now();
  if (code.status !== 'approved') {
    return { status: code.expiresAt.getTime() <= now ? 'expired' : 'pending' };
  }
  if (code.expiresAt.getTime() + APPROVED_GRACE_MS <= now || !code.userId) {
    return { status: 'expired' };
  }

  return db.transaction(async (tx): Promise<WardenClientPoll> => {
    // Only one poll can take the token.
    const [taken] = await tx
      .update(wardenDeviceRequest)
      .set({ redeemedAt: new Date() })
      .where(and(eq(wardenDeviceRequest.id, request.id), isNull(wardenDeviceRequest.redeemedAt)))
      .returning({ id: wardenDeviceRequest.id });
    if (!taken) return { status: 'expired' };
    const { token, device } = await wardenDeviceService.create(tx, {
      userId: code.userId!,
      name: request.deviceName,
    });
    return {
      status: 'approved',
      token,
      expiresAt: device.expiresAt.toISOString(),
      user: { id: code.userId!, name: row.userName ?? '' },
    };
  });
}

/** The device behind a code the user just claimed on /link, or undefined for another kind of code. */
async function preview(input: {
  actorId: string;
  userCode: string;
}): Promise<WardenLinkPreview | undefined> {
  const [row] = await db
    .select({ deviceName: wardenDeviceRequest.deviceName })
    .from(wardenDeviceRequest)
    .innerJoin(deviceCode, eq(deviceCode.id, wardenDeviceRequest.deviceCodeId))
    .where(
      and(
        eq(deviceCode.userCode, input.userCode),
        eq(deviceCode.userId, input.actorId),
        eq(deviceCode.clientId, WARDEN_CLIENT_ID),
        gt(deviceCode.expiresAt, new Date()),
      ),
    );
  return row && { kind: 'device', deviceName: row.deviceName };
}

type Outcome = { handled: false } | { handled: true; problem?: LinkProblem };

/**
 * Approves or denies the code if it is a device request, inside /api/link/approve's or
 * /api/link/deny's transaction, after they checked the code. `handled` is false for other codes.
 * The device itself is made when the mod polls, so nothing here can hand a token to the wrong
 * caller.
 */
async function decide(
  tx: Tx,
  input: { actorId: string; deviceCodeId: string; decision: 'approved' | 'denied' },
): Promise<Outcome> {
  const [request] = await tx
    .select()
    .from(wardenDeviceRequest)
    .where(eq(wardenDeviceRequest.deviceCodeId, input.deviceCodeId))
    .for('update');
  if (!request) return { handled: false };
  await tx
    .update(deviceCode)
    .set({ status: input.decision })
    .where(eq(deviceCode.id, input.deviceCodeId));
  await wardenAuditService.record(tx, {
    action: input.decision === 'approved' ? 'device.link' : 'device.deny',
    actor: { source: 'web', userId: input.actorId },
    targetUserId: input.actorId,
    data: { requestId: request.id, deviceName: request.deviceName },
  });
  return { handled: true };
}

export const wardenDeviceLinkService = { create, poll, preview, decide };
