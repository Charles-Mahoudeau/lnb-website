import { createError } from 'nuxt/server';

import type { ModProblem } from '#shared/schemas/mods';

export function refuse(status: number, problem: ModProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** The URL the page shows a mod's icon from, or null without one. */
export function iconUrl(mod: { id: number; iconKey: string | null }): string | null {
  return mod.iconKey ? `/api/minecraft/mods/${String(mod.id)}/icon` : null;
}
