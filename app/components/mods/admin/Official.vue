<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui';

import {
  ModsAdminAddModal,
  ModsAdminConvertModal,
  ModsAdminEditModal,
  WardenConfirmModal,
} from '#components';

import type { ModAdminRow } from '#shared/schemas/mods';

// The official list, by score, with adding and removing mods.
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();

// Not awaited yet: defineExpose has to come before the first await.
const list = useModAdminList('official', ref('visible'));
const { data, status, refresh } = list;

const columns = computed<TableColumn<ModAdminRow>[]>(() => [
  { accessorKey: 'name', header: t('admin.mods.official.mod') },
  { accessorKey: 'source', header: t('admin.mods.official.source') },
  {
    accessorKey: 'score',
    header: t('admin.mods.official.score'),
    meta: { class: { th: 'text-right', td: 'text-right font-semibold text-highlighted' } },
  },
  {
    accessorKey: 'up',
    header: t('admin.mods.official.up'),
    meta: { class: { th: 'text-right', td: 'text-right text-muted' } },
  },
  {
    accessorKey: 'down',
    header: t('admin.mods.official.down'),
    meta: { class: { th: 'text-right', td: 'text-right text-muted' } },
  },
  { accessorKey: 'createdAt', header: t('admin.mods.official.added') },
  { id: 'actions', meta: { class: { td: 'text-right whitespace-nowrap' } } },
]);

const addModal = overlay.create(ModsAdminAddModal);
const editModal = overlay.create(ModsAdminEditModal);
const convertModal = overlay.create(ModsAdminConvertModal);
const confirmModal = overlay.create(WardenConfirmModal);

async function onEdit(row: ModAdminRow) {
  if ((await editModal.open({ mod: row }).result) === true) await refresh();
}

async function onConvert(row: ModAdminRow) {
  if ((await convertModal.open({ mod: row }).result) === true) await refresh();
}

function menu(row: ModAdminRow): DropdownMenuItem[] {
  return [
    {
      label: t('admin.mods.official.edit'),
      icon: 'i-lucide-pencil',
      onSelect: () => void onEdit(row),
    },
    {
      label: t('admin.mods.official.convert'),
      icon: 'i-lucide-repeat',
      onSelect: () => void onConvert(row),
    },
  ];
}

async function onAdd() {
  if ((await addModal.open().result) === true) await refresh();
}

async function onRemove(row: ModAdminRow) {
  const confirmed: unknown = await confirmModal.open({
    title: t('admin.mods.official.removeTitle', { name: row.name }),
    description: t('admin.mods.official.removeBody'),
    confirmLabel: t('admin.mods.official.remove'),
    cancelLabel: t('mods.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  try {
    await modAdminActions.deleteOfficial(row.id);
    toast.add({
      title: t('admin.mods.official.removed'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof ModError ? error.problem : 'failed';
    toast.add({
      title: t(`mods.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

defineExpose({ onAdd });
await list;
</script>

<template>
  <div class="rounded-lg bg-elevated p-2">
    <UTable
      :data="data?.items ?? []"
      :columns="columns"
      :loading="status === 'pending'"
      :empty="t('admin.mods.official.empty')"
      class="tabular-nums"
    >
      <template #name-cell="{ row }">
        <div class="flex items-center gap-3">
          <ModsIcon :name="row.original.name" :src="row.original.iconUrl" size="sm" />
          <div class="flex min-w-0 flex-col">
            <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
            <span v-if="row.original.promotedAt" class="text-sm text-muted">
              {{ t('admin.mods.official.fromSuggestion') }}
            </span>
          </div>
        </div>
      </template>
      <template #source-cell="{ row }">
        {{ t(`mods.sources.${row.original.source}`) }}
      </template>
      <template #createdAt-cell="{ row }">
        {{ formatWardenDate(row.original.createdAt, locale) }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :to="row.original.pageUrl"
            target="_blank"
            :label="t('admin.mods.official.openPage')"
          />
          <UDropdownMenu :items="menu(row.original)">
            <UButton
              size="md"
              color="neutral"
              variant="outline"
              icon="i-lucide-ellipsis"
              :aria-label="t('admin.mods.more')"
            />
          </UDropdownMenu>
          <UButton
            size="md"
            color="error"
            variant="outline"
            :label="t('admin.mods.official.remove')"
            @click="onRemove(row.original)"
          />
        </div>
      </template>
    </UTable>
  </div>
</template>
