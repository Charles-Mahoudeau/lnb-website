import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetGoParams, gamesplanetGoQuery } from '#shared/schemas/gamesplanet';

// A click on a Gamesplanet link: /go/gp/<game uid or "site">?from=<placement>. It is counted by
// day, placement and game, with nothing about who clicked, then redirects to the game's page with
// the affiliate ref. It only ever redirects to games in our catalog. Not under /api, so it isn't
// in the API reference.
function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export default defineEventHandler(async (event) => {
  const params = gamesplanetGoParams.safeParse(event.context.params);
  if (!params.success) return redirect('/partners');
  const from = gamesplanetGoQuery.safeParse(
    Object.fromEntries(new URL(event.req.url, 'http://localhost').searchParams),
  );
  // Only a real visit is counted, not a link preview or a crawler checking the link.
  const counted = from.success && event.req.method === 'GET';
  const location = await gamesplanetDealsService.follow({
    uid: params.data.uid,
    from: counted ? from.data.from : null,
  });
  return redirect(location ?? '/partners');
});
