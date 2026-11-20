<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import type { WardenFeedRow } from '#shared/schemas/warden';

// Moderation > Bans: the bans in force, then the latest warnings and notes, in one table. A row
// opens the Moderation tab of the person it is about.
const { t, locale } = useI18n();

const kind = ref<'all' | 'ban' | 'warning' | 'note'>('all');
const { data, error, status } = await useWardenFeed(kind);

const kinds = computed(() =>
  (['all', 'ban', 'warning', 'note'] as const).map((value) => ({
    value,
    label: t(`wardenAdmin.bans.kinds.${value}`),
  })),
);

const columns = computed<TableColumn<WardenFeedRow>[]>(() => [
  { id: 'person', header: t('wardenAdmin.bans.person') },
  { id: 'kind', header: t('wardenAdmin.bans.kind') },
  { id: 'text', header: t('wardenAdmin.bans.text') },
  { id: 'at', header: t('wardenAdmin.bans.at') },
]);

function open(_event: Event, row: { original: WardenFeedRow }) {
  void navigateTo(`/admin/people/${encodeURIComponent(row.original.user.userId)}/moderation`);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2" role="group" :aria-label="t('wardenAdmin.bans.kind')">
      <UButton
        v-for="item in kinds"
        :key="item.value"
        size="md"
        color="neutral"
        :variant="kind === item.value ? 'soft' : 'outline'"
        :aria-pressed="kind === item.value"
        :label="item.label"
        @click="kind = item.value"
      />
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('wardenAdmin.bans.loadFailed')"
    />
    <div v-else class="overflow-hidden rounded-lg bg-elevated">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="status === 'pending'"
        :empty="t('wardenAdmin.bans.empty')"
        class="tabular-nums"
        @select="open"
      >
        <template #person-cell="{ row }">
          <NuxtLink
            :to="`/admin/people/${row.original.user.userId}/moderation`"
            class="font-semibold text-highlighted hover:underline"
          >
            {{ row.original.user.name }}
          </NuxtLink>
        </template>
        <template #kind-cell="{ row }">
          <UBadge
            :color="row.original.kind === 'ban' ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
            :label="t(`wardenAdmin.bans.kinds.${row.original.kind}`)"
          />
          <span v-if="row.original.kind === 'ban'" class="ml-2 text-sm text-muted">
            {{
              row.original.expiresAt
                ? t('admin.users.bannedUntil', {
                    date: formatWardenDate(row.original.expiresAt, locale),
                  })
                : t('wardenAdmin.timeline.banPermanent')
            }}
          </span>
        </template>
        <template #text-cell="{ row }">
          <span class="line-clamp-2 break-words whitespace-normal">{{ row.original.text }}</span>
        </template>
        <template #at-cell="{ row }">
          {{ formatWardenDateTime(row.original.at, locale) }}
        </template>
      </UTable>
    </div>
  </div>
</template>
