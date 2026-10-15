<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const official = useTemplateRef('official');
</script>

<template>
  <AdminPage :title="t('admin.nav.modList')" :parents="[{ label: t('admin.nav.mods') }]">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.mods.official.add')"
        @click="official?.onAdd()"
      />
    </template>
    <div class="flex max-w-5xl flex-col gap-6">
      <ModsAdminSettings />
      <ModsAdminOfficial ref="official" />
    </div>
  </AdminPage>
</template>
