import { z } from 'zod';

const schema = z.object({
  // Given by the BDE office. It must stay on the server. Without one, events can't be pushed to
  // the BDE website, and the form's switch is off.
  BDE_API_TOKEN: z.string().min(1).optional(),
  BDE_API_URL: z.url().default('https://bde-teknantes.fr/api/v1'),
});

export type BdeEnv = z.infer<typeof schema>;

let cached: BdeEnv | undefined;

/** The BDE website settings from the environment, read on first use. */
export function bdeEnv(env: NodeJS.ProcessEnv = process.env): BdeEnv {
  if (cached) return cached;
  const result = schema.safeParse({
    ...env,
    BDE_API_TOKEN: env.BDE_API_TOKEN || undefined,
    BDE_API_URL: env.BDE_API_URL || undefined,
  });
  if (!result.success) {
    throw new Error(`Invalid BDE website environment:\n${z.prettifyError(result.error)}`);
  }
  return (cached = result.data);
}
