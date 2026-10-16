import { createError } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';

import { flagService } from '~~/server/services/flags';

import type { FlagKey } from '#shared/flags';

/** Throws a 503 `disabled` when the feature is switched off. Call it after the auth guard. */
export async function requireFlag(_event: RequestEvent, key: FlagKey): Promise<void> {
  if (!(await flagService.isEnabled(key))) {
    throw createError({
      status: 503,
      statusText: 'disabled',
      data: { problem: 'disabled', flag: key },
    });
  }
}
