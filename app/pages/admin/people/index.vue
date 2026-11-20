<script setup lang="ts">
// People: everyone, for the four admin roles. The list and the Person page cut their data by role.
definePageMeta({ wardenAdmins: true, eventsManagers: true, economyAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.people')">
    <AdminPeople />
  </AdminPage>
</template>
