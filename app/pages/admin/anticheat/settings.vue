<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage
    :title="t('admin.anticheat.settings.title')"
    :parents="[{ label: t('admin.anticheat.title'), to: '/admin/anticheat' }]"
  >
    <AdminAnticheatSettings />
  </AdminPage>
</template>
