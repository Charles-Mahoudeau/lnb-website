import { defineEventHandler } from 'nuxt/server';

// The launcher's stable address for the manifest. Not under /api, so it isn't in the API
// reference: it is the same document as /api/minecraft/modpack/manifest.
export default defineEventHandler((event) => sendModpackManifest(event));
