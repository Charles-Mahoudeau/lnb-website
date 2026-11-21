<script setup lang="ts">
// How much of a tier's daily allowance a player has used: the fill is the nominal value sold over
// the last 24 hours against the second threshold, and the tick marks the end of the full-rate part.
import type { MarketTierWindowView } from '#shared/schemas/market';

const props = defineProps<{ window: MarketTierWindowView }>();
const { t, locale } = useI18n();
const meter = computed(() => marketMeter(props.window.nominal, props.window.q1, props.window.q2));
const percent = (rate: number) => `${String(Math.round(rate * 100))}%`;
const left = computed(() => formatWholeLnbits(props.window.toNextBracket ?? 0, locale.value));
const text = computed(() => {
  const w = props.window;
  if (w.toNextBracket === null) return t('market.me.last', { rate: percent(w.rate) });
  return t(w.rate >= 1 ? 'market.me.full' : 'market.me.reduced', {
    left: left.value,
    next: percent(w.nextRate ?? w.rate),
  });
});
</script>

<template>
  <div class="flex flex-col gap-2 rounded-lg bg-elevated px-4 py-3.5">
    <div class="flex items-baseline justify-between gap-2">
      <h3 class="font-semibold text-highlighted">
        {{ t('market.tier', { tier: String(window.tier) }) }}
      </h3>
      <UBadge
        color="neutral"
        variant="subtle"
        :label="t('market.me.rate', { rate: percent(window.rate) })"
      />
    </div>
    <div
      role="meter"
      :aria-valuenow="Math.round(meter.fill)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="t('market.tier', { tier: String(window.tier) })"
      class="relative h-2 rounded-full bg-default"
    >
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-inverted"
        :style="{ width: `${meter.fill}%` }"
      />
      <div class="absolute -inset-y-0.75 w-0.5 bg-inverted" :style="{ left: `${meter.tick}%` }" />
    </div>
    <p class="text-sm text-muted">{{ text }}</p>
  </div>
</template>
