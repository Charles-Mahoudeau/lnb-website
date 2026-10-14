<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale';

const { t, locale, setLocale } = useI18n();
const localePath = useLocalePath();
const i18nHead = useLocaleHead();

// Nuxt UI's own strings (close buttons, empty states...) follow the site language.
const uiLocales = { en, fr };
const uiLocale = computed(() => uiLocales[locale.value]);

async function changeLocale(code: string) {
  if (code === 'en' || code === 'fr') {
    await setLocale(code);
  }
}

useHead({
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
    <UHeader :title="t('site.name')" :to="localePath('index')">
      <template #title>
        <img src="/logo.svg" alt="" class="size-8 dark:hidden" />
        <img src="/logo-dark.svg" alt="" class="hidden size-8 dark:block" />
        <span>{{ t('site.name') }}</span>
      </template>
      <template #right>
        <ULocaleSelect
          :model-value="locale"
          :locales="[en, fr]"
          :aria-label="t('language')"
          size="md"
          variant="ghost"
          @update:model-value="changeLocale"
        />
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">© {{ new Date().getFullYear() }} {{ t('site.name') }}</p>
      </template>
    </UFooter>
  </UApp>
</template>
