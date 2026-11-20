<script setup lang="ts">
import type { PlaytimeLive } from '#shared/schemas/playtime';

// The Live tab: who is on the server now and where they stand against the limit. It refreshes by
// itself. In `observe` nothing below reaches the server: it shows what `enforce` would do.
const { t, locale } = useI18n();

const { data, error, refresh } = await usePlaytimeLive();

const timer = ref<ReturnType<typeof setInterval>>();
onMounted(() => {
  timer.value = setInterval(() => void refresh(), 15_000);
});
onBeforeUnmount(() => {
  clearInterval(timer.value);
});

type Filter = 'all' | 'counting' | 'grace' | 'blocked';
const filter = ref<Filter>('all');

type Row = PlaytimeLive['online'][number];
const rows = computed(() => data.value?.online ?? []);
const count = (state: Exclude<Filter, 'all'>) =>
  rows.value.filter((row) => row.state === state).length;
const tiles = computed(() => [
  { id: 'all' as const, value: rows.value.length },
  { id: 'counting' as const, value: count('counting') },
  { id: 'grace' as const, value: count('grace') },
  { id: 'blocked' as const, value: count('blocked') },
]);
const shown = computed(() =>
  filter.value === 'all' ? rows.value : rows.value.filter((row) => row.state === filter.value),
);

const PILL: Record<Row['state'], string> = {
  counting: 'bg-secondary/15 text-secondary',
  grace: 'bg-grace/15 text-grace',
  free: 'bg-success/15 text-success',
  blocked: 'bg-error/15 text-error',
  unlimited: 'bg-accented text-muted',
};
const stateKey = (row: Row) => (row.state === 'unlimited' ? (row.reason ?? 'exempt') : row.state);
const percent = (row: Row) =>
  row.allowanceSeconds === 0
    ? 100
    : Math.min(100, Math.round((row.usedSeconds / row.allowanceSeconds) * 100));
const duration = (seconds: number) => formatWardenDuration(seconds, locale.value);
const sessionLength = (row: Row) =>
  duration(Math.max(0, Math.floor((Date.now() - Date.parse(row.startedAt)) / 1000)));
const clock = (iso: string) => formatPlaytimeClock(iso, locale.value);
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.playtime.loadFailed')"
  />
  <div v-else class="flex flex-col gap-6">
    <div
      v-if="data.mode !== 'enforce'"
      class="flex items-start gap-3 rounded-lg bg-secondary/15 px-5 py-4"
    >
      <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-secondary" />
      <p>{{ t(`admin.playtime.live.callout.${data.mode}`) }}</p>
    </div>

    <p v-if="data.windowEndsAt || data.nextWindowStartsAt" class="text-muted">
      {{
        data.windowEndsAt
          ? t('admin.playtime.live.windowEnds', { time: clock(data.windowEndsAt) })
          : t('admin.playtime.live.nextWindow', {
              time: formatPlaytimeMoment(data.nextWindowStartsAt!, locale),
            })
      }}
    </p>

    <div
      role="radiogroup"
      :aria-label="t('admin.playtime.live.filters')"
      class="grid gap-3 sm:grid-cols-4"
    >
      <button
        v-for="tile in tiles"
        :key="tile.id"
        type="button"
        role="radio"
        :aria-checked="filter === tile.id"
        class="flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors"
        :class="
          filter === tile.id
            ? 'border-secondary bg-accented'
            : 'border-transparent bg-elevated hover:bg-accented'
        "
        @click="filter = tile.id"
      >
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">
          {{ tile.value }}
        </span>
        <span class="text-sm text-muted">{{ t(`admin.playtime.live.tiles.${tile.id}`) }}</span>
      </button>
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col rounded-lg bg-elevated lg:col-span-2">
        <p v-if="!shown.length" class="p-5 text-muted">{{ t('admin.playtime.live.empty') }}</p>
        <table v-else class="w-full text-left">
          <thead class="text-sm text-muted">
            <tr>
              <th class="px-5 py-3 font-medium">{{ t('admin.playtime.live.columns.player') }}</th>
              <th class="px-3 py-3 font-medium">{{ t('admin.playtime.live.columns.state') }}</th>
              <th class="hidden px-3 py-3 font-medium md:table-cell">
                {{ t('admin.playtime.live.columns.week') }}
              </th>
              <th class="px-3 py-3 font-medium">{{ t('admin.playtime.live.columns.left') }}</th>
              <th class="px-5 py-3 font-medium">{{ t('admin.playtime.live.columns.online') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="row in shown" :key="row.uuid">
              <td class="px-5 py-3">
                <NuxtLink
                  :to="`/admin/people/${row.userId}/minecraft`"
                  class="flex flex-col hover:underline"
                >
                  <span class="font-semibold text-highlighted">{{ row.name }}</span>
                  <span class="text-sm text-muted">
                    {{ [row.school, row.username].filter(Boolean).join(', ') }}
                  </span>
                </NuxtLink>
              </td>
              <td class="px-3 py-3">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-sm font-medium"
                  :class="PILL[row.state]"
                >
                  {{ t(`admin.playtime.live.states.${stateKey(row)}`) }}
                </span>
                <span v-if="row.graceEndsAt" class="block pt-1 text-xs text-muted">
                  {{ t('admin.playtime.live.graceUntil', { time: clock(row.graceEndsAt) }) }}
                </span>
              </td>
              <td class="hidden px-3 py-3 md:table-cell">
                <span v-if="row.state === 'unlimited'" class="text-muted">
                  {{ t('admin.playtime.live.noLimit') }}
                </span>
                <div v-else class="flex min-w-32 flex-col gap-1">
                  <UProgress
                    :model-value="percent(row)"
                    size="sm"
                    :color="row.state === 'blocked' ? 'error' : 'secondary'"
                  />
                  <span class="text-xs text-muted tabular-nums">
                    {{ duration(row.usedSeconds) }} / {{ duration(row.allowanceSeconds) }}
                  </span>
                </div>
              </td>
              <td class="px-3 py-3 tabular-nums">
                {{ row.state === 'unlimited' ? '–' : duration(row.remainingSeconds) }}
              </td>
              <td class="px-5 py-3 text-muted tabular-nums">{{ sessionLength(row) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
        <h2 class="text-xl font-medium text-highlighted">{{ t('admin.playtime.live.week') }}</h2>
        <p class="font-display text-3xl font-bold text-highlighted tabular-nums">
          {{ duration(data.week.countedSeconds) }}
        </p>
        <p class="-mt-3 text-sm text-muted">{{ t('admin.playtime.live.counted') }}</p>
        <dl class="flex flex-col divide-y divide-default text-sm">
          <div
            v-for="key in ['players', 'reachedLimit', 'usedGrace'] as const"
            :key="key"
            class="flex justify-between py-2"
          >
            <dt class="text-muted">{{ t(`admin.playtime.live.stats.${key}`) }}</dt>
            <dd class="font-semibold text-highlighted tabular-nums">{{ data.week[key] }}</dd>
          </div>
          <div class="flex justify-between py-2">
            <dt class="text-muted">{{ t('admin.playtime.live.stats.exempt') }}</dt>
            <dd class="font-semibold text-highlighted tabular-nums">
              {{ rows.filter((row) => row.state === 'unlimited').length }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>
