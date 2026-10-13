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

  compatibilityDate: '2026-10-13',

  eslint: {
    config: {
      // Formatting is Prettier's job.
      stylistic: false,
    },
  },
})
