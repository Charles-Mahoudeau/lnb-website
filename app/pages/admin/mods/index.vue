<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const { isEnabled } = useFlags();
const modlist = useTemplateRef('modlist');
</script>

<template>
  <AdminPage :title="t('admin.nav.modlist')" :parents="[{ label: t('admin.nav.mods') }]">
    <template #actions>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :label="t('admin.modlist.check')"
        :loading="modlist?.checking"
        @click="modlist?.check()"
      />
      <UButton
        v-if="isEnabled('modList')"
        color="neutral"
        variant="soft"
        icon="i-lucide-arrow-down-to-line"
        :label="t('admin.modlist.export.button')"
        @click="modlist?.exportVote()"
      />
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.modlist.add.button')"
        @click="modlist?.add()"
      />
    </template>
    <AdminModlist ref="modlist" />
  </AdminPage>
</template>
