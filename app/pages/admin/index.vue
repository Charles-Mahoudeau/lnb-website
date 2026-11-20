<script setup lang="ts">
// Home: the inbox of what is waiting for the role (docs/plans/admin-redesign.md, slice 3).
definePageMeta({ wardenAdmins: true, eventsManagers: true, economyAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.home')">
    <AdminHome />
  </AdminPage>
</template>
