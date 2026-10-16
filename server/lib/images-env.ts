import { z } from 'zod';

const schema = z.object({
  // From steamgriddb.com/profile/preferences/api. It must stay on the server. Without one, the
  // event image picker offers uploads and links only.
  STEAMGRIDDB_API_KEY: z.string().min(1).optional(),
});

export type ImagesEnv = z.infer<typeof schema>;

let cached: ImagesEnv | undefined;

/** The event image settings from the environment, read on first use. */
export function imagesEnv(env: NodeJS.ProcessEnv = process.env): ImagesEnv {
  if (cached) return cached;
  const result = schema.safeParse({
    ...env,
    STEAMGRIDDB_API_KEY: env.STEAMGRIDDB_API_KEY || undefined,
  });
  if (!result.success) {
    throw new Error(`Invalid event images environment:\n${z.prettifyError(result.error)}`);
  }
  return (cached = result.data);
}
