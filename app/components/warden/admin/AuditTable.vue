<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import type { WardenAuditView } from '#shared/schemas/warden';

// Audit entries as a table: when, what, to whom, by whom, from where.
const props = withDefaults(defineProps<{ entries: WardenAuditView[]; showPlayer?: boolean }>(), {
  showPlayer: true,
});

const { t, locale } = useI18n();
const labels = useWardenLabels();

const columns = computed<TableColumn<WardenAuditView>[]>(() => [
  { accessorKey: 'at', header: t('wardenAdmin.activity.when') },
  { accessorKey: 'action', header: t('wardenAdmin.activity.what') },
  ...(props.showPlayer ? [{ id: 'player', header: t('wardenAdmin.activity.player') }] : []),
  { id: 'actor', header: t('wardenAdmin.activity.by') },
  { accessorKey: 'source', header: t('wardenAdmin.activity.from') },
]);
</script>

<template>
  <UTable
    :data="entries"
    :columns="columns"
    :empty="t('wardenAdmin.activity.empty')"
    class="tabular-nums"
  >
    <template #at-cell="{ row }">
      <span class="whitespace-nowrap">{{ formatWardenDateTime(row.original.at, locale) }}</span>
    </template>
    <template #action-cell="{ row }">{{ labels.action(row.original) }}</template>
    <template #player-cell="{ row }">
      <NuxtLink
        v-if="row.original.target"
        :to="`/admin/warden/players/${row.original.target.userId}`"
        class="text-highlighted hover:underline"
      >
        {{ row.original.target.name ?? row.original.target.userId }}
      </NuxtLink>
      <span v-else class="text-muted">{{ t('wardenAdmin.activity.everyone') }}</span>
    </template>
    <template #actor-cell="{ row }">{{ labels.actor(row.original.actor) }}</template>
    <template #source-cell="{ row }">{{ labels.source(row.original.source) }}</template>
  </UTable>
</template>
