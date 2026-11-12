<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.anticheat.title')">
    <AdminAnticheatFiles />
  </AdminPage>
</template>
