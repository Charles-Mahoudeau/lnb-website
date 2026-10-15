<script setup lang="ts">
definePageMeta({
  wardenAdmins: true,
  // The Overview is for site admins. Warden admins start on Warden's players.
  middleware: () => {
    const { user } = useAuth();
    if (!isAdmin(user.value?.role)) return navigateTo('/admin/warden/players');
  },
});

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.overview')">
    <AdminOverview />
  </AdminPage>
</template>
