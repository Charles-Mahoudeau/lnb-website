<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import type { WardenPlayerRow, WardenPlayersQuery } from '#shared/schemas/warden';

// The players tab: search, filter and page through players, and open one.
const { t, locale } = useI18n();

const search = ref('');
const status = ref<'all' | 'banned' | 'online'>('all');
// Cursors of the pages before this one, to go back to the first page.
const cursors = ref<string[]>([]);

const query = ref<WardenPlayersQuery>({ status: 'all' });
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    cursors.value = [];
    query.value = { q: value || undefined, status: status.value };
  }, 250);
});
watch(status, (value) => {
  cursors.value = [];
  query.value = { q: search.value || undefined, status: value };
});

const { data, error, status: loadState } = await useWardenAdminPlayers(query);

function next() {
  const cursor = data.value?.nextCursor;
  if (!cursor) return;
  cursors.value.push(cursor);
  query.value = { ...query.value, cursor };
}
function first() {
  cursors.value = [];
  query.value = { q: query.value.q, status: query.value.status };
}

const statusItems = computed(() => [
  { label: t('wardenAdmin.players.status.all'), value: 'all' },
  { label: t('wardenAdmin.players.status.banned'), value: 'banned' },
  { label: t('wardenAdmin.players.status.online'), value: 'online' },
]);

const columns = computed<TableColumn<WardenPlayerRow>[]>(() => [
  { accessorKey: 'name', header: t('wardenAdmin.players.player') },
  { id: 'minecraft', header: t('wardenAdmin.players.minecraft') },
  { id: 'state', header: t('wardenAdmin.players.state') },
  { accessorKey: 'lastSeenAt', header: t('wardenAdmin.players.lastSeen') },
  {
    accessorKey: 'playtimeSeconds',
    header: t('wardenAdmin.players.playtime'),
    meta: { class: { th: 'text-right', td: 'text-right' } },
  },
]);

function isPlaying(row: WardenPlayerRow) {
  return row.accounts.some((account) => account.online);
}

async function open(row: WardenPlayerRow) {
  await navigateTo(`/admin/warden/players/${row.userId}`);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        :placeholder="t('wardenAdmin.players.search')"
        :aria-label="t('wardenAdmin.players.search')"
        class="min-w-0 flex-1 basis-64"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        :aria-label="t('wardenAdmin.players.state')"
        class="w-48"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('wardenAdmin.players.loadFailed')"
    />

    <div v-else class="overflow-hidden rounded-lg bg-elevated">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="loadState === 'pending'"
        :empty="t('wardenAdmin.players.empty')"
        :ui="{ tr: 'cursor-pointer hover:bg-accented/50' }"
        class="tabular-nums"
        @select="(_event, row) => open(row.original)"
      >
        <template #name-cell="{ row }">
          <div class="flex flex-col">
            <span class="flex flex-wrap items-center gap-2 font-semibold text-highlighted">
              {{ row.original.name }}
              <UBadge
                v-if="row.original.wardenAdmin"
                color="neutral"
                variant="soft"
                size="sm"
                :label="t('wardenAdmin.players.wardenAdmin')"
              />
              <UBadge
                v-if="row.original.transferWarning"
                color="warning"
                variant="subtle"
                size="sm"
                icon="i-lucide-arrow-left-right"
                :label="t(`wardenAdmin.players.transfer.${row.original.transferWarning}`)"
              />
            </span>
            <span class="text-sm text-muted">{{ row.original.email }}</span>
          </div>
        </template>
        <template #minecraft-cell="{ row }">
          <div v-if="row.original.accounts.length" class="flex items-center gap-3">
            <span class="flex gap-1">
              <WardenMinecraftHead
                v-for="account in row.original.accounts"
                :key="account.uuid"
                :uuid="account.uuid"
                size="sm"
              />
            </span>
            <span class="truncate">
              {{ row.original.accounts.map((account) => account.username).join(', ') }}
            </span>
          </div>
          <span v-else class="text-muted">{{ t('wardenAdmin.players.none') }}</span>
        </template>
        <template #state-cell="{ row }">
          <UBadge
            v-if="row.original.ban"
            color="error"
            variant="subtle"
            :label="
              row.original.ban.expiresAt
                ? t('wardenAdmin.players.bannedUntil', {
                    date: formatWardenDate(row.original.ban.expiresAt, locale),
                  })
                : t('wardenAdmin.players.banned')
            "
          />
          <UBadge
            v-else-if="isPlaying(row.original)"
            color="success"
            variant="subtle"
            :label="t('wardenAdmin.players.playing')"
          />
        </template>
        <template #lastSeenAt-cell="{ row }">
          {{
            row.original.lastSeenAt
              ? formatWardenRelative(row.original.lastSeenAt, locale)
              : t('wardenAdmin.players.never')
          }}
        </template>
        <template #playtimeSeconds-cell="{ row }">
          {{ formatWardenDuration(row.original.playtimeSeconds, locale) }}
        </template>
      </UTable>
      <div
        v-if="cursors.length || data?.nextCursor"
        class="flex justify-end gap-2 border-t border-default px-4 py-2"
      >
        <UButton
          v-if="cursors.length"
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('wardenAdmin.players.first')"
          @click="first"
        />
        <UButton
          v-if="data?.nextCursor"
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('wardenAdmin.players.next')"
          @click="next"
        />
      </div>
    </div>
  </div>
</template>
