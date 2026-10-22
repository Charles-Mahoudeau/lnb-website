<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.rateLimit')">
    <AdminRateLimit />
  </AdminPage>
</template>
