<script setup lang="ts">
// One item of the public Market, in a side drawer opened by `?item=<id>` so it can be linked: the
// price, how it compares to the base price, its history over four periods and what 1 and 64 items
// trade for. See docs/market.md.
import type { MarketPublic } from '#shared/schemas/market';
import { MARKET_PERIODS } from '#shared/schemas/market';

const props = defineProps<{ items: MarketPublic['items'] }>();
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

const itemId = computed(() => (typeof route.query.item === 'string' ? route.query.item : ''));
const item = computed(() => props.items.find((row) => row.id === itemId.value));
const open = computed({
  get: () => !!itemId.value,
  set: (value: boolean) => {
    if (!value) void router.push({ query: { ...route.query, item: undefined } });
  },
});

const period = ref<MarketPeriod>('7d');
const failed = ref(false);
const loading = ref(false);
const points = ref<MarketHistoryView['points']>([]);
let token = 0;

watch(
  [itemId, period],
  async () => {
    if (!itemId.value) return;
    const mine = ++token;
    loading.value = true;
    failed.value = false;
    try {
      const view = await marketHistoryOf(itemId.value, period.value);
      if (mine === token) points.value = view.points;
    } catch {
      if (mine === token) failed.value = true;
    } finally {
      if (mine === token) loading.value = false;
    }
  },
  { immediate: true },
);

const cents = (value: number) => formatLnbits(value, locale.value);
const mood = computed(() => (item.value ? marketMood(item.value.deltaPercent) : null));
const rows = computed(() =>
  item.value
    ? [
        {
          key: 'sell1',
          label: t('market.drawer.sell1'),
          on: item.value.sellable,
          cents: item.value.sell.one,
          off: 'notBought',
        },
        {
          key: 'sell64',
          label: t('market.drawer.sell64'),
          on: item.value.sellable,
          cents: item.value.sell.stack,
          off: 'notBought',
        },
        {
          key: 'buy1',
          label: t('market.drawer.buy1'),
          on: item.value.buyable,
          cents: item.value.buy.one,
          off: 'notSold',
        },
        {
          key: 'buy64',
          label: t('market.drawer.buy64'),
          on: item.value.buyable,
          cents: item.value.buy.stack,
          off: 'notSold',
        },
      ]
    : [],
);
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="item?.name ?? t('market.drawer.missing')"
    :description="item ? `${item.id} · ${t('market.tier', { tier: item.tier })}` : undefined"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #body>
      <p v-if="!item" class="text-muted">{{ t('market.drawer.missingBody') }}</p>
      <div v-else class="flex flex-col gap-6">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="font-display text-3xl font-bold text-highlighted tabular-nums">
            {{ formatItemPrice(item.price, locale) }}
          </span>
          <span class="text-muted">{{ t('market.drawer.each') }}</span>
          <MarketDelta :percent="item.deltaPercent" />
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-2" role="group" :aria-label="t('market.drawer.period')">
            <UButton
              v-for="option in MARKET_PERIODS"
              :key="option"
              size="sm"
              color="neutral"
              :variant="period === option ? 'solid' : 'outline'"
              :aria-pressed="period === option"
              :label="t(`market.drawer.periods.${option}`)"
              @click="period = option"
            />
          </div>
          <USkeleton v-if="loading && !points.length" class="h-48 w-full" />
          <UAlert
            v-else-if="failed"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="t('market.drawer.chartFailed')"
          />
          <p
            v-else-if="points.length < 2"
            class="rounded-lg bg-elevated px-4 py-8 text-center text-muted"
          >
            {{ t('market.drawer.noHistory') }}
          </p>
          <MarketHistoryChart
            v-else
            :points="points"
            :p0="item.p0"
            :name="item.name"
            :period="period"
          />
        </div>

        <dl class="grid grid-cols-2 gap-3">
          <div v-for="row in rows" :key="row.key" class="rounded-lg bg-elevated px-4 py-3">
            <dt class="text-sm text-muted">{{ row.label }}</dt>
            <dd class="font-semibold text-highlighted tabular-nums">
              {{ row.on ? cents(row.cents) : t(`market.${row.off}`) }}
            </dd>
          </div>
        </dl>

        <div class="flex flex-col gap-2 text-sm text-muted">
          <p v-if="mood">{{ t(`market.drawer.${mood}`) }}</p>
          <p>{{ t('market.drawer.base', { price: formatItemPrice(item.p0, locale) }) }}</p>
          <p>{{ t('market.footnote') }}</p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
