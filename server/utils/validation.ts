import { createError, readBody } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';
import type { z } from 'zod';

// Not readValidatedBody or getRouterParams from nuxt/server: in Nuxt 4.6 they pull the app's
// error module, and with it app.config.ts, into the server bundle, which then fails on every
// request with "defineAppConfig is not defined".

/** The JSON body, checked with a shared schema. Throws a 400 if it doesn't match. */
export async function parseBody<T extends z.ZodType>(
  event: RequestEvent,
  schema: T,
): Promise<z.output<T>> {
  const result = schema.safeParse(await readBody(event));
  if (!result.success) throw createError({ status: 400, statusText: 'Bad Request' });
  return result.data;
}

/** The route's dynamic segments, checked with a schema. Throws a 404 if they don't match. */
export function parseParams<T extends z.ZodType>(event: RequestEvent, schema: T): z.output<T> {
  const result = schema.safeParse(event.context.params ?? {});
  if (!result.success) throw createError({ status: 404, statusText: 'Not Found' });
  return result.data;
}
