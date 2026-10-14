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

  typescript: {
    // Unit tests and tool configs run in plain Node, so they belong to the Node tsconfig.
    // Paths are relative to .nuxt/.
    nodeTsConfig: { include: ['../test/unit/**/*', '../drizzle.config.ts'] },
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
