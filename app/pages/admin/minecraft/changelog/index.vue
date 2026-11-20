<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.changelog')">
    <template #actions>
      <UButton
        to="/admin/minecraft/changelog/new"
        icon="i-lucide-plus"
        size="md"
        :label="t('admin.changelog.add')"
      />
    </template>
    <div class="flex flex-col gap-4">
      <p class="max-w-prose text-muted">{{ t('admin.changelog.note') }}</p>
      <AdminChangelog />
    </div>
  </AdminPage>
</template>
