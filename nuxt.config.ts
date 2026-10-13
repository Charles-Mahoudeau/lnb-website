// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils/module'],

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 5,
  },

  typescript: {
    // Unit tests run in plain Node, so they belong to the Node tsconfig. Paths are relative to .nuxt/.
    nodeTsConfig: { include: ['../test/unit/**/*'] },
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
})
