<script setup lang="ts">
// The Quests page of the admin (docs/quests.md): the catalogue, community quests, settings and
// the reward index, as pill tabs.
definePageMeta({ economyAdmins: true });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const TABS = ['catalog', 'community', 'settings', 'index'] as const;
type Tab = (typeof TABS)[number];
const tab = computed<Tab>({
  get: () => (TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'catalog'),
  set: (value) => void router.replace({ query: { tab: value } }),
});
const items = computed(() => [
  { value: 'catalog', label: t('admin.quests.tabs.catalog'), icon: 'i-lucide-list' },
  { value: 'community', label: t('admin.quests.tabs.community'), icon: 'i-lucide-users' },
  {
    value: 'settings',
    label: t('admin.quests.tabs.settings'),
    icon: 'i-lucide-sliders-horizontal',
  },
  { value: 'index', label: t('admin.quests.tabs.index'), icon: 'i-lucide-chart-line' },
]);
</script>

<template>
  <AdminPage :title="t('admin.nav.economyQuests')" :parents="[{ label: t('admin.nav.economy') }]">
    <div class="flex flex-col gap-6">
      <p class="max-w-2xl text-muted">{{ t('admin.quests.lede') }}</p>
      <UTabs v-model="tab" :items="items" variant="pill" :content="false" class="self-start" />
      <AdminQuestsCatalog v-if="tab === 'catalog'" />
      <AdminQuestsCommunity v-else-if="tab === 'community'" />
      <AdminQuestsSettings v-else-if="tab === 'settings'" />
      <AdminQuestsIndex v-else />
    </div>
  </AdminPage>
</template>
