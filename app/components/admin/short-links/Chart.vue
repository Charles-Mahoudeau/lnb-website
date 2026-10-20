<script setup lang="ts">
import type { ShortLinkDetail } from '#shared/schemas/short-links';

// Clicks per day, stacked: signed in on the bottom, not signed in above. One scale for the bars,
// the grid and the labels. Colors are the text tokens, so both modes work.
const props = defineProps<{ days: ShortLinkDetail['days'] }>();
const { t, d } = useI18n();

const W = 600;
const H = 190;
const LEFT = 34;
const BOTTOM = 24;
const TOP = 8;
const plotW = W - LEFT - 6;
const plotH = H - BOTTOM - TOP;

const top = computed(() => {
  const max = Math.max(1, ...props.days.map((day) => day.signedIn + day.anonymous));
  // Four steps of a round size, so the tick labels are whole numbers.
  const step = Math.max(1, Math.ceil(max / 4));
  return step * 4;
});
const bandW = computed(() => plotW / props.days.length);
const ticks = computed(() =>
  [0, 1, 2, 3, 4].map((i) => ({ value: (top.value * i) / 4, y: TOP + plotH - (plotH * i) / 4 })),
);
const bars = computed(() =>
  props.days.map((day, i) => {
    const signed = (day.signedIn / top.value) * plotH;
    const anon = (day.anonymous / top.value) * plotH;
    return {
      x: LEFT + i * bandW.value + 1.5,
      w: bandW.value - 3,
      signedY: TOP + plotH - signed,
      signed,
      anonY: TOP + plotH - signed - anon,
      anon,
    };
  }),
);
const labels = computed(() => {
  const last = props.days.length - 1;
  return [0, 10, 20, last].map((i) => ({
    x: LEFT + i * bandW.value + bandW.value / 2,
    anchor: i === last ? 'end' : i === 0 ? 'start' : 'middle',
    text: d(`${props.days[i]!.day}T12:00:00`, { day: 'numeric', month: 'short' }),
  }));
});
const summary = computed(() =>
  t('admin.shortLinks.detail.chartLabel', {
    count: props.days.reduce((sum, day) => sum + day.signedIn + day.anonymous, 0),
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
          :x="LEFT - 6"
          :y="tick.y + 4"
          text-anchor="end"
          class="fill-current text-xs text-muted"
        >
          {{ tick.value }}
        </text>
      </g>
      <g v-for="(bar, i) in bars" :key="days[i]!.day">
        <rect
          :x="bar.x"
          :y="bar.anonY"
          :width="bar.w"
          :height="bar.anon"
          rx="1.5"
          class="fill-current text-dimmed"
        />
        <rect
          :x="bar.x"
          :y="bar.signedY"
          :width="bar.w"
          :height="bar.signed"
          rx="1.5"
          class="fill-current text-highlighted"
        />
      </g>
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
