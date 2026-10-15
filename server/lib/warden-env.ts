import { z } from 'zod';

const schema = z.object({
  WARDEN_SERVER_SECRET: z.string().min(32),
  // Player addresses are <token>.<host>, so the host needs a wildcard DNS record.
  WARDEN_SERVER_HOST: z
    .string()
    .regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/, 'a lowercase host name, such as mc.bde-teknantes.fr'),
  BETTER_AUTH_URL: z.url(),
});

export type WardenEnv = z.infer<typeof schema>;

let cached: WardenEnv | undefined;

/**
 * Reads the Warden settings from the environment, on first use so the rest of the site runs
 * without them. Throws with every problem listed if any is missing.
 */
export function wardenEnv(env: NodeJS.ProcessEnv = process.env): WardenEnv {
  if (cached) return cached;
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid Warden environment:\n${z.prettifyError(result.error)}`);
  }
  return (cached = result.data);
}
