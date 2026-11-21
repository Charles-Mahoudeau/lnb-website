<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const route = useRoute();
const { t } = useI18n();
const { data, error } = await useAdminChangelogPost(String(route.params.id));
</script>

<template>
  <AdminChangelogEditor v-if="data" :post="data" />
  <AdminPage v-else :title="t('admin.nav.changelog')">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.changelog.errors.notFound')"
    />
  </AdminPage>
</template>
