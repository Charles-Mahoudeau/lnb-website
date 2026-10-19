import { createError } from 'nuxt/server';

import type { ModProblem } from '#shared/schemas/mods';

export function refuse(status: number, problem: ModProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/**
 * The URL the page shows a mod's icon from, or null without one. The key is in the query so a
 * converted mod's new icon isn't hidden by the year-long cache.
 */
export function iconUrl(mod: { id: number; iconKey: string | null }): string | null {
  return mod.iconKey
    ? `/api/minecraft/mods/${String(mod.id)}/icon?v=${encodeURIComponent(mod.iconKey)}`
    : null;
}
