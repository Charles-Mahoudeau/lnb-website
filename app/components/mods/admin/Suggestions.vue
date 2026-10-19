<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, TabsItem } from '@nuxt/ui';

import { ModsAdminConvertModal, ModsAdminEditModal, ModsAdminRemoveModal } from '#components';

import type { ModAdminRow } from '#shared/schemas/mods';

// Suggestions, by score: promote them to the official list, remove them with a reason, or
// restore removed ones.
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const view = ref<'visible' | 'removed'>('visible');
const { data, status, refresh } = await useModAdminList('suggestion', view);

const tabs = computed<TabsItem[]>(() => [
  { label: t('admin.mods.suggestions.visible'), value: 'visible' },
  { label: t('admin.mods.suggestions.removed'), value: 'removed' },
]);

const columns = computed<TableColumn<ModAdminRow>[]>(() => [
  { accessorKey: 'name', header: t('admin.mods.suggestions.mod') },
  { id: 'proposer', header: t('admin.mods.suggestions.proposer') },
  {
    accessorKey: 'reason',
    header: t('admin.mods.suggestions.reason'),
    meta: { class: { td: 'min-w-64 whitespace-normal' } },
  },
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
  { id: 'actions', meta: { class: { td: 'text-right' } } },
]);

const removeModal = overlay.create(ModsAdminRemoveModal);
const editModal = overlay.create(ModsAdminEditModal);
const convertModal = overlay.create(ModsAdminConvertModal);

function menu(row: ModAdminRow): DropdownMenuItem[] {
  return [
    {
      label: t('admin.mods.suggestions.edit'),
      icon: 'i-lucide-pencil',
      onSelect: () => {
        void editModal.open({ mod: row }).result.then(async (saved) => {
          if (saved === true) await refresh();
        });
      },
    },
    {
      label: t('admin.mods.suggestions.convert'),
      icon: 'i-lucide-repeat',
      onSelect: () => {
        void convertModal.open({ mod: row }).result.then(async (done) => {
          if (done === true) await refresh();
        });
      },
    },
  ];
}

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
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

async function onRemove(row: ModAdminRow) {
  const reason: unknown = await removeModal.open({ name: row.name }).result;
  if (typeof reason !== 'string') return;
  await run(() => modAdminActions.remove(row.id, reason), t('admin.mods.removeModal.done'));
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UTabs v-model="view" :items="tabs" :content="false" class="w-auto" />
      <p class="max-w-xl text-sm text-muted">{{ t('admin.mods.suggestions.lede') }}</p>
    </div>
    <div class="rounded-lg bg-elevated p-2">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="status === 'pending'"
        :empty="
          view === 'visible'
            ? t('admin.mods.suggestions.emptyVisible')
            : t('admin.mods.suggestions.emptyRemoved')
        "
        class="tabular-nums"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <ModsIcon :name="row.original.name" :src="row.original.iconUrl" size="sm" />
            <ULink
              :to="row.original.pageUrl"
              target="_blank"
              class="font-semibold text-highlighted hover:underline"
            >
              {{ row.original.name }}
            </ULink>
          </div>
        </template>
        <template #proposer-cell="{ row }">
          <div v-if="row.original.proposer" class="flex flex-col">
            <span class="text-highlighted">{{ row.original.proposer.name }}</span>
            <span class="text-sm text-muted">{{ row.original.proposer.email }}</span>
            <span class="text-sm text-muted">
              {{ formatWardenDate(row.original.createdAt, locale) }}
            </span>
          </div>
          <span v-else class="text-muted">{{ t('admin.mods.suggestions.formerMember') }}</span>
        </template>
        <template #reason-cell="{ row }">
          <p>{{ row.original.reason }}</p>
          <p v-if="row.original.removedReason" class="mt-1 text-sm text-muted">
            {{ t('admin.mods.suggestions.removedReason', { reason: row.original.removedReason }) }}
          </p>
        </template>
        <template #actions-cell="{ row }">
          <div v-if="view === 'visible'" class="flex flex-col items-end gap-2">
            <UDropdownMenu :items="menu(row.original)">
              <UButton
                size="md"
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis"
                :aria-label="t('admin.mods.more')"
              />
            </UDropdownMenu>
            <UButton
              size="md"
              color="neutral"
              variant="outline"
              :label="t('admin.mods.suggestions.promote')"
              @click="
                run(
                  () => modAdminActions.promote(row.original.id),
                  t('admin.mods.suggestions.promoted'),
                )
              "
            />
            <UButton
              size="md"
              color="error"
              variant="outline"
              :label="t('admin.mods.suggestions.remove')"
              @click="onRemove(row.original)"
            />
          </div>
          <UButton
            v-else
            size="md"
            color="neutral"
            variant="outline"
            :label="t('admin.mods.suggestions.restore')"
            @click="
              run(
                () => modAdminActions.restore(row.original.id),
                t('admin.mods.suggestions.restored'),
              )
            "
          />
        </template>
      </UTable>
    </div>
  </div>
</template>
