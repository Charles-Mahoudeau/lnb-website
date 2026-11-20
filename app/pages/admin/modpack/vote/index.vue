<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const official = useTemplateRef('official');
</script>

<template>
  <AdminTabPage entry="modpack" tab="vote">
    <template #actions>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :label="t('admin.mods.refresh.button')"
        @click="official?.onRefresh()"
      />
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.mods.official.add')"
        @click="official?.onAdd()"
      />
    </template>
    <div class="flex max-w-5xl flex-col gap-6">
      <AdminModpackVoteSwitch />
      <ModsAdminOfficial ref="official" />
    </div>
  </AdminTabPage>
</template>
