<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.modSuggestions')" :parents="[{ label: t('admin.nav.mods') }]">
    <div class="max-w-6xl">
      <ModsAdminSuggestions />
    </div>
  </AdminPage>
</template>
