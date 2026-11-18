<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.rules')" :parents="[{ label: t('admin.nav.warden') }]">
    <AdminRules />
  </AdminPage>
</template>
