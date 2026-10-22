import { cpSync } from 'node:fs';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/i18n', '@nuxt/test-utils/module'],

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  // Dark first, see docs/design.md.
  colorMode: {
    preference: 'dark',
  },

  fonts: {
    defaults: {
      weights: [400, 500, 600, 700],
    },
  },

  // English and French. Message files live in i18n/locales/.
  i18n: {
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
    ],
    defaultLocale: 'en',
    // The language never appears in the URL. A first visit follows the browser language, and
    // the choice from the language picker is kept in a cookie so server rendering uses it too.
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'lnb_locale',
      fallbackLocale: 'en',
    },
  },

  future: {
    compatibilityVersion: 5,
  },

  nitro: {
    // Scheduled jobs in server/tasks/.
    experimental: { tasks: true },
    hooks: {
      // The startup migration plugin (server/plugins/migrate.ts) reads the SQL files at runtime.
      compiled: (nitro) => {
        cpSync('server/db/migrations', `${nitro.options.output.serverDir}/migrations`, {
          recursive: true,
        });
      },
    },
    scheduledTasks: {
      '* * * * *': ['events:bde-sync', 'push:deliver'],
      '*/5 * * * *': ['warden:close-stale-sessions'],
      // Every night at 03:00, server time.
      '0 3 * * *': [
        'users:delete-inactive',
        'users:prune-avatars',
        'events:prune-images',
        'partners:prune-logos',
        'push:prune',
      ],
    },
    // Skin heads fetched from Crafatar, cached on disk. See server/services/warden/heads.ts.
    // Mod icons, downloaded once when a mod is added. See server/services/mods/icons.ts.
    // Profile photos from Microsoft, saved at sign-in. See server/services/avatars.ts.
    // Event images, uploaded or picked, and their crops. See server/services/events/images.ts.
    // Partner logos, uploaded by admins. See server/services/partners.ts.
    storage: {
      'warden-heads': { driver: 'fs', base: './.data/warden-heads' },
      'mod-icons': { driver: 'fs', base: './.data/mod-icons' },
      avatars: { driver: 'fs', base: './.data/avatars' },
      'event-images': { driver: 'fs', base: './.data/event-images' },
      'partner-logos': { driver: 'fs', base: './.data/partner-logos' },
    },
    devStorage: {
      'warden-heads': { driver: 'fs', base: './.data/warden-heads' },
      'mod-icons': { driver: 'fs', base: './.data/mod-icons' },
      avatars: { driver: 'fs', base: './.data/avatars' },
      'event-images': { driver: 'fs', base: './.data/event-images' },
      'partner-logos': { driver: 'fs', base: './.data/partner-logos' },
    },
  },

  typescript: {
    // Unit and database tests and tool configs run in plain Node, so they belong to the Node tsconfig.
    // Paths are relative to .nuxt/.
    nodeTsConfig: {
      include: ['../test/unit/**/*', '../test/db/**/*', '../drizzle.config.ts'],
    },
  },

  compatibilityDate: '2026-10-13',

  eslint: {
    config: {
      // Formatting is Prettier's job.
      stylistic: false,
      // Type-aware rules, mainly to catch floating and misused promises.
      typescript: { tsconfigPath: './tsconfig.json' },
    },
  },
});
