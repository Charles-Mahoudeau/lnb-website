<script setup lang="ts">
// A shared account's page (docs/economy.md): a header with the actions, then Overview, Members,
// Transactions and Licenses. A personal account has no page of its own: it is the LNBits tab of
// its owner's Person page, and an unknown tab goes back to the overview.
definePageMeta({ economyAdmins: true });

const TABS = ['overview', 'members', 'transactions', 'licenses'] as const;

const { t } = useI18n();
const route = useRoute();
const id = String(route.params.id);
const { data, error, refresh } = await useEconomyAdminAccount(id);

if (data.value?.kind === 'personal') {
  await navigateTo(
    data.value.owner
      ? `/admin/people/${encodeURIComponent(data.value.owner.userId)}/lnbits`
      : '/admin/economy/accounts',
    { replace: true },
  );
}

const tab = computed(() => String(route.params.tab));
if (!TABS.some((item) => item === tab.value)) {
  await navigateTo(`/admin/economy/accounts/${encodeURIComponent(id)}/overview`, { replace: true });
}

const tabItems = computed(() =>
  TABS.map((item) => ({
    label: t(`admin.economy.account.tabs.${item}`),
    to: `/admin/economy/accounts/${encodeURIComponent(id)}/${item}`,
    exact: true,
  })),
);

// Bumped when money moved, so the history loads again.
const version = ref(0);
async function onChanged() {
  version.value++;
  await refresh();
}
</script>

<template>
  <AdminPage
    :title="data?.name ?? t('admin.economy.account.title')"
    :parents="[
      { label: t('admin.nav.economy'), to: '/admin/economy' },
      { label: t('admin.nav.accounts'), to: '/admin/economy/accounts' },
    ]"
  >
    <UAlert
      v-if="error || !data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.economy.loadFailed')"
    />
    <div v-else class="flex flex-col gap-6">
      <AdminEconomySharedHeader :account="data" @changed="onChanged" />
      <AdminTabs :items="tabItems" />
      <AdminEconomySharedOverview v-if="tab === 'overview'" :id="id" :account="data" />
      <AdminEconomySharedMembers v-else-if="tab === 'members'" :account="data" />
      <AdminEconomyHistory
        v-else-if="tab === 'transactions'"
        :id="id"
        :closed="data.closed"
        :version="version"
        @changed="refresh"
      />
      <AdminEconomySharedLicenses
        v-else-if="tab === 'licenses'"
        :account="data"
        @changed="refresh"
      />
    </div>
  </AdminPage>
</template>
