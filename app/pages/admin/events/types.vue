<script setup lang="ts">
definePageMeta({ eventsManagers: true });

const { t } = useI18n();
const list = useTemplateRef('list');
</script>

<template>
  <AdminPage :title="t('admin.nav.eventTypes')" :parents="[{ label: t('admin.nav.events') }]">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('admin.events.types.add')" @click="list?.onAdd()" />
    </template>
    <div class="flex max-w-4xl flex-col gap-6">
      <p class="text-muted">{{ t('admin.events.types.lede') }}</p>
      <EventsAdminTypes ref="list" />
    </div>
  </AdminPage>
</template>
