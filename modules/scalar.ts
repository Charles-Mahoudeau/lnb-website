import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { addTemplate, defineNuxtModule } from 'nuxt/kit';

// Serves Scalar's standalone script for the API reference (server/api/docs.get.ts) from this
// site, so the page loads nothing from a CDN. Only the one script is copied, not the package.
// The URL carries Scalar's version, so it can be cached for good.
export default defineNuxtModule({
  meta: { name: 'scalar' },
  async setup(_options, nuxt) {
    const source = join(nuxt.options.rootDir, 'node_modules/@scalar/api-reference');
    const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as {
      version: string;
    };

    // A template, so it's written after Nuxt clears the build directory.
    const { dst } = addTemplate({
      filename: 'scalar/standalone.js',
      getContents: () => readFile(join(source, 'dist/browser/standalone.js'), 'utf8'),
      write: true,
    });

    const baseURL = `/_scalar/${version}`;
    nuxt.options.nitro.publicAssets ??= [];
    nuxt.options.nitro.publicAssets.push({
      dir: dirname(dst),
      baseURL,
      maxAge: 60 * 60 * 24 * 365,
    });
    nuxt.options.runtimeConfig.scalarScript = `${baseURL}/standalone.js`;
  },
});
