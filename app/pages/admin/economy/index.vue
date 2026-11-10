<script setup lang="ts">
definePageMeta({ economyAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.economyOverview')" :parents="[{ label: t('admin.nav.economy') }]">
    <AdminEconomyOverview />
  </AdminPage>
</template>
