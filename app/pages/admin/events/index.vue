<script setup lang="ts">
definePageMeta({ eventsManagers: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage :title="t('admin.nav.eventList')" :parents="[{ label: t('admin.nav.events') }]">
    <template #actions>
      <UButton to="/admin/events/new" icon="i-lucide-plus" :label="t('admin.events.new')" />
    </template>
    <div class="max-w-6xl">
      <EventsAdminList />
    </div>
  </AdminPage>
</template>
