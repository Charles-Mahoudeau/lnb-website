import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { deviceCode } from '~~/server/db/schema';
import { auth } from '~~/server/lib/auth';

import type { LinkApproveBody, LinkProblem } from '#shared/schemas/link';
import { canLinkFromSchool, getLinkApp, isAllowedRedirect } from '#shared/utils/link-apps';

function refuse(status: number, problem: LinkProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/**
 * Approves a link code for the signed-in user. Replaces Better Auth's /device/approve
 * (disabled in server/lib/auth.ts) so the app's school and redirect rules can't be skipped.
 *
 * The redirect is the app's redirect_uri if the link had one, else the app's redirectAfterLink.
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

    const target = body.redirectUri ?? app.redirectAfterLink;
    if (target === undefined) {
      await tx.update(deviceCode).set({ status: 'approved' }).where(eq(deviceCode.id, code.id));
      return undefined;
    }
    await tx.delete(deviceCode).where(eq(deviceCode.id, code.id));
    return target;
  });

  if (redirectTarget === undefined) return {};

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

export const linkService = { approve };
