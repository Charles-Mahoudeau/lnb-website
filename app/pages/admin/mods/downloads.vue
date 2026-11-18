<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.downloads')" :parents="[{ label: t('admin.nav.mods') }]">
    <AdminDownloads />
  </AdminPage>
</template>
