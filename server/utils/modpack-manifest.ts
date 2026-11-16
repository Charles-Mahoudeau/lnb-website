import { getRequestHeader } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { modpackManifestService } from '~~/server/services/modpack/manifest';

/**
 * Answers a manifest request, for both of its addresses. The ETag comes from the content, so a
 * launcher that sends it back gets a 304. Short cache: an admin's change should reach launchers
 * within minutes.
 */
export async function sendModpackManifest(event: RequestEvent): Promise<Response> {
  await requireFlag(event, 'modpack');
  const { body, etag } = await modpackManifestService.render();
  const headers = {
    ETag: etag,
    'Cache-Control': 'public, max-age=60, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };
  if (getRequestHeader(event, 'if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
