<script setup lang="ts">
// Every order the Minecraft server sent, newest first, 50 at a time. Filters run on the server.
import type { MarketAdminOrder } from '#shared/schemas/market';
import { marketItemName } from '#shared/utils/market';

const { t, locale, n } = useI18n();

const player = ref('');
const item = ref('');
const direction = ref<'all' | 'sell' | 'buy'>('all');
const cappedOnly = ref(false);
// The text filters apply once the typing pauses.
const applied = reactive({ player: '', item: '' });
let timer: ReturnType<typeof setTimeout> | undefined;
watch([player, item], () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    applied.player = player.value.trim();
    applied.item = item.value.trim().toLowerCase();
  }, 300);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

const query = computed(() => ({
  q: applied.player || undefined,
  item: applied.item || undefined,
  direction: direction.value === 'all' ? undefined : direction.value,
  capped: cappedOnly.value ? ('true' as const) : undefined,
}));

const { data, error, status } = await useFetch<{
  items: MarketAdminOrder[];
  nextCursor: string | null;
}>('/api/economy/admin/market/orders', { key: 'market-admin-orders', query });

const more = ref<MarketAdminOrder[]>([]);
const cursor = ref<string | null>(null);
const loadingMore = ref(false);
watch(
  data,
  (page) => {
    more.value = [];
    cursor.value = page?.nextCursor ?? null;
  },
  { immediate: true },
);
const rows = computed(() => [...(data.value?.items ?? []), ...more.value]);

async function showMore() {
  loadingMore.value = true;
  try {
    const page = await marketAdminActions.orders({
      ...query.value,
      cursor: cursor.value ?? undefined,
    });
    more.value = [...more.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch {
    // The button stays: try again.
  } finally {
    loadingMore.value = false;
  }
}

const sides = computed(() => [
  { value: 'all', label: t('admin.market.orders.allSides') },
  { value: 'sell', label: t('admin.market.orders.sold') },
  { value: 'buy', label: t('admin.market.orders.bought') },
]);
const when = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="player"
        icon="i-lucide-search"
        :placeholder="t('admin.market.orders.player')"
        :aria-label="t('admin.market.orders.player')"
        class="w-full sm:w-56"
      />
      <UInput
        v-model="item"
        :placeholder="t('admin.market.orders.item')"
        :aria-label="t('admin.market.orders.item')"
        class="w-full sm:w-56"
      />
      <USelect
        v-model="direction"
        :items="sides"
        :aria-label="t('admin.market.orders.side')"
        class="w-40"
      />
      <UButton
        size="md"
        :color="cappedOnly ? 'secondary' : 'neutral'"
        :variant="cappedOnly ? 'subtle' : 'outline'"
        :aria-pressed="cappedOnly"
        :label="t('admin.market.orders.cappedOnly')"
        @click="cappedOnly = !cappedOnly"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.market.loadFailed')"
    />
    <div
      v-else-if="status !== 'pending' && !rows.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-receipt" />
      <h3 class="text-xl font-medium text-highlighted">{{ t('admin.market.orders.empty') }}</h3>
      <p class="max-w-md text-muted">{{ t('admin.market.orders.emptyBody') }}</p>
    </div>
    <div v-else class="overflow-x-auto rounded-lg bg-elevated px-2 py-1">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default text-left text-highlighted">
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.market.orders.when') }}</th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.market.orders.playerCol') }}</th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.market.orders.itemCol') }}</th>
            <th class="hidden px-3 py-2.5 font-semibold sm:table-cell">
              {{ t('admin.market.orders.side') }}
            </th>
            <th class="px-3 py-2.5 text-right font-semibold">
              {{ t('admin.market.orders.items') }}
            </th>
            <th class="px-3 py-2.5 text-right font-semibold">
              {{ t('admin.market.orders.total') }}
            </th>
            <th class="hidden px-3 py-2.5 sm:table-cell" />
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="row in rows" :key="row.id">
            <td class="px-3 py-2.5 whitespace-nowrap text-muted">{{ when(row.at) }}</td>
            <td class="px-3 py-2.5">
              <NuxtLink
                v-if="row.userId"
                :to="`/admin/people/${row.userId}/summary`"
                class="hover:underline"
                >{{ row.name || row.userId }}</NuxtLink
              >
              <span v-else class="text-muted">{{ row.name || '—' }}</span>
            </td>
            <td class="px-3 py-2.5">{{ marketItemName(row.item) }}</td>
            <td class="hidden px-3 py-2.5 sm:table-cell">
              {{
                t(
                  row.direction === 'sell'
                    ? 'admin.market.orders.sold'
                    : 'admin.market.orders.bought',
                )
              }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums">
              {{ formatCount(row.quantity, locale) }}
            </td>
            <td class="px-3 py-2.5 text-right font-semibold tabular-nums">
              {{
                row.direction === 'sell'
                  ? formatSignedLnbits(row.total, locale)
                  : formatSignedLnbits(-row.total, locale)
              }}
            </td>
            <td class="hidden px-3 py-2.5 sm:table-cell">
              <UBadge
                v-if="row.capped"
                color="warning"
                variant="subtle"
                :label="t('admin.market.orders.capped')"
              />
              <UBadge
                v-else-if="row.rate !== null && row.rate < 1"
                color="neutral"
                variant="outline"
                :label="
                  t('admin.market.orders.atRate', {
                    rate: n(row.rate, { style: 'percent', maximumFractionDigits: 0 }),
                  })
                "
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="cursor" class="flex justify-center">
      <UButton
        color="neutral"
        variant="outline"
        :loading="loadingMore"
        :label="t('admin.market.orders.more')"
        @click="showMore"
      />
    </div>
  </div>
</template>
