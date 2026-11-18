<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.map.title')">
    <AdminMap />
  </AdminPage>
</template>
