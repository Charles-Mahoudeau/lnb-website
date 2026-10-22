import { z } from 'zod';

const schema = z.object({
  WARDEN_SERVER_SECRET: z.string().min(32),
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
