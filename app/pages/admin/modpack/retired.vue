<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const retired = useTemplateRef('retired');
</script>

<template>
  <AdminTabPage entry="modpack" tab="retired">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.retired.add.button')"
        @click="retired?.add()"
      />
    </template>
    <AdminRetired ref="retired" />
  </AdminTabPage>
</template>
