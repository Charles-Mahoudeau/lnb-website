<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import { EventsAdminRoomModal } from '#components';

import type { EventRoomView } from '#shared/schemas/events';

// The rooms events can pick from. Archived rooms stay on their events and leave the form's list.
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();

// Not awaited yet: defineExpose has to come before the first await.
const rooms = useEventRooms();
const { data, status, refresh } = rooms;

const columns = computed<TableColumn<EventRoomView>[]>(() => [
  { accessorKey: 'name', header: t('admin.events.rooms.name') },
  { accessorKey: 'details', header: t('admin.events.rooms.details') },
  { id: 'actions', meta: { class: { td: 'text-right whitespace-nowrap' } } },
]);

const modal = overlay.create(EventsAdminRoomModal);

async function onAdd() {
  if (await modal.open().result) await refresh();
}

async function onEdit(room: EventRoomView) {
  if (await modal.open({ room }).result) await refresh();
}

async function onArchive(room: EventRoomView, archived: boolean) {
  try {
    await eventAdminActions.updateRoom(room.id, { archived });
    toast.add({
      title: t(archived ? 'admin.events.rooms.archived' : 'admin.events.rooms.restored'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

defineExpose({ onAdd });
await rooms;
</script>

<template>
  <div class="rounded-lg bg-elevated p-2">
    <UTable
      :data="data?.items ?? []"
      :columns="columns"
      :loading="status === 'pending'"
      :empty="t('admin.events.rooms.empty')"
    >
      <template #name-cell="{ row }">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
          <UBadge
            v-if="row.original.archived"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('admin.events.archivedBadge')"
          />
        </div>
      </template>
      <template #details-cell="{ row }">
        <span class="text-muted">{{ row.original.details ?? '' }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('admin.events.edit')"
            @click="onEdit(row.original)"
          />
          <UButton
            size="md"
            color="neutral"
            variant="soft"
            :label="t(row.original.archived ? 'admin.events.restore' : 'admin.events.archive')"
            @click="onArchive(row.original, !row.original.archived)"
          />
        </div>
      </template>
    </UTable>
  </div>
</template>
