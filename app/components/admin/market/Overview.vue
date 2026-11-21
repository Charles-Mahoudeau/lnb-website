<script setup lang="ts">
import { marketItemName } from '#shared/utils/market';
// The Market at a glance (docs/market.md): the figures, what needs a look, where every item's
// stock sits against its target, then money minted and burned. An item opens its drawer
// (`?item=`). Amounts are cents, shown through the LNBits helpers.
const { t, locale, n } = useI18n();
const route = useRoute();

const { data: overview, error } = await useMarketOverview();
const { data: stats } = await useMarketStats();

const name = (id: string) => marketItemName(id);
const itemLink = (id: string) => ({ path: route.path, query: { ...route.query, item: id } });

const tiles = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const used = s.mintCap.cap > 0 ? s.mintCap.used / s.mintCap.cap : 0;
  return [
    {
      label: t('admin.market.tiles.minted'),
      value: formatLnbits(s.volume.minted, locale.value),
      sub: t('admin.market.tiles.mintedSub', { n: formatCount(s.volume.orders, locale.value) }),
    },
    {
      label: t('admin.market.tiles.burned'),
      value: formatLnbits(s.volume.burned, locale.value),
      sub: t('admin.market.tiles.burnedSub', {
        net: formatSignedLnbits(s.volume.minted - s.volume.burned, locale.value),
      }),
    },
    {
      label: t('admin.market.tiles.budget'),
      value: n(used, { style: 'percent', maximumFractionDigits: 0 }),
      sub: t('admin.market.tiles.budgetSub', { cap: formatLnbits(s.mintCap.cap, locale.value) }),
      bar: Math.min(100, used * 100),
    },
    {
      label: t('admin.market.tiles.orders'),
      value: formatCount(s.today.orders, locale.value),
      sub: t('admin.market.tiles.ordersSub', { n: s.today.capped }, s.today.capped),
    },
  ];
});

const relative = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(-days, 'day');
};

interface Attention {
  key: string;
  title: string;
  body: string;
  item?: string;
  to?: string;
}

const attention = computed<Attention[]>(() => {
  const list: Attention[] = [];
  for (const item of overview.value?.items ?? []) {
    const status = stockStatus(item.stock, item.s0);
    if (!status || !item.enabled) continue;
    list.push({
      key: item.id,
      item: item.id,
      title: t(`admin.market.attention.${status}`, { name: item.name }),
      body: t(`admin.market.attention.${status}Body`, {
        ratio: n(item.stock / item.s0, { maximumFractionDigits: 2 }),
        drift: n(item.alpha, { style: 'percent', maximumFractionDigits: 0 }),
      }),
    });
  }
  const s = stats.value;
  if (s?.today.capped) {
    list.push({
      key: 'capped',
      title: t('admin.market.attention.capped', { n: s.today.capped }, s.today.capped),
      body: t('admin.market.attention.cappedBody'),
      to: '/admin/economy/market/orders',
    });
  }
  if (s && !s.recipes.updatedAt) {
    list.push({
      key: 'recipes',
      title: t('admin.market.attention.noRecipes'),
      body: t('admin.market.attention.noRecipesBody'),
    });
  } else if (
    s?.recipes.updatedAt &&
    Date.now() - new Date(s.recipes.updatedAt).getTime() > 14 * 86_400_000
  ) {
    list.push({
      key: 'recipes',
      title: t('admin.market.attention.oldRecipes', { when: relative(s.recipes.updatedAt) }),
      body: t('admin.market.attention.oldRecipesBody'),
    });
  }
  return list;
});

const tiers = computed(() =>
  [1, 2, 3].map((tier) => ({
    tier,
    items: (overview.value?.items ?? []).filter((item) => item.tier === tier && item.enabled),
  })),
);

const traded = computed(() => {
  const rows = (stats.value?.items ?? [])
    .map((row) => ({ item: row.item, moved: row.minted + row.burned }))
    .toSorted((a, b) => b.moved - a.moved)
    .slice(0, 6);
  const max = Math.max(1, ...rows.map((row) => row.moved));
  return rows.map((row) => ({ ...row, share: (row.moved / max) * 100 }));
});

