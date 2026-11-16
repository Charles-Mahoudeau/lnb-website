<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const files = useTemplateRef('files');
</script>

<template>
  <AdminPage :title="t('admin.nav.files')" :parents="[{ label: t('admin.nav.mods') }]">
    <template #actions>
      <UButton icon="i-lucide-upload" :label="t('admin.files.upload')" @click="files?.choose()" />
    </template>
    <AdminFiles ref="files" />
  </AdminPage>
</template>
