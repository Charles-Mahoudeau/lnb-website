import { defineEventHandler } from 'nuxt/server';

// The launcher's stable address, for first installs. Not under /api, so it isn't in the API
// reference's paths; its entry describes /modpack/launcher.jar.
export default defineEventHandler((event) => redirectToTool(event, 'launcher'));
