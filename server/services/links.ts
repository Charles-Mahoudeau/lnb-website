import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { deviceCode } from '~~/server/db/schema';
import { auth } from '~~/server/lib/auth';
import { wardenDeviceLinkService } from '~~/server/services/warden/device-links';
import { wardenLinkService } from '~~/server/services/warden/links';

import type { LinkApproveBody, LinkProblem } from '#shared/schemas/link';
import { canLinkFromSchool, getLinkApp, isAllowedRedirect } from '#shared/utils/link-apps';

function refuse(status: number, problem: LinkProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/**
 * Approves a link code for the signed-in user. Replaces Better Auth's /device/approve
 * (disabled in server/lib/auth.ts) so the app's school and redirect rules can't be skipped.
 *
 * Apps whose own server creates the codes (Warden) get no token: approving runs the app's own
 * linking, then sends the person to the app's redirectAfterLink.
 *
 * Otherwise, the redirect is the app's redirect_uri if the link had one, else the app's
 * redirectAfterLink.
 * Without either, the app gets its token by polling /device/token. With one, the code is
 * redeemed here and the token goes in the redirect URL, so the app's polling then fails.
 */
async function approve(input: {
  actor: { id: string; tenantId: string };
  body: LinkApproveBody;
}): Promise<{ redirectTo?: string }> {
  const { actor, body } = input;

  const redirectTarget = await db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(deviceCode)
      .where(eq(deviceCode.userCode, body.userCode))
      .for('update');

    // The page checks the code first (GET /device), which claims it for this user.
    const app = getLinkApp(code?.clientId);
    if (!code || code.userId !== actor.id || !app) refuse(400, 'unknown');
    if (code.expiresAt < new Date()) refuse(400, 'expired');
    if (code.status !== 'pending') refuse(400, 'used');
    if (!canLinkFromSchool(app, actor.tenantId)) refuse(403, 'schoolNotAllowed');
    if (body.redirectUri !== undefined && !isAllowedRedirect(app, body.redirectUri)) {
      refuse(400, 'invalidRedirect');
    }

    if (app.issuedByServer) {
      const device = await wardenDeviceLinkService.decide(tx, {
        actorId: actor.id,
        deviceCodeId: code.id,
        decision: 'approved',
      });
      if (device.handled) return { path: app.redirectAfterLink };
      const problem = await wardenLinkService.approve(tx, {
        actorId: actor.id,
        deviceCodeId: code.id,
      });
      if (problem) refuse(problem === 'unknown' ? 400 : 409, problem);
      return { path: app.redirectAfterLink };
    }

    const target = body.redirectUri ?? app.redirectAfterLink;
    if (target === undefined) {
      await tx.update(deviceCode).set({ status: 'approved' }).where(eq(deviceCode.id, code.id));
      return undefined;
    }
    await tx.delete(deviceCode).where(eq(deviceCode.id, code.id));
    return target;
  });

  if (redirectTarget === undefined) return {};
  // Linked without a token: just send the person on.
  if (typeof redirectTarget === 'object') {
    return redirectTarget.path === undefined ? {} : { redirectTo: redirectTarget.path };
  }

  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(actor.id);
  // Paths stay relative, so they work on any host the site runs on.
  const isPath = redirectTarget.startsWith('/');
  const url = new URL(redirectTarget, 'http://link.invalid');
  url.searchParams.set('access_token', session.token);
  url.searchParams.set('token_type', 'Bearer');
  url.searchParams.set(
    'expires_in',
    String(Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
  );
  if (body.state !== undefined) url.searchParams.set('state', body.state);
  return { redirectTo: isPath ? `${url.pathname}${url.search}` : url.toString() };
}

/**
 * Denies a link code for the signed-in user. Replaces Better Auth's /device/deny (disabled in
 * server/lib/auth.ts) so the denial of a Warden device is audited like its approval.
 */
async function deny(input: { actor: { id: string }; userCode: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(deviceCode)
      .where(eq(deviceCode.userCode, input.userCode))
      .for('update');
    if (!code || code.userId !== input.actor.id || !getLinkApp(code.clientId)) {
      refuse(400, 'unknown');
    }
    if (code.expiresAt < new Date()) refuse(400, 'expired');
    if (code.status !== 'pending') refuse(400, 'used');
    const device = await wardenDeviceLinkService.decide(tx, {
      actorId: input.actor.id,
      deviceCodeId: code.id,
      decision: 'denied',
    });
    if (!device.handled) {
      await tx.update(deviceCode).set({ status: 'denied' }).where(eq(deviceCode.id, code.id));
    }
  });
}

export const linkService = { approve, deny };
