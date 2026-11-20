<script setup lang="ts">
// The public Market (docs/market.md): prices by tier with a delta against the base price, the best
// items to sell and to buy, and, for a player with a linked account, how much of each tier is left
// at full rate today. There is no trading here: it happens in the game with /market.
definePageMeta({ auth: false, flag: 'economy.market' });

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { user } = useAuth();

useSeoMeta({
  title: () => t('market.title'),
  description: () => t('market.lede'),
  robots: 'noindex',
});

const { data, error } = await useMarket();

const query = ref('');
const tierFilter = ref<'all' | number>('all');
const tiers = computed(() => [...new Set(data.value?.items.map((item) => item.tier))].toSorted());
const movers = computed(() => marketMovers(data.value?.items ?? []));
const groups = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return tiers.value
    .filter((tier) => tierFilter.value === 'all' || tierFilter.value === tier)
    .map((tier) => ({
      tier,
      items: (data.value?.items ?? []).filter(
        (item) =>
          item.tier === tier &&
          (!needle || item.name.toLowerCase().includes(needle) || item.id.includes(needle)),
      ),
    }))
    .filter((group) => group.items.length);
});

const cents = (value: number) => formatLnbits(value, locale.value);
function openItem(id: string) {
  void router.push({ query: { ...route.query, item: id } });
}
const signInTo = computed(() => ({ path: '/sign-in', query: { redirect: route.fullPath } }));
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-14">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-64 flex-1 flex-col gap-2">
        <h1 class="text-4xl font-bold text-highlighted">{{ t('market.title') }}</h1>
        <p class="max-w-2xl text-lg text-muted">{{ t('market.lede') }}</p>
      </div>
      <UBadge
        v-if="data && (!data.sell || !data.buy)"
        color="warning"
        variant="outline"
        :label="
          !data.sell && !data.buy
            ? t('market.off.both')
            : !data.sell
              ? t('market.off.sell')
              : t('market.off.buy')
        "
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('market.loadFailed')"
    />

    <div v-else-if="!data" class="flex flex-col gap-4" aria-busy="true">
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-48 w-full" />
    </div>

    <div
      v-else-if="!data.items.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-store" />
      <h2 class="text-xl font-medium text-highlighted">{{ t('market.empty.title') }}</h2>
      <p class="max-w-md text-muted">{{ t('market.empty.body') }}</p>
    </div>

    <template v-else>
      <section v-if="data.me" class="flex flex-col gap-3" aria-labelledby="market-me">
        <div>
          <h2 id="market-me" class="text-xl font-medium text-highlighted">
            {{ t('market.me.title') }}
          </h2>
          <p class="text-sm text-muted">{{ t('market.me.hint') }}</p>
        </div>
        <UAlert
          v-if="data.me.capped"
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          :description="t('market.me.capped')"
        />
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MarketTierMeter v-for="window in data.me.tiers" :key="window.tier" :window="window" />
        </div>
      </section>
      <div
        v-else
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-5 py-4"
      >
        <p class="max-w-2xl text-muted">
          {{ user ? t('market.me.linkPrompt') : t('market.me.signInPrompt') }}
        </p>
        <UButton
          v-if="user"
          to="/minecraft/account"
          color="neutral"
          variant="soft"
          :label="t('market.me.link')"
        />
        <UButton
          v-else
          :to="signInTo"
          color="neutral"
          variant="soft"
          :label="t('market.me.signIn')"
        />
      </div>

      <div v-if="movers.paying.length || movers.cheapest.length" class="grid gap-6 md:grid-cols-2">
        <section
          v-for="list in [
            { id: 'paying', items: movers.paying, side: 'sell' as const },
            { id: 'cheapest', items: movers.cheapest, side: 'buy' as const },
          ].filter((entry) => entry.items.length)"
          :key="list.id"
          class="flex flex-col gap-2"
          :aria-labelledby="`market-${list.id}`"
        >
          <div>
            <h2 :id="`market-${list.id}`" class="text-xl font-medium text-highlighted">
              {{ t(`market.movers.${list.id}.title`) }}
            </h2>
            <p class="text-sm text-muted">{{ t(`market.movers.${list.id}.hint`) }}</p>
          </div>
          <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
            <li v-for="item in list.items" :key="item.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accented/50 focus-visible:outline-2 focus-visible:outline-secondary"
                @click="openItem(item.id)"
              >
                <MarketTile :name="item.name" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate font-semibold text-highlighted">{{ item.name }}</span>
                  <span class="truncate text-sm text-muted">
                    {{
                      t(list.side === 'sell' ? 'market.movers.sellsFor' : 'market.movers.buysFor', {
                        tier: item.tier,
                        amount: cents(list.side === 'sell' ? item.sell.one : item.buy.one),
                      })
                    }}
                  </span>
                </span>
                <span class="flex flex-col items-end">
                  <MarketDelta :percent="item.deltaPercent" />
                  <span class="text-sm text-muted tabular-nums">
                    {{ t('market.each', { price: formatItemPrice(item.price, locale) }) }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>

      <section class="flex flex-col gap-4" aria-labelledby="market-board">
        <h2 id="market-board" class="text-xl font-medium text-highlighted">
          {{ t('market.board') }}
        </h2>
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            class="w-full sm:w-72"
            :placeholder="t('market.search')"
            :aria-label="t('market.search')"
          />
          <div class="flex flex-wrap gap-2" role="group" :aria-label="t('market.tiers')">
            <UButton
              v-for="option in ['all', ...tiers] as const"
              :key="option"
              size="sm"
              color="neutral"
              :variant="tierFilter === option ? 'solid' : 'outline'"
              :aria-pressed="tierFilter === option"
              :label="option === 'all' ? t('market.all') : t('market.tier', { tier: option })"
              @click="tierFilter = option"
            />
          </div>
        </div>

        <p v-if="!groups.length" class="rounded-lg bg-elevated px-5 py-8 text-center text-muted">
          {{ t('market.noMatch') }}
        </p>
        <div v-else class="overflow-x-auto rounded-lg bg-elevated px-2 py-1">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="px-3 py-2 font-semibold">{{ t('market.cols.item') }}</th>
                <th class="px-3 py-2 text-right font-semibold">{{ t('market.cols.price') }}</th>
                <th class="px-3 py-2 font-semibold">{{ t('market.cols.vsBase') }}</th>
                <th class="hidden px-3 py-2 font-semibold md:table-cell">
                  {{ t('market.cols.sell') }}
                </th>
                <th class="hidden px-3 py-2 font-semibold md:table-cell">
                  {{ t('market.cols.buy') }}
                </th>
                <th class="hidden w-32 px-3 py-2 font-semibold md:table-cell">
                  {{ t('market.cols.last24') }}
                </th>
              </tr>
            </thead>
            <tbody v-for="group in groups" :key="group.tier" class="divide-y divide-default">
              <tr>
                <th colspan="6" class="px-3 pt-4 pb-1 text-left">
                  <span class="block font-semibold text-highlighted">
                    {{ t('market.tier', { tier: group.tier }) }}
                  </span>
                  <span class="block font-normal text-muted">{{
                    t(`market.blurb.${group.tier}`)
                  }}</span>
                </th>
              </tr>
              <tr
                v-for="item in group.items"
                :key="item.id"
                class="cursor-pointer hover:bg-accented/50"
                @click="openItem(item.id)"
              >
                <td class="px-3 py-2.5">
                  <button
                    type="button"
                    class="flex min-w-0 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-secondary"
                    @click.stop="openItem(item.id)"
                  >
                    <MarketTile :name="item.name" />
                    <span class="flex min-w-0 flex-col">
                      <span class="truncate font-semibold text-highlighted">{{ item.name }}</span>
                      <span class="truncate text-xs text-muted">{{ item.id }}</span>
                    </span>
                  </button>
                </td>
                <td class="px-3 py-2.5 text-right font-semibold text-highlighted tabular-nums">
                  {{ formatItemPrice(item.price, locale) }}
                </td>
                <td class="px-3 py-2.5"><MarketDelta :percent="item.deltaPercent" /></td>
                <td class="hidden px-3 py-2.5 md:table-cell">
                  <template v-if="item.sellable">
                    <span class="block font-semibold text-highlighted tabular-nums">{{
                      cents(item.sell.one)
                    }}</span>
                    <span class="block text-xs text-muted tabular-nums">{{
                      t('market.for64', { amount: cents(item.sell.stack) })
                    }}</span>
                  </template>
                  <span v-else class="text-muted">{{ t('market.notBought') }}</span>
                </td>
                <td class="hidden px-3 py-2.5 md:table-cell">
                  <template v-if="item.buyable">
                    <span class="block font-semibold text-highlighted tabular-nums">{{
                      cents(item.buy.one)
                    }}</span>
                    <span class="block text-xs text-muted tabular-nums">{{
                      t('market.for64', { amount: cents(item.buy.stack) })
                    }}</span>
                  </template>
                  <span v-else class="text-muted">{{ t('market.notSold') }}</span>
                </td>
                <td class="hidden px-3 py-2.5 md:table-cell">
                  <MarketSpark :values="item.sparkline" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-muted">{{ t('market.footnote') }}</p>
      </section>

      <MarketDrawer :items="data.items" />
    </template>
  </UContainer>
</template>
