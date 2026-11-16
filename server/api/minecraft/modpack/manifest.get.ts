import { defineEventHandler } from 'nuxt/server';

// The modpack manifest. Also served at /modpack/manifest.json (server/routes/modpack).
export default defineEventHandler((event) => sendModpackManifest(event));
