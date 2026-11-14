<script setup lang="ts">
import type { GamesplanetDeal } from '#shared/schemas/gamesplanet';

// The game of an evening, as a deal, under the registration box: for people who need to buy it
// first. The "Partner deal" badge is the only disclosure here (docs/design.md).
defineProps<{ deal: GamesplanetDeal }>();

const { t, locale } = useI18n();
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
    <GamesplanetBadge variant="deal" class="self-start" />
    <div class="flex gap-4">
      <span
        class="relative aspect-2/3 w-21 shrink-0 self-start overflow-hidden rounded-md bg-accented"
      >
        <img
          v-if="deal.packshot"
          :src="deal.packshot"
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
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 class="text-lg font-bold text-highlighted">{{ t('gamesplanet.event.title') }}</h2>
        <p class="font-semibold text-default">{{ deal.name }}</p>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        </p>
        <p v-if="deal.endsAt" class="text-xs text-muted">
          {{ t('gamesplanet.until', { date: formatDealEnd(deal.endsAt, locale) }) }}
        </p>
      </div>
    </div>
    <p class="text-sm text-muted">{{ t('gamesplanet.event.lede') }}</p>
    <UButton
      :to="gamesplanetGoUrl(deal.uid, 'event')"
      target="_blank"
      external
      rel="sponsored noopener noreferrer"
      color="neutral"
      variant="soft"
      block
      trailing-icon="i-lucide-external-link"
      :label="t('gamesplanet.event.button')"
    />
  </section>
</template>
