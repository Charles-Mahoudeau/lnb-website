import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The h3 that Nitro itself runs on, for the tests of the live stream's routes: the site doesn't
// depend on h3, so it is reached the way pnpm laid it out, from nuxt to @nuxt/nitro-server to
// nitropack to the h3 next to it, and never another copy in the store.

export function nitroH3(): string {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const nuxt = realpathSync(join(root, 'node_modules', 'nuxt'));
  const nitroServer = realpathSync(join(nuxt, '..', '@nuxt', 'nitro-server'));
  const nitropack = realpathSync(join(nitroServer, '..', '..', 'nitropack'));
  const h3 = realpathSync(join(nitropack, '..', 'h3'));
  return pathToFileURL(join(h3, 'dist', 'index.mjs')).href;
}
