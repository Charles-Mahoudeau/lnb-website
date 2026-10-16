<script setup lang="ts">
definePageMeta({
  wardenAdmins: true,
  eventsManagers: true,
  // The Overview is for site admins. Warden admins start on Warden's players, events managers on
  // their rooms until the events list exists.
  middleware: () => {
    const { user } = useAuth();
    const role = user.value?.role;
    if (isAdmin(role)) return;
    return navigateTo(isWardenAdmin(role) ? '/admin/warden/players' : '/admin/events/rooms');
  },
});

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.overview')">
    <AdminOverview />
  </AdminPage>
</template>
