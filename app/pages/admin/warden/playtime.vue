<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

// The tabs are in the hash, so a link can open one.
const TABS = ['rules', 'closures', 'live'] as const;
type Tab = (typeof TABS)[number];
const tab = computed<Tab>({
  get: () => TABS.find((id) => route.hash === `#${id}`) ?? 'rules',
  set: (id) => void router.replace({ hash: `#${id}` }),
});
const items = computed(() =>
  TABS.map((id) => ({ label: t(`admin.playtime.tabs.${id}`), value: id })),
);
</script>

<template>
  <AdminPage
    :title="t('admin.playtime.title')"
    :parents="[{ label: t('admin.nav.warden'), to: '/admin/warden' }]"
  >
    <div class="flex flex-col gap-6">
      <UTabs v-model="tab" :items="items" :content="false" class="max-w-4xl" />
      <AdminPlaytimeRules v-if="tab === 'rules'" />
      <AdminPlaytimeClosures v-else-if="tab === 'closures'" />
      <AdminPlaytimeLive v-else />
    </div>
  </AdminPage>
</template>
