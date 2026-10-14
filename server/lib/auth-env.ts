import { z } from 'zod';

import { parseAllowedTenants } from './tenants';

const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),
  AUTH_ALLOWED_TENANTS: z.string().transform(parseAllowedTenants),
});

export type AuthEnv = z.infer<typeof schema>;

/** Reads the auth settings from the environment. Throws with every problem listed if any is missing. */
export function readAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid auth environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
