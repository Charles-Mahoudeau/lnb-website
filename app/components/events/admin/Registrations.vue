<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import { EventsAdminAddRegistrationModal, WardenConfirmModal } from '#components';

import type { EventAdminView, EventRegistrationRow } from '#shared/schemas/events';

// Who's registered to an event, then the waitlist in order. Managers add someone by hand,
// remove someone (the waitlist moves up), or export the list.
const props = defineProps<{ event: EventAdminView }>();
const emit = defineEmits<{ changed: [] }>();

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, status, refresh } = await useEventRegistrations(props.event.id);

const columns = computed<TableColumn<EventRegistrationRow>[]>(() => [
  { accessorKey: 'name', header: t('admin.events.registrations.person') },
  { accessorKey: 'school', header: t('admin.events.registrations.school') },
  { accessorKey: 'registeredAt', header: t('admin.events.registrations.registeredAt') },
  { id: 'status', header: t('admin.events.registrations.status') },
  { id: 'actions', meta: { class: { td: 'text-right' } } },
]);

const addModal = overlay.create(EventsAdminAddRegistrationModal);
const confirmModal = overlay.create(WardenConfirmModal);

async function changed() {
  await refresh();
  emit('changed');
}

async function onAdd() {
  if ((await addModal.open({ event: props.event }).result) === true) await changed();
}

async function onRemove(row: EventRegistrationRow) {
  const confirmed: unknown = await confirmModal.open({
    title: t('admin.events.registrations.removeTitle', { name: row.name }),
    description: t(
      row.status === 'registered'
        ? 'admin.events.registrations.removeBody'
        : 'admin.events.registrations.removeWaitlistBody',
    ),
    confirmLabel: t('admin.events.registrations.remove'),
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  try {
    await eventActions.removeRegistration(props.event.id, row.userId);
    toast.add({
      title: t('admin.events.registrations.removed'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await changed();
}

function date(iso: string) {
  return formatEventDate(iso, locale.value, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

const counts = computed(() => {
  const items = data.value?.items ?? [];
  return {
    registered: items.filter((row) => row.status === 'registered').length,
    waitlist: items.filter((row) => row.status === 'waitlist').length,
  };
});
</script>

<template>
  <div class="flex max-w-5xl flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-muted tabular-nums">
        {{
          event.capacity
            ? t('admin.events.registrations.summaryLimited', {
                registered: counts.registered,
                capacity: event.capacity,
              })
            : t('admin.events.registrations.summary', { registered: counts.registered })
        }}{{
          counts.waitlist ? `, ${t('admin.events.list.waiting', { count: counts.waitlist })}` : ''
        }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="!event.cancelledAt"
          size="md"
          color="neutral"
          variant="soft"
          icon="i-lucide-user-plus"
          :label="t('admin.events.registrations.add')"
          @click="onAdd"
        />
        <UButton
          size="md"
          color="neutral"
          variant="ghost"
          icon="i-lucide-download"
          :to="`/api/admin/events/${event.id}/registrations.csv`"
          external
          download
          :label="t('admin.events.registrations.export')"
        />
      </div>
    </div>

    <div class="rounded-lg bg-elevated p-2">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="status === 'pending'"
        :empty="t('admin.events.registrations.empty')"
        class="tabular-nums"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <UAvatar
              :src="row.original.image ?? undefined"
              :alt="row.original.name"
              size="sm"
              :ui="avatarTint(row.original.userId)"
            />
            <div class="flex min-w-0 flex-col">
              <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
              <span class="text-sm text-muted">{{ row.original.email }}</span>
            </div>
          </div>
        </template>
        <template #school-cell="{ row }">
          {{ row.original.school ?? t('admin.users.unknownSchool') }}
        </template>
        <template #registeredAt-cell="{ row }">
          <span>{{ date(row.original.registeredAt) }}</span>
          <span v-if="row.original.addedBy" class="block text-sm text-muted">
            {{ t('admin.events.registrations.addedBy', { name: row.original.addedBy }) }}
          </span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            v-if="row.original.status === 'registered'"
            color="success"
            variant="subtle"
            :label="t('events.statusRegistered')"
          />
          <UBadge
            v-else
            color="warning"
            variant="subtle"
            :label="
              t('admin.events.registrations.waitlistPosition', { position: row.original.position })
            "
          />
        </template>
        <template #actions-cell="{ row }">
          <UButton
            size="md"
            color="error"
            variant="outline"
            :label="t('admin.events.registrations.remove')"
            @click="onRemove(row.original)"
          />
        </template>
      </UTable>
    </div>
  </div>
</template>