const axis = [
  { ratio: 0.1, label: '0.1×' },
  { ratio: 1, label: '1×' },
  { ratio: MARKET_FLOODED, label: `${String(MARKET_FLOODED)}×` },
  { ratio: 10, label: '10×' },
];
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.market.loadFailed')"
  />
  <div v-else-if="overview" class="flex flex-col gap-6">
    <div v-if="tiles.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="tile in tiles"
        :key="tile.label"
        class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5"
      >
        <span class="text-sm font-semibold text-muted">{{ tile.label }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          tile.value
        }}</span>
        <UProgress
          v-if="tile.bar !== undefined"
          :model-value="tile.bar"
          color="neutral"
          size="sm"
        />
        <span class="text-sm text-muted tabular-nums">{{ tile.sub }}</span>
      </div>
    </div>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.market.attention.title') }}</h2>
      <p v-if="!attention.length" class="text-muted">{{ t('admin.market.attention.none') }}</p>
      <ul v-else class="divide-y divide-default">
        <li
          v-for="row in attention"
          :key="row.key"
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <p class="max-w-2xl">
            <span class="font-semibold text-highlighted">{{ row.title }}</span>
            <span class="block text-sm text-muted">{{ row.body }}</span>
          </p>
          <UButton
            v-if="row.item"
            :to="itemLink(row.item)"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('admin.market.attention.open')"
          />
          <UButton
            v-else-if="row.to"
            :to="row.to"
            color="neutral"
            variant="ghost"
            size="sm"
            :label="t('admin.market.attention.orders')"
          />
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
      <div>
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.market.board.title') }}</h2>
        <p class="text-sm text-muted">{{ t('admin.market.board.lede') }}</p>
      </div>
      <div class="flex items-end gap-4" aria-hidden="true">
        <span class="hidden w-56 sm:block" />
        <span class="hidden w-32 sm:block" />
        <div class="relative hidden h-4 flex-1 text-xs text-muted sm:block">
          <span
            v-for="mark in axis"
            :key="mark.label"
            class="absolute -translate-x-1/2"
            :style="{ left: `${ratioPosition(mark.ratio)}%` }"
          >
            {{ mark.label }}
          </span>
        </div>
        <span class="hidden w-4 sm:block" />
      </div>
      <template v-for="group in tiers" :key="group.tier">
        <h3 v-if="group.items.length" class="mt-2 font-semibold text-highlighted">
          {{ t('admin.market.tier', { tier: group.tier }) }}
        </h3>
        <NuxtLink
          v-for="item in group.items"
          :key="item.id"
          :to="itemLink(item.id)"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md py-1.5 hover:bg-muted sm:flex-nowrap"
        >
          <span
            class="flex min-w-0 flex-1 items-center gap-2.5 font-semibold text-highlighted sm:w-56 sm:flex-none"
          >
            <MarketTile :name="item.name" />
            <span class="truncate">{{ item.name }}</span>
          </span>
          <span class="w-32 text-right tabular-nums sm:text-left">
            <b class="text-highlighted">{{ formatItemPrice(item.price, locale) }}</b>
            <span class="ml-1 text-sm text-muted">{{
              formatPercentVsBase(percentVsBase(item.price, item.p0))
            }}</span>
          </span>
          <span
            class="relative order-last h-2 w-full rounded-full bg-accented sm:order-none sm:w-auto sm:flex-1"
          >
            <span
              class="absolute -top-0.5 h-3 w-0.5 bg-inverted"
              :style="{ left: `${ratioPosition(1)}%` }"
            />
            <span
              class="absolute -top-0.5 h-3 w-0.5 bg-inverted/40"
              :style="{ left: `${ratioPosition(MARKET_FLOODED)}%` }"
            />
            <span
              class="absolute -top-1 size-4 -translate-x-1/2 rounded-full bg-secondary ring-2 ring-default"
              :style="{ left: `${ratioPosition(item.stock / item.s0)}%` }"
              :title="
                t('admin.market.stock.ratio', {
                  ratio: n(item.stock / item.s0, { maximumFractionDigits: 2 }),
                })
              "
            />
          </span>
          <UIcon name="i-lucide-chevron-right" class="hidden size-4 text-dimmed sm:block" />
        </NuxtLink>
      </template>
    </section>

    <div v-if="stats" class="grid gap-4 lg:grid-cols-5">
      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5 lg:col-span-3">
        <div class="flex flex-wrap items-center gap-4">
          <h2 class="flex-1 text-lg font-medium text-highlighted">
            {{ t('admin.market.flow') }}
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
        <p v-if="!stats.days.length" class="text-muted">{{ t('admin.market.noTrades') }}</p>
        <AdminEconomyFlowChart v-else :days="stats.days" />
      </section>

      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5 lg:col-span-2">
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.market.traded') }}</h2>
        <p v-if="!traded.length" class="text-muted">{{ t('admin.market.noTrades') }}</p>
        <div v-for="row in traded" :key="row.item" class="flex flex-col gap-1">
          <div class="flex gap-2 text-sm">
            <span class="flex-1">{{ name(row.item) }}</span>
            <span class="font-semibold tabular-nums">{{ formatLnbits(row.moved, locale) }}</span>
          </div>
          <UProgress :model-value="row.share" color="neutral" size="sm" />
        </div>
      </section>
    </div>
  </div>
</template>
