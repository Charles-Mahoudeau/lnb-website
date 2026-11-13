<script setup lang="ts">
import type { AnticheatPlayerBand, AnticheatPlayerRow } from '#shared/schemas/anticheat';
import { ANTICHEAT_PLAYER_BANDS } from '#shared/schemas/anticheat';

// Players the anticheat has seen, lowest score first. A row opens the anticheat section of the
// Warden player page.
const { t, d } = useI18n();

const search = ref('');
const band = ref<AnticheatPlayerBand | null>(null);
function build() {
  return { q: search.value.trim() || undefined, band: band.value ?? undefined };
}
const query = ref(build());
let timer: ReturnType<typeof setTimeout> | undefined;
watch([search, band], () => {
  clearTimeout(timer);
  timer = setTimeout(() => (query.value = build()), 250);
});
onScopeDispose(() => {
  clearTimeout(timer);
});

const { data, error, status } = await useAnticheatPlayers(query);

const more = ref<AnticheatPlayerRow[]>([]);
const moreCursor = ref<string | null | undefined>(undefined);
const loadingMore = ref(false);
watch(data, () => {
  more.value = [];
  moreCursor.value = undefined;
});
const rows = computed(() => [...(data.value?.items ?? []), ...more.value]);
const nextCursor = computed(() =>
  moreCursor.value === undefined ? (data.value?.nextCursor ?? null) : moreCursor.value,
);

async function loadMore() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const page = await anticheatActions.morePlayerRows(query.value, nextCursor.value);
    more.value.push(...page.items);
    moreCursor.value = page.nextCursor;
  } finally {
    loadingMore.value = false;
  }
}

function toggleBand(value: AnticheatPlayerBand) {
  band.value = band.value === value ? null : value;
}
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="md"
        class="w-full max-w-xs"
        :placeholder="t('admin.anticheat.playersPage.search')"
        :aria-label="t('admin.anticheat.playersPage.search')"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="value in ANTICHEAT_PLAYER_BANDS"
          :key="value"
          size="md"
          color="secondary"
          :variant="band === value ? 'soft' : 'outline'"
          :aria-pressed="band === value"
          :label="t(`admin.anticheat.playerBands.${value}`)"
          @click="toggleBand(value)"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.anticheat.errors.failed')"
    />
    <p v-else-if="!rows.length && status !== 'pending'" class="text-muted">
      {{ t('admin.anticheat.playersPage.empty') }}
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-2xl border-collapse text-left">
        <thead class="text-sm text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">
              {{ t('admin.anticheat.playersPage.columns.player') }}
            </th>
            <th class="px-3 py-2 text-right font-medium">
              {{ t('admin.anticheat.playersPage.columns.score') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('admin.anticheat.playersPage.columns.band') }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t('admin.anticheat.playersPage.columns.lastSeen') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.player.userId" class="border-t border-default">
            <td class="px-3 py-3">
              <NuxtLink
                :to="`/admin/warden/players/${row.player.userId}#anticheat`"
                class="flex items-center gap-3 hover:underline"
                :aria-label="`${t('admin.anticheat.playersPage.open')}: ${row.player.name}`"
              >
                <UserAvatar :user-id="row.player.userId" :name="row.player.name" size="sm" />
                <span class="flex min-w-0 flex-col">
                  <span class="truncate font-semibold text-highlighted">{{ row.player.name }}</span>
                  <span v-if="row.player.username" class="truncate text-sm text-muted">
                    {{ row.player.username }}
                  </span>
                </span>
              </NuxtLink>
            </td>
            <td class="px-3 py-3 text-right font-display tabular-nums">{{ row.score }}</td>
            <td class="px-3 py-3">
              <span class="flex flex-wrap items-center gap-1.5">
                <AdminAnticheatPlayerBadge :band="row.band" />
                <UBadge
                  v-if="row.manualHold"
                  color="warning"
                  variant="outline"
                  :label="t('admin.anticheat.playersPage.manualHold')"
                />
              </span>
            </td>
            <td class="px-3 py-3 text-muted tabular-nums">
              {{
                row.lastSeenAt
                  ? d(row.lastSeenAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Europe/Paris',
                    })
                  : t('admin.anticheat.playersPage.never')
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <UButton
      v-if="nextCursor"
      color="neutral"
      variant="soft"
      size="md"
      class="self-start"
      :loading="loadingMore"
      :label="t('admin.anticheat.more')"
      @click="loadMore"
    />
  </section>
</template>
