<script setup lang="ts">
import type { EventBody } from '#shared/schemas/events';

definePageMeta({ eventsManagers: true });

const { t } = useI18n();
const toast = useToast();
const pending = ref(false);

async function onSubmit(body: EventBody) {
  pending.value = true;
  try {
    const { id } = await eventActions.create(body);
    toast.add({
      title: t('admin.events.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await navigateTo(`/admin/events/${id}`);
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <AdminPage
    :title="t('admin.events.new')"
    :parents="[{ label: t('admin.nav.events'), to: '/admin/events' }]"
  >
    <template #actions>
      <UButton
        type="submit"
        form="event-form"
        :loading="pending"
        :label="t('admin.events.create')"
      />
    </template>
    <EventsAdminForm class="max-w-7xl" @submit="onSubmit" />
  </AdminPage>
</template>
