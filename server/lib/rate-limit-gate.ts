// No Nuxt imports here: auth.ts uses this, and the Better Auth CLI loads auth.ts. The Nitro
// plugin server/plugins/rate-limit-mode.ts plugs the mode service in at startup, like the flags.
import type { RateLimitMode } from '../../shared/rate-limit.ts';

export type RateLimitModeReader = () => Promise<RateLimitMode>;

let reader: RateLimitModeReader | undefined;

export function setRateLimitModeReader(next: RateLimitModeReader): void {
  reader = next;
}

/** Whether the admin picked the Off mode. It is never off until the reader is plugged in (the CLI, tests). */
export async function isRateLimitOff(): Promise<boolean> {
  return reader ? (await reader()) === 'off' : false;
}
