<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const modlist = useTemplateRef('modlist');
</script>

<template>
  <AdminPage :title="t('admin.nav.modlist')" :parents="[{ label: t('admin.nav.mods') }]">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.modlist.add.button')"
        @click="modlist?.add()"
      />
    </template>
    <AdminModlist ref="modlist" />
  </AdminPage>
</template>
