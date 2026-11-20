<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const files = useTemplateRef('files');
</script>

<template>
  <AdminTabPage entry="modpack" tab="files">
    <template #actions>
      <UButton icon="i-lucide-upload" :label="t('admin.files.upload')" @click="files?.choose()" />
    </template>
    <AdminFiles ref="files" />
  </AdminTabPage>
</template>
