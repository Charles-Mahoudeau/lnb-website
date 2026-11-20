<script setup lang="ts">
// The Person page (docs/plans/admin-redesign.md): a header with the actions, then one tab per side
// of the person. The tabs and what they show follow the role, and an unknown or forbidden tab
// goes back to the summary. Each tab loads its own data from the routes it already used.
definePageMeta({ wardenAdmins: true, eventsManagers: true, economyAdmins: true });

const { t } = useI18n();
const route = useRoute();
const { user } = useAuth();

const userId = String(route.params.userId);
const { data: summary, error } = await useAdminPersonSummary(userId);

const tabs = computed(() =>
  summary.value ? personTabs(user.value?.role, summary.value.ghost) : [],
);
const tab = computed(() => String(route.params.tab));

// A tab that doesn't exist, or that this role or this kind of account doesn't have.
const known = computed(() => tabs.value.some((item) => item.id === tab.value));
if (summary.value && !known.value) {
  await navigateTo(`/admin/people/${encodeURIComponent(userId)}/summary`, { replace: true });
}
watch(tab, () => {
  if (summary.value && !known.value) {
    void navigateTo(`/admin/people/${encodeURIComponent(userId)}/summary`, { replace: true });
  }
});

const tabItems = computed(() =>
  tabs.value.map((item) => ({
    label: t(item.labelKey),
    to: `/admin/people/${encodeURIComponent(userId)}/${item.id}`,
    exact: true,
  })),
);
</script>

<template>
  <AdminPage
    :title="summary?.name ?? t('admin.nav.people')"
    :parents="[{ label: t('admin.nav.people'), to: '/admin/people' }]"
  >
    <UAlert
      v-if="error || !summary"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.person.loadFailed')"
    />
    <div v-else class="flex flex-col gap-6">
      <AdminPersonHeader :summary="summary" :tab="tab" />
      <AdminTabs :items="tabItems" />
      <template v-if="known">
        <AdminPersonSummaryTab v-if="tab === 'summary'" :summary="summary" />
        <AdminPersonMinecraftTab v-else-if="tab === 'minecraft'" :user-id="userId" />
        <AdminPersonModerationTab v-else-if="tab === 'moderation'" :user-id="userId" />
        <AdminPersonPlaytimeTab v-else-if="tab === 'playtime'" :user-id="userId" />
        <AdminPersonAnticheatTab v-else-if="tab === 'anticheat'" :user-id="userId" />
        <AdminPersonLnbitsTab v-else-if="tab === 'lnbits'" :summary="summary" />
        <AdminPersonEventsTab v-else-if="tab === 'events'" :summary="summary" />
        <AdminPersonAccountTab v-else-if="tab === 'account'" :summary="summary" />
      </template>
    </div>
  </AdminPage>
</template>
