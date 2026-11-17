import { createError } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { siteUrl } from '~~/server/lib/site';
import { modpackToolService } from '~~/server/services/modpack/tools';

import type { ModpackTool } from '#shared/schemas/modpack';

/**
 * Sends a first install to the current jar of a tool. The address never changes, so a Prism
 * instance's pre-launch command or the Pelican server's startup script can hardcode it. Once
 * installed, the launcher and the updater update each other through the manifest's hashes. Not
 * cached, so a new release reaches the next install at once.
 */
export async function redirectToTool(event: RequestEvent, tool: ModpackTool): Promise<Response> {
  await requireFlag(event, 'modpack');
  const current = await modpackToolService.current(tool);
  if (!current) {
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: siteUrl(current.url), 'Cache-Control': 'no-cache' },
  });
}
