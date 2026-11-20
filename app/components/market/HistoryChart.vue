<script setup lang="ts">
// An item's price over a period as one line in the highlight color, with the base price dashed when
// it falls inside the range. Text tokens only, so both modes work (docs/design.md).
const props = defineProps<{
  points: { at: string; price: number }[];
  p0: number;
  name: string;
  period: string;
}>();
const { t, locale } = useI18n();

const W = 460;
const H = 190;
const LEFT = 60;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 26;

const prices = computed(() => props.points.map((p) => p.price));
const range = computed(() => {
  const lo = Math.min(...prices.value);
  const hi = Math.max(...prices.value);
  const pad = (hi - lo || hi * 0.1) * 0.15;
  return { lo: lo - pad, hi: hi + pad };
});
const x = (i: number) => LEFT + (i / Math.max(1, props.points.length - 1)) * (W - LEFT - RIGHT);
const y = (price: number) =>
  TOP + (1 - (price - range.value.lo) / (range.value.hi - range.value.lo)) * (H - TOP - BOTTOM);
const path = computed(() =>
  prices.value
    .map((price, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(price).toFixed(1)}`)
    .join(' '),
);
const ticks = computed(() => [
  range.value.lo,
  (range.value.lo + range.value.hi) / 2,
  range.value.hi,
]);
const showBase = computed(() => props.p0 > range.value.lo && props.p0 < range.value.hi);
const last = computed(() => ({ x: x(prices.value.length - 1), y: y(prices.value.at(-1) ?? 0) }));
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    role="img"
    :aria-label="t('market.drawer.chart', { name, period })"
    class="w-full"
  >
    <g v-for="tick in ticks" :key="tick">
      <line
        :x1="LEFT"
        :x2="W - RIGHT"
        :y1="y(tick)"
        :y2="y(tick)"
        class="stroke-current text-muted/30"
      />
      <text
        :x="LEFT - 8"
        :y="y(tick) + 4"
        text-anchor="end"
        class="fill-current text-sm text-muted"
      >
        {{ formatItemPrice(tick, locale) }}
      </text>
    </g>
    <line
      v-if="showBase"
      :x1="LEFT"
      :x2="W - RIGHT"
      :y1="y(p0)"
      :y2="y(p0)"
      stroke-dasharray="3 4"
      class="stroke-current text-dimmed"
    />
    <path :d="path" fill="none" stroke-width="2" class="stroke-current text-highlighted" />
    <circle :cx="last.x" :cy="last.y" r="5" class="fill-current text-secondary" />
    <text :x="LEFT" :y="H - 6" class="fill-current text-sm text-muted">
      {{ t(`market.drawer.ago.${period}`) }}
    </text>
    <text :x="W - RIGHT" :y="H - 6" text-anchor="end" class="fill-current text-sm text-muted">
      {{ t('market.drawer.now') }}
    </text>
  </svg>
</template>
