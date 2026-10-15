<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

definePageMeta({ middleware: 'warden-admin' });

const { t } = useI18n();
const route = useRoute();

useSeoMeta({ title: () => t('wardenAdmin.title'), robots: 'noindex' });

// The tab is in the URL (?tab=appeals), so links and the back button keep it.
const TABS = ['players', 'appeals', 'activity', 'settings'] as const;
type Tab = (typeof TABS)[number];
const tab = computed<Tab>({
  get: () => {
    const value = route.query.tab;
    return TABS.includes(value as Tab) ? (value as Tab) : 'players';
  },
  set: (value) => {
    void navigateTo({ query: value === 'players' ? {} : { tab: value } }, { replace: true });
  },
});

const items = computed<TabsItem[]>(() =>
  TABS.map((value) => ({ label: t(`wardenAdmin.tabs.${value}`), value, slot: value })),
);
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-14">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('wardenAdmin.title') }}</h1>
      <p class="max-w-xl text-lg text-muted">{{ t('wardenAdmin.lede') }}</p>
    </div>

    <UTabs
      v-model="tab"
      :items="items"
      variant="pill"
      :ui="{ list: 'w-fit max-w-full overflow-x-auto' }"
    >
      <template #players><WardenAdminPlayers class="pt-4" /></template>
      <template #appeals><WardenAdminAppeals class="pt-4" /></template>
      <template #activity><WardenAdminActivity class="pt-4" /></template>
      <template #settings><WardenAdminSettings class="pt-4" /></template>
    </UTabs>
  </UContainer>
</template>
