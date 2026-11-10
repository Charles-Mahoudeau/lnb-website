<script setup lang="ts">
import type { EconomyStats } from '#shared/schemas/economy';

// Money created (above the line, highlight) and destroyed (below, dimmed) per day, on one scale.
const props = defineProps<{ days: EconomyStats['days'] }>();
const { t, locale } = useI18n();

const W = 600;
const H = 200;
const LEFT = 52;
const BOTTOM = 24;
const TOP = 8;
const plotW = W - LEFT - 6;
const plotH = H - BOTTOM - TOP;
const mid = TOP + plotH / 2;

const top = computed(() => Math.max(1, ...props.days.flatMap((day) => [day.minted, day.burned])));
const bandW = computed(() => plotW / Math.max(1, props.days.length));
const scale = (value: number) => (value / top.value) * (plotH / 2);
const bars = computed(() =>
  props.days.map((day, i) => ({
    key: day.day,
    x: LEFT + i * bandW.value + Math.min(1.5, bandW.value / 6),
    w: Math.max(1, bandW.value - Math.min(3, bandW.value / 3)),
    minted: scale(day.minted),
    burned: scale(day.burned),
  })),
);
const compact = (value: number) =>
  new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
const labels = computed(() => {
  const last = props.days.length - 1;
  return [...new Set([0, Math.round(last / 2), last])].map((i) => ({
    x: LEFT + i * bandW.value + bandW.value / 2,
    anchor: i === last && last > 0 ? 'end' : i === 0 && last > 0 ? 'start' : 'middle',
    text: formatEconomyDay(props.days[i]!.day, locale.value),
  }));
});
const summary = computed(() =>
  t('admin.economy.charts.flowLabel', {
    minted: formatLnbits(
      props.days.reduce((sum, day) => sum + day.minted, 0),
      locale.value,
    ),
    burned: formatLnbits(
      props.days.reduce((sum, day) => sum + day.burned, 0),
      locale.value,
    ),
  }),
);
</script>

<template>
  <div class="overflow-x-auto">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" class="w-full min-w-lg">
      <line :x1="LEFT" :x2="W - 6" :y1="TOP" :y2="TOP" class="stroke-current text-muted/30" />
      <line
        :x1="LEFT"
        :x2="W - 6"
        :y1="TOP + plotH"
        :y2="TOP + plotH"
        class="stroke-current text-muted/30"
      />
      <text :x="LEFT - 8" :y="TOP + 4" text-anchor="end" class="fill-current text-xs text-muted">
        +{{ compact(top) }}
      </text>
      <text :x="LEFT - 8" :y="mid + 4" text-anchor="end" class="fill-current text-xs text-muted">
        0
      </text>
      <text
        :x="LEFT - 8"
        :y="TOP + plotH + 4"
        text-anchor="end"
        class="fill-current text-xs text-muted"
      >
        −{{ compact(top) }}
      </text>
      <g v-for="bar in bars" :key="bar.key">
        <rect
          v-if="bar.minted"
          :x="bar.x"
          :y="mid - bar.minted"
          :width="bar.w"
          :height="bar.minted"
          rx="1.5"
          class="fill-current text-highlighted"
        />
        <rect
          v-if="bar.burned"
          :x="bar.x"
          :y="mid"
          :width="bar.w"
          :height="bar.burned"
          rx="1.5"
          class="fill-current text-dimmed"
        />
      </g>
      <line :x1="LEFT" :x2="W - 6" :y1="mid" :y2="mid" class="stroke-current text-muted" />
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
