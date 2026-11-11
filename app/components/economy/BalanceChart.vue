<script setup lang="ts">
import type { EconomyBalanceHistory } from '#shared/schemas/economy';

// The balance at the end of each day as a line, over the money in and out each day as dimmed
// bars along the bottom, on their own scale. Colors are the text tokens (docs/design.md).
// `wide` draws it flatter, for full-width pages such as the admin account page.
const props = defineProps<{ days: EconomyBalanceHistory['days']; wide?: boolean }>();
const { t, locale } = useI18n();

const H = 200;
const LEFT = 52;
const BOTTOM = 24;
const TOP = 8;
// The height is fixed in drawing units, so a wider drawing keeps the chart lower on screen.
const W = props.wide ? 1100 : 600;
const plotW = W - LEFT - 6;
const plotH = H - BOTTOM - TOP;
// The bars take the bottom third, under the line.
const barsH = plotH / 3;

const range = computed(() => {
  const values = props.days.map((day) => day.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(1, max * 0.1) : (max - min) * 0.1;
  return { low: Math.max(0, min - pad), high: max + pad };
});
const bandW = computed(() => plotW / Math.max(1, props.days.length));
const x = (i: number) => LEFT + i * bandW.value + bandW.value / 2;
const y = (value: number) =>
  TOP + plotH - ((value - range.value.low) / (range.value.high - range.value.low)) * plotH;

const path = computed(() =>
  props.days
    .map((day, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(day.balance).toFixed(1)}`)
    .join(' '),
);
const topVolume = computed(() => Math.max(1, ...props.days.map((day) => day.in + day.out)));
const bars = computed(() =>
  props.days.map((day, i) => {
    const h = ((day.in + day.out) / topVolume.value) * barsH;
    return {
      key: day.day,
      x: LEFT + i * bandW.value + Math.min(1.5, bandW.value / 6),
      w: Math.max(1, bandW.value - Math.min(3, bandW.value / 3)),
      y: TOP + plotH - h,
      h,
      // A native tooltip with the day's numbers, for mouse and keyboard-less reading.
      label: t('economy.balance.dayLabel', {
        day: formatEconomyDay(day.day, locale.value),
        balance: formatLnbits(day.balance, locale.value),
        in: formatLnbits(day.in, locale.value),
        out: formatLnbits(day.out, locale.value),
      }),
    };
  }),
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
  return [...new Set([0, Math.round(last / 2), last])].map((i) => ({
    x: x(i),
    anchor: i === last && last > 0 ? 'end' : i === 0 && last > 0 ? 'start' : 'middle',
    text: formatEconomyDay(props.days[i]!.day, locale.value),
  }));
});
const summary = computed(() =>
  t('economy.balance.chartLabel', {
    from: formatLnbits(props.days[0]?.balance ?? 0, locale.value),
    to: formatLnbits(props.days.at(-1)?.balance ?? 0, locale.value),
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
      <rect
        v-for="bar in bars"
        :key="bar.key"
        :x="bar.x"
        :y="bar.y"
        :width="bar.w"
        :height="bar.h"
        rx="1.5"
        class="fill-current text-dimmed"
      >
        <title>{{ bar.label }}</title>
      </rect>
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
        :cy="y(days[0]!.balance)"
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
