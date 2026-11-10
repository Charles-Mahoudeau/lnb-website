<script setup lang="ts">
definePageMeta({
  wardenAdmins: true,
  eventsManagers: true,
  economyAdmins: true,
  // The Overview is for site admins. Warden admins start on Warden's players, events managers on
  // the events, economy admins on the economy.
  middleware: () => {
    const { user } = useAuth();
    const role = user.value?.role;
    if (isAdmin(role)) return;
    if (isWardenAdmin(role)) return navigateTo('/admin/warden/players');
    if (isEventsManager(role)) return navigateTo('/admin/events');
    return navigateTo('/admin/economy');
  },
});

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.overview')">
    <AdminOverview />
  </AdminPage>
</template>
