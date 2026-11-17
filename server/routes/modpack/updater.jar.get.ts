import { defineEventHandler } from 'nuxt/server';

// The updater's stable address, for first installs. See launcher.jar.get.ts.
export default defineEventHandler((event) => redirectToTool(event, 'updater'));
