<script setup lang="ts">
import type { GamesplanetDeal, GamesplanetPlacement } from '#shared/schemas/gamesplanet';

// One deal as a row: thumbnail, name, prices, the discount and an external-link icon. The whole
// row is the link, and only the name underlines on hover. Prices are text, never a color.
defineProps<{ deal: GamesplanetDeal; from: GamesplanetPlacement }>();

const { t, locale } = useI18n();
</script>

<template>
  <a
    :href="gamesplanetGoUrl(deal.uid, from)"
    target="_blank"
    rel="sponsored noopener noreferrer"
    class="group flex items-center gap-4 py-3 first:pt-0"
  >
    <span
      class="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-accented sm:w-36"
    >
      <img
        v-if="deal.cover"
        :src="deal.cover"
        alt=""
        class="absolute inset-0 size-full object-cover"
        loading="lazy"
      />
      <UIcon
        v-else
        name="i-lucide-gamepad-2"
        class="absolute inset-0 m-auto size-6 text-muted"
        aria-hidden="true"
      />
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="line-clamp-2 font-semibold text-highlighted group-hover:underline">
        {{ deal.name }}
      </span>
      <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span v-if="deal.discountPercent !== null" class="text-sm text-muted line-through">
          <span class="sr-only">{{ t('gamesplanet.regularPrice') }}</span>
          {{ formatEuros(deal.basePriceCents, locale) }}
        </span>
        <span class="font-display text-lg text-highlighted">
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
      </span>
    </span>
    <UIcon name="i-lucide-external-link" class="size-4 shrink-0 text-muted" aria-hidden="true" />
    <span class="sr-only">{{ t('gamesplanet.opensNew') }}</span>
  </a>
</template>
