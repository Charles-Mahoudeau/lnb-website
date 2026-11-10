<script setup lang="ts">
import type { EconomyPeriod } from '#shared/schemas/economy';
import { ECONOMY_PERIODS } from '#shared/schemas/economy';

// The economy at a glance: proposal A of the economy mocks, "Stats first".
const { t, locale } = useI18n();

const period = ref<EconomyPeriod>('30d');
const { data, error } = await useEconomyStats(period);

const periodItems = computed(() =>
  ECONOMY_PERIODS.map((value) => ({ label: t(`admin.economy.periods.${value}`), value })),
);

const tiles = computed(() => {
  const stats = data.value;
  if (!stats) return [];
  const n = (value: number) => formatLnbits(value, locale.value);
  return [
    {
      label: t('admin.economy.tiles.supply'),
      value: n(stats.supply),
      sub: t('admin.economy.tiles.supplySub', {
        change: formatSignedLnbits(stats.supplyChange, locale.value),
      }),
    },
    {
      label: t('admin.economy.tiles.net'),
      value: formatSignedLnbits(stats.minted - stats.burned, locale.value),
      sub: t('admin.economy.tiles.netSub', { minted: n(stats.minted), burned: n(stats.burned) }),
    },
    {
      label: t('admin.economy.tiles.active'),
      value: n(stats.activePlayers),
      sub: t('admin.economy.tiles.activeSub'),
    },
    {
      label: t('admin.economy.tiles.transactions'),
      value: n(stats.transactions),
      sub: t('admin.economy.tiles.transactionsSub', { moved: n(stats.moved) }),
    },
  ];
});

const reasons = computed(() => {
  const rows = data.value?.reasons ?? [];
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return rows
    .toSorted((a, b) => b.amount - a.amount)
    .map((row) => ({ ...row, share: row.amount / max }));
});
const volume = computed(() => {
  const rows = data.value?.volume ?? [];
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return rows.map((row) => ({ ...row, share: row.amount / max }));
});
const histogram = computed(() => {
  const buckets = data.value?.distribution.histogram ?? [];
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return buckets.map((bucket) => ({ ...bucket, share: bucket.count / max }));
});
const compact = (value: number) =>
  new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
const percent = (share: number) =>
  new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }).format(share);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-2xl text-muted">{{ t('admin.economy.lede') }}</p>
      <UTabs
        v-model="period"
        :items="periodItems"
        variant="pill"
        size="sm"
        :content="false"
        :aria-label="t('admin.economy.period')"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.economy.loadFailed')"
    />

    <template v-else-if="data">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="tile in tiles"
          :key="tile.label"
          class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5"
        >
          <span class="text-sm font-semibold text-muted">{{ tile.label }}</span>
          <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
            tile.value
          }}</span>
          <span class="text-sm text-muted tabular-nums">{{ tile.sub }}</span>
        </div>
      </div>

      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.economy.charts.supply') }}</h2>
        <AdminEconomySupplyChart :days="data.days" />
      </section>

      <div class="grid gap-4 lg:grid-cols-5">
        <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5 lg:col-span-3">
          <div class="flex flex-wrap items-center gap-4">
            <h2 class="flex-1 text-lg font-medium text-highlighted">
              {{ t('admin.economy.charts.flow') }}
            </h2>
            <span class="flex items-center gap-1.5 text-sm text-muted">
              <span class="size-2.5 rounded-xs bg-current text-highlighted" aria-hidden="true" />
              {{ t('admin.economy.minted') }}
            </span>
            <span class="flex items-center gap-1.5 text-sm text-muted">
              <span class="size-2.5 rounded-xs bg-current text-dimmed" aria-hidden="true" />
              {{ t('admin.economy.burned') }}
            </span>
          </div>
          <AdminEconomyFlowChart :days="data.days" />
        </section>

        <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5 lg:col-span-2">
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.economy.reasons.title') }}
          </h2>
          <p v-if="!reasons.length" class="text-muted">{{ t('admin.economy.reasons.empty') }}</p>
          <div v-for="row in reasons" :key="row.direction + row.reason" class="flex flex-col gap-1">
            <div class="flex gap-2 text-sm">
              <span class="flex-1">{{
                t(`admin.economy.reasons.${row.direction}.${row.reason}`)
              }}</span>
              <span class="font-semibold tabular-nums">
                {{
                  formatSignedLnbits(row.direction === 'mint' ? row.amount : -row.amount, locale)
                }}
              </span>
            </div>
            <UProgress :model-value="row.share * 100" color="neutral" size="sm" />
          </div>
        </section>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.economy.volume.title') }}
          </h2>
          <div
            v-for="row in volume"
            :key="row.kind"
            class="grid grid-cols-6 items-center gap-3 text-sm"
          >
            <span class="col-span-1">{{ t(`economy.kinds.${row.kind}`) }}</span>
            <UProgress
              class="col-span-3"
              :model-value="row.share * 100"
              color="neutral"
              size="sm"
            />
            <span class="col-span-2 text-right tabular-nums">
              <strong>{{ formatLnbits(row.amount, locale) }}</strong>
              <span class="text-muted">
                {{
                  t('admin.economy.volume.count', { n: formatLnbits(row.count, locale) }, row.count)
                }}</span
              >
            </span>
          </div>
        </section>

        <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.economy.wealth.title') }}
          </h2>
          <div class="flex flex-wrap gap-8">
            <div class="flex flex-col">
              <span class="font-display text-2xl font-bold text-highlighted tabular-nums">
                {{ percent(data.distribution.top10Share) }}
              </span>
              <span class="text-sm text-muted">{{ t('admin.economy.wealth.top10') }}</span>
            </div>
            <div class="flex flex-col">
              <span class="font-display text-2xl font-bold text-highlighted tabular-nums">
                {{ data.distribution.gini.toLocaleString(locale, { maximumFractionDigits: 2 }) }}
              </span>
              <span class="text-sm text-muted">{{ t('admin.economy.wealth.gini') }}</span>
            </div>
          </div>
          <div
            class="flex h-28 items-end gap-1"
            role="img"
            :aria-label="t('admin.economy.wealth.histogramLabel')"
          >
            <div
              v-for="bucket in histogram"
              :key="bucket.from"
              class="flex-1 rounded-t-xs bg-inverted/50"
              :style="{ height: `${Math.max(bucket.share * 100, bucket.count ? 3 : 0)}%` }"
              :title="t('admin.economy.wealth.bucket', { n: bucket.count }, bucket.count)"
            />
          </div>
          <div class="flex gap-1 text-xs text-muted tabular-nums">
            <span v-for="bucket in histogram" :key="bucket.from" class="flex-1 text-center">
              {{ bucket.to === null ? `${compact(bucket.from)}+` : compact(bucket.from) }}
            </span>
          </div>
        </section>
      </div>

      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.economy.largest') }}</h2>
        <p v-if="!data.largestShared.length" class="text-muted">
          {{ t('admin.economy.noShared') }}
        </p>
        <ul class="flex flex-col divide-y divide-default">
          <li
            v-for="account in data.largestShared"
            :key="account.id"
            class="flex items-center gap-3 py-2.5"
          >
            <NuxtLink
              :to="`/admin/economy/accounts/${account.id}`"
              class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2"
            >
              <span class="font-semibold text-highlighted">{{ account.name }}</span>
              <span class="text-sm text-muted">
                {{
                  t(
                    'economy.baltop.sharedHint',
                    { handle: account.handle, n: account.memberCount },
                    account.memberCount,
                  )
                }}
              </span>
            </NuxtLink>
            <span class="font-bold tabular-nums">{{ formatLnbits(account.balance, locale) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
