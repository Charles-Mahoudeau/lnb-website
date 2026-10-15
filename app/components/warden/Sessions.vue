<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import type { WardenSessionView } from '#shared/schemas/warden';

// The player's sessions, newest first, with a button for older ones.
defineProps<{ sessions: WardenSessionView[]; hasMore: boolean; loadingMore: boolean }>();
const emit = defineEmits<{ more: [] }>();

const { t, locale } = useI18n();

const columns = computed<TableColumn<WardenSessionView>[]>(() => [
  { accessorKey: 'startedAt', header: t('warden.sessions.started') },
  { accessorKey: 'username', header: t('warden.sessions.account') },
  {
    accessorKey: 'durationSeconds',
    header: t('warden.sessions.length'),
    meta: { class: { th: 'text-right', td: 'text-right' } },
  },
]);
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-elevated">
    <UTable
      :data="sessions"
      :columns="columns"
      :empty="t('warden.sessions.empty')"
      class="tabular-nums"
    >
      <template #startedAt-cell="{ row }">
        {{ formatWardenDateTime(row.original.startedAt, locale) }}
      </template>
      <template #durationSeconds-cell="{ row }">
        <UBadge
          v-if="row.original.online"
          color="success"
          variant="subtle"
          :label="t('warden.sessions.playing')"
        />
        <template v-else>{{ formatWardenDuration(row.original.durationSeconds, locale) }}</template>
      </template>
    </UTable>
    <div v-if="hasMore" class="flex justify-end border-t border-default px-4 py-2">
      <UButton
        color="neutral"
        variant="ghost"
        size="md"
        :label="t('warden.sessions.more')"
        :loading="loadingMore"
        @click="emit('more')"
      />
    </div>
  </div>
</template>
