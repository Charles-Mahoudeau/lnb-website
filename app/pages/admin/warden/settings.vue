<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.settings')" :parents="[{ label: t('admin.nav.warden') }]">
    <WardenAdminSettings />
  </AdminPage>
</template>
