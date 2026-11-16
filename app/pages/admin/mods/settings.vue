<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.settings')" :parents="[{ label: t('admin.nav.mods') }]">
    <div class="max-w-5xl">
      <ModsAdminSettings />
    </div>
  </AdminPage>
</template>
