<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import { EventsAdminTypeModal } from '#components';

import type { EventTypeView } from '#shared/schemas/events';

// The kinds of events, with their names in both languages and their icon.
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();

// Not awaited yet: defineExpose has to come before the first await.
const types = useEventTypes();
const { data, status, refresh } = types;

const columns = computed<TableColumn<EventTypeView>[]>(() => [
  { accessorKey: 'nameEn', header: t('admin.events.types.nameEn') },
  { accessorKey: 'nameFr', header: t('admin.events.types.nameFr') },
  { id: 'actions', meta: { class: { td: 'text-right whitespace-nowrap' } } },
]);

const modal = overlay.create(EventsAdminTypeModal);

async function onAdd() {
  if (await modal.open().result) await refresh();
}

async function onEdit(type: EventTypeView) {
  if (await modal.open({ type }).result) await refresh();
}

async function onArchive(type: EventTypeView, archived: boolean) {
  try {
    await eventAdminActions.updateType(type.id, { archived });
    toast.add({
      title: t(archived ? 'admin.events.types.archived' : 'admin.events.types.restored'),
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
await types;
</script>

<template>
  <div class="rounded-lg bg-elevated p-2">
    <UTable
      :data="data?.items ?? []"
      :columns="columns"
      :loading="status === 'pending'"
      :empty="t('admin.events.types.empty')"
    >
      <template #nameEn-cell="{ row }">
        <div class="flex flex-wrap items-center gap-3">
          <IconTile :icon="row.original.icon" />
          <span class="font-semibold text-highlighted">{{ row.original.nameEn }}</span>
          <UBadge
            v-if="row.original.archived"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('admin.events.archivedBadge')"
          />
        </div>
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
