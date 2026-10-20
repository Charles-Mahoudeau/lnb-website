import { defineEventHandler } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';
import { getAuthSession } from '~~/server/utils/auth';

import { shortLinkPublicParams } from '#shared/schemas/short-links';

// The short link itself: /r/<shortId>. Not under /api, so it isn't in the API reference.
// A visitor who can't follow it lands on /short-link with the reason.
function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export default defineEventHandler(async (event) => {
  const parsed = shortLinkPublicParams.safeParse({
    shortId: (event.context.params?.shortId ?? '').toLowerCase(),
  });
  if (!parsed.success) return redirect('/short-link?id=unknown&state=off');
  const { shortId } = parsed.data;
  const session = await getAuthSession(event);
  const result = await shortLinkService.follow({
    shortId,
    viewer: session ? { id: session.user.id, tenantId: session.user.tenantId } : null,
    method: event.req.method,
    userAgent: event.req.headers.get('user-agent') ?? undefined,
  });
  if (result.kind === 'redirect') return redirect(result.url);
  return redirect(`/short-link?id=${encodeURIComponent(shortId)}&state=${result.reason}`);
});
