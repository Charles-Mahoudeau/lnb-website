<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const id = String(route.params.id);
</script>

<template>
  <AdminPage
    :title="t('admin.shortLinks.detail.title')"
    :parents="[{ label: t('admin.shortLinks.title'), to: '/admin/short-links' }]"
  >
    <AdminShortLinksDetail :id="id" />
  </AdminPage>
</template>
