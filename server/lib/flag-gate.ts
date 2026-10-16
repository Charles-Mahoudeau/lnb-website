// No Nuxt imports here: auth.ts uses this, and the Better Auth CLI loads auth.ts. The Nitro
// plugin server/plugins/flags.ts plugs the flags service in at startup, like the avatar store.
import type { FlagKey } from '../../shared/flags.ts';

export type FlagReader = (key: FlagKey) => Promise<boolean>;

let reader: FlagReader | undefined;

export function setFlagReader(next: FlagReader): void {
  reader = next;
}

/** Whether a flag is on. Everything is on until the reader is plugged in (the CLI, tests). */
export async function isFlagOn(key: FlagKey): Promise<boolean> {
  return reader ? reader(key) : true;
}
