<script setup lang="ts">
import type { EconomyStats } from '#shared/schemas/economy';

// Money in circulation at the end of each day: one line, on a faint grid. Colors are the text
// tokens, so both modes work (docs/design.md).
const props = defineProps<{ days: EconomyStats['days'] }>();
const { t, locale } = useI18n();

const W = 600;
const H = 200;
const LEFT = 52;
const BOTTOM = 24;
const TOP = 8;
const plotW = W - LEFT - 6;
const plotH = H - BOTTOM - TOP;

const range = computed(() => {
  const values = props.days.map((day) => day.supply);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat line sits in the middle rather than on an edge.
  const pad = max === min ? Math.max(1, max * 0.05) : (max - min) * 0.1;
  return { low: Math.max(0, min - pad), high: max + pad };
});
const y = (value: number) =>
  TOP + plotH - ((value - range.value.low) / (range.value.high - range.value.low)) * plotH;
const x = (i: number) =>
  LEFT + (props.days.length > 1 ? (i * plotW) / (props.days.length - 1) : plotW / 2);

const path = computed(() =>
  props.days
    .map((day, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(day.supply).toFixed(1)}`)
    .join(' '),
);
const compact = (value: number) =>
  new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
const ticks = computed(() =>
  [0, 0.5, 1].map((share) => {
    const value = range.value.low + (range.value.high - range.value.low) * share;
    return { y: y(value), label: compact(value) };
  }),
);
const labels = computed(() => {
  const last = props.days.length - 1;
  const picks = [...new Set([0, Math.round(last / 2), last])];
  return picks.map((i) => ({
    x: x(i),
    anchor: i === last && last > 0 ? 'end' : i === 0 && last > 0 ? 'start' : 'middle',
    text: formatEconomyDay(props.days[i]!.day, locale.value),
  }));
});
const summary = computed(() =>
  t('admin.economy.charts.supplyLabel', {
    from: formatLnbits(props.days[0]?.supply ?? 0, locale.value),
    to: formatLnbits(props.days.at(-1)?.supply ?? 0, locale.value),
  }),
);
</script>

<template>
  <div class="overflow-x-auto">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" class="w-full min-w-lg">
      <g v-for="tick in ticks" :key="tick.y">
        <line
          :x1="LEFT"
          :x2="W - 6"
          :y1="tick.y"
          :y2="tick.y"
          class="stroke-current text-muted/30"
        />
        <text
          :x="LEFT - 8"
          :y="tick.y + 4"
          text-anchor="end"
          class="fill-current text-xs text-muted"
        >
          {{ tick.label }}
        </text>
      </g>
      <path
        :d="path"
        fill="none"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        class="stroke-current text-highlighted"
      />
      <circle
        v-if="days.length === 1"
        :cx="x(0)"
        :cy="y(days[0]!.supply)"
        r="4"
        class="fill-current text-highlighted"
      />
      <text
        v-for="label in labels"
        :key="label.x"
        :x="label.x"
        :y="H - 6"
        :text-anchor="label.anchor"
        class="fill-current text-xs text-muted"
      >
        {{ label.text }}
      </text>
    </svg>
  </div>
</template>
