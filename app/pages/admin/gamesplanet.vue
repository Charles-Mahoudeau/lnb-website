<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.gamesplanet.title')">
    <AdminGamesplanet />
  </AdminPage>
</template>
