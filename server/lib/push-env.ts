import { z } from 'zod';

const schema = z.object({
  // Generate the pair once with: npx web-push generate-vapid-keys. The private key must stay on
  // the server. Without the three, push is off and the pages say so.
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  // A mailto: or https: address the push services can reach, such as mailto:bde@example.com.
  VAPID_SUBJECT: z
    .string()
    .refine((value) => /^(mailto:|https:\/\/)/.test(value))
    .optional(),
});

export type PushEnv = z.infer<typeof schema>;

let cached: PushEnv | undefined;

/** The push settings from the environment, read on first use. */
export function pushEnv(env: NodeJS.ProcessEnv = process.env): PushEnv {
  if (cached) return cached;
  const result = schema.safeParse({
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY || undefined,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY || undefined,
    VAPID_SUBJECT: env.VAPID_SUBJECT || undefined,
  });
  if (!result.success) {
    throw new Error(`Invalid push environment:\n${z.prettifyError(result.error)}`);
  }
  return (cached = result.data);
}

/** Whether the server can send: all three variables are set. */
export function pushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = pushEnv(env);
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}
