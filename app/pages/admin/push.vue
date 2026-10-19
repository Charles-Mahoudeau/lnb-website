<script setup lang="ts">
definePageMeta({ eventsManagers: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.push.title')">
    <AdminPush />
  </AdminPage>
</template>
