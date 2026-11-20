import { createError, getQuery, readBody } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';
import type { z } from 'zod';

import { legacyRequestToCents } from '~~/server/lib/economy-units';

// Not readValidatedBody or getRouterParams from nuxt/server: in Nuxt 4.6 they pull the app's
// error module, and with it app.config.ts, into the server bundle, which then fails on every
// request with "defineAppConfig is not defined".

/**
 * The JSON body, checked with a shared schema. Throws a 400 if it doesn't match. A Minecraft
 * server request in legacy units (no `X-Economy-Units: cents`) has its money fields, whole LNBits,
 * turned into cents first, so every schema checks cents (server/lib/economy-units.ts).
 */
export async function parseBody<T extends z.ZodType>(
  event: RequestEvent,
  schema: T,
): Promise<z.output<T>> {
  let body: unknown = await readBody(event);
  if (event.context.economyUnits === 'lnbits') {
    body = legacyRequestToCents(new URL(event.req.url, 'http://localhost').pathname, body);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw createError({ status: 400, statusText: 'Bad Request' });
  return result.data;
}

/** The route's dynamic segments, checked with a schema. Throws a 404 if they don't match. */
export function parseParams<T extends z.ZodType>(event: RequestEvent, schema: T): z.output<T> {
  const result = schema.safeParse(event.context.params ?? {});
  if (!result.success) throw createError({ status: 404, statusText: 'Not Found' });
  return result.data;
}

/** The query string, checked with a schema. Throws a 400 if it doesn't match. */
export function parseQuery<T extends z.ZodType>(event: RequestEvent, schema: T): z.output<T> {
  const result = schema.safeParse(getQuery(event));
  if (!result.success) throw createError({ status: 400, statusText: 'Bad Request' });
  return result.data;
}
