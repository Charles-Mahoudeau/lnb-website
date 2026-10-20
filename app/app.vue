<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale';

const { t, locale } = useI18n();
const i18nHead = useLocaleHead();

// Nuxt UI's own strings (close buttons, empty states...) follow the site language.
const uiLocales = { en, fr };
const uiLocale = computed(() => uiLocales[locale.value]);

// Pages set a bare title; the home page keeps the full site name.
useHead({
  titleTemplate: (title) =>
    !title || title === t('site.name') ? t('site.name') : `LNB · ${title}`,
  link: () => [
    { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
    { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
    ...i18nHead.value.link,
  ],
  meta: () => i18nHead.value.meta,
  htmlAttrs: { lang: () => i18nHead.value.htmlAttrs.lang },
});

useSeoMeta({
  title: () => t('site.name'),
  description: () => t('site.description'),
  ogTitle: () => t('site.name'),
  ogDescription: () => t('site.description'),
});
</script>

<template>
  <UApp :locale="uiLocale">
    <!-- layouts/default.vue for the site, layouts/admin.vue for /admin. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
