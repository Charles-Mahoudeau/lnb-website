<script setup lang="ts">
// The Market catalog (docs/market.md): every item by tier, in a table. A row opens the item's
// drawer (`?item=`), where it is edited. The sell and buy columns say what is switched on.
const { t, locale } = useI18n();
const route = useRoute();

const { data, error } = await useMarketOverview();

type Filter = 'all' | '1' | '2' | '3' | 'off';
const filter = ref<Filter>('all');
const search = ref('');
const filters: Filter[] = ['all', '1', '2', '3', 'off'];

const groups = computed(() => {
  const term = search.value.trim().toLowerCase();
  const items = (data.value?.items ?? []).filter(
    (item) =>
      (filter.value === 'all' ||
        String(item.tier) === filter.value ||
        (filter.value === 'off' && (!item.sellable || !item.buyable || !item.enabled))) &&
      (!term || item.name.toLowerCase().includes(term) || item.id.includes(term)),
  );
  return [1, 2, 3]
    .map((tier) => ({ tier, items: items.filter((item) => item.tier === tier) }))
    .filter((group) => group.items.length);
});

const itemLink = (id: string) => ({ path: route.path, query: { ...route.query, item: id } });
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.market.loadFailed')"
  />
  <div v-else-if="data" class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('admin.market.catalog.search')"
        :aria-label="t('admin.market.catalog.search')"
        class="w-full sm:w-64"
      />
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('admin.market.catalog.filter')">
        <UButton
          v-for="option in filters"
          :key="option"
          size="md"
          :color="filter === option ? 'secondary' : 'neutral'"
          :variant="filter === option ? 'subtle' : 'outline'"
          :aria-pressed="filter === option"
          :label="
            option === 'all'
              ? t('admin.market.catalog.all')
              : option === 'off'
                ? t('admin.market.catalog.off')
                : t('admin.market.tier', { tier: option })
          "
          @click="filter = option"
        />
      </div>
    </div>

    <div
      v-if="!groups.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-store" />
      <h3 class="text-xl font-medium text-highlighted">{{ t('admin.market.catalog.empty') }}</h3>
    </div>
    <div v-else class="overflow-x-auto rounded-lg bg-elevated px-2 py-1">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default text-left text-highlighted">
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.market.catalog.item') }}</th>
            <th class="hidden px-3 py-2.5 text-right font-semibold md:table-cell">
              {{ t('admin.market.catalog.price') }}
            </th>
            <th class="hidden px-3 py-2.5 text-right font-semibold md:table-cell">
              {{ t('admin.market.catalog.vsBase') }}
            </th>
            <th class="hidden px-3 py-2.5 font-semibold md:table-cell">
              {{ t('admin.market.catalog.stock') }}
            </th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.market.catalog.sell') }}</th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.market.catalog.buy') }}</th>
            <th class="px-3 py-2.5">
              <span class="sr-only">{{ t('admin.market.catalog.edit') }}</span>
            </th>
          </tr>
        </thead>
        <template v-for="group in groups" :key="group.tier">
          <tbody class="divide-y divide-default">
            <tr>
              <th colspan="7" class="px-3 pt-4 pb-1 text-left font-semibold text-highlighted">
                {{ t('admin.market.tier', { tier: group.tier }) }}
                <span class="ml-1 font-normal text-muted">{{
                  t('admin.market.catalog.count', { n: group.items.length }, group.items.length)
                }}</span>
              </th>
            </tr>
            <tr v-for="item in group.items" :key="item.id" :class="{ 'opacity-60': !item.enabled }">
              <td class="px-3 py-2.5">
                <NuxtLink :to="itemLink(item.id)" class="flex items-center gap-2.5">
                  <MarketTile :name="item.name" />
                  <span>
                    <span class="block font-semibold text-highlighted hover:underline">{{
                      item.name
                    }}</span>
                    <span class="block text-xs text-muted">{{ item.id }}</span>
                  </span>
                </NuxtLink>
              </td>
              <td class="hidden px-3 py-2.5 text-right font-semibold tabular-nums md:table-cell">
                {{ formatItemPrice(item.price, locale) }}
              </td>
              <td class="hidden px-3 py-2.5 text-right text-muted tabular-nums md:table-cell">
                {{ formatPercentVsBase(percentVsBase(item.price, item.p0)) }}
              </td>
              <td class="hidden px-3 py-2.5 md:table-cell">
                <AdminMarketStockBar :stock="item.stock" :s0="item.s0" />
              </td>
              <td class="px-3 py-2.5">
                <UIcon
                  :name="item.sellable ? 'i-lucide-check' : 'i-lucide-minus'"
                  :class="item.sellable ? 'text-highlighted' : 'text-dimmed'"
                />
                <span class="sr-only">{{
                  t(item.sellable ? 'admin.market.catalog.on' : 'admin.market.catalog.offState')
                }}</span>
              </td>
              <td class="px-3 py-2.5">
                <UIcon
                  :name="item.buyable ? 'i-lucide-check' : 'i-lucide-minus'"
                  :class="item.buyable ? 'text-highlighted' : 'text-dimmed'"
                />
                <span class="sr-only">{{
                  t(item.buyable ? 'admin.market.catalog.on' : 'admin.market.catalog.offState')
                }}</span>
              </td>
              <td class="px-3 py-2.5 text-right">
                <UButton
                  :to="itemLink(item.id)"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :label="t('admin.market.catalog.edit')"
                />
              </td>
            </tr>
          </tbody>
        </template>
      </table>
    </div>
  </div>
</template>
