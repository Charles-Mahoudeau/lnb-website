import { z } from 'zod';

const schema = z.object({
  // CurseForge only answers with a key from console.curseforge.com, which must stay on the
  // server. Without one, search is Modrinth only.
  CURSEFORGE_API_KEY: z.string().min(1).optional(),
  // Modrinth asks every client to identify itself with a contact.
  MODRINTH_USER_AGENT: z
    .string()
    .min(1)
    .default('Charles-Mahoudeau/lnb-website (https://github.com/Charles-Mahoudeau/lnb-website)'),
});

export type ModsEnv = z.infer<typeof schema>;

let cached: ModsEnv | undefined;

/** The mod list's settings from the environment, read on first use. */
export function modsEnv(env: NodeJS.ProcessEnv = process.env): ModsEnv {
  if (cached) return cached;
  const result = schema.safeParse({
    ...env,
    CURSEFORGE_API_KEY: env.CURSEFORGE_API_KEY || undefined,
  });
  if (!result.success) {
    throw new Error(`Invalid mod list environment:\n${z.prettifyError(result.error)}`);
  }
  return (cached = result.data);
}
