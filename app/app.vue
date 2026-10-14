<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { en, fr } from '@nuxt/ui/locale';

const { t, locale, setLocale } = useI18n();
const localePath = useLocalePath();
const i18nHead = useLocaleHead();
const route = useRoute();
const { user, school, signOut } = useAuth();

// Nuxt UI's own strings (close buttons, empty states...) follow the site language.
const uiLocales = { en, fr };
const uiLocale = computed(() => uiLocales[locale.value]);

async function changeLocale(code: string) {
  if (code === 'en' || code === 'fr') {
    await setLocale(code);
  }
}

// Come back to the current page after signing in.
const signInLink = computed(() =>
  route.name === 'sign-in'
    ? route.fullPath
    : { path: '/sign-in', query: { redirect: route.fullPath } },
);

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.name, description: school.value }],
  [{ label: t('account.title'), icon: 'i-lucide-user', to: '/account' }],
  [{ label: t('auth.signOut'), icon: 'i-lucide-log-out', onSelect: () => void signOut() }],
]);

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
        <UDropdownMenu v-if="user" :items="userMenu" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" size="md" :aria-label="t('auth.accountMenu')">
            <UAvatar :alt="user.name" size="sm" />
          </UButton>
        </UDropdownMenu>
        <UButton
          v-else
          color="neutral"
          variant="outline"
          size="md"
          :label="t('auth.signIn')"
          :to="signInLink"
        />
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
