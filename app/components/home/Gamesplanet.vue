<script setup lang="ts">
import type { GamesplanetPublicView } from '#shared/schemas/gamesplanet';

// The Gamesplanet card in the home page's side column: one deal at a time on its cover, with
// arrows between the three. It never changes by itself and can't be dismissed, so it stays small.
// The "Partner deal" badge is the only disclosure here (docs/design.md).
const props = defineProps<{ data: GamesplanetPublicView }>();

const { t, locale } = useI18n();
const index = ref(0);
const deal = computed(() => props.data.deals[index.value]!);
const count = computed(() => props.data.deals.length);

function step(by: number) {
  index.value = (index.value + by + count.value) % count.value;
}
</script>

<template>
  <section class="flex flex-col overflow-hidden rounded-lg bg-elevated">
    <div class="dark relative isolate flex aspect-2/1 items-end overflow-hidden bg-banner-fallback">
      <img
        v-if="deal.cover"
        :src="deal.cover"
        alt=""
        class="absolute inset-0 -z-1 size-full object-cover"
      />
      <div class="absolute inset-0 -z-1 bg-linear-to-t from-banner via-banner/40 to-transparent" />
      <GamesplanetBadge variant="deal" plate class="absolute top-3 left-3" />
      <a
        :href="gamesplanetGoUrl(deal.uid, 'home')"
        target="_blank"
        rel="sponsored noopener noreferrer"
        class="group w-full p-4 text-lg font-bold text-on-banner"
      >
        <span class="group-hover:underline">{{ deal.name }}</span>
        <span class="sr-only">{{ t('gamesplanet.opensNew') }}</span>
      </a>
    </div>
    <div class="flex flex-col gap-3 p-5">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span v-if="deal.discountPercent !== null" class="text-sm text-muted line-through">
          <span class="sr-only">{{ t('gamesplanet.regularPrice') }}</span>
          {{ formatEuros(deal.basePriceCents, locale) }}
        </span>
        <span class="font-display text-xl text-highlighted">
          <span class="sr-only">{{ t('gamesplanet.nowPrice') }}</span>
          {{ formatEuros(deal.priceCents, locale) }}
        </span>
        <span
          v-if="deal.discountPercent !== null"
          class="rounded-full bg-accented px-2 py-0.5 text-xs font-semibold text-default"
        >
          −{{ deal.discountPercent }}%
        </span>
        <span v-if="deal.endsAt" class="text-xs text-muted">
          {{ t('gamesplanet.until', { date: formatDealEnd(deal.endsAt, locale) }) }}
        </span>
      </p>
      <p class="text-muted">{{ t('gamesplanet.home.lede') }}</p>
      <div class="flex items-center justify-between gap-3">
        <UButton
          :to="gamesplanetGoUrl(deal.uid, 'home')"
          target="_blank"
          external
          rel="sponsored noopener noreferrer"
          color="neutral"
          variant="soft"
          trailing-icon="i-lucide-external-link"
          :label="t('gamesplanet.home.button')"
        />
        <div v-if="count > 1" class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('gamesplanet.home.previous')"
            @click="step(-1)"
          />
          <span class="text-sm text-muted tabular-nums" aria-live="polite">
            {{ index + 1 }} / {{ count }}
          </span>
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            :aria-label="t('gamesplanet.home.next')"
            @click="step(1)"
          />
        </div>
      </div>
    </div>
  </section>
</template>
