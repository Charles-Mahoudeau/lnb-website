<script setup lang="ts">
import { marketPRef } from '#shared/utils/market';
import type { MarketCurve } from '#shared/utils/market';

// An item's price against its stock, drawn with the pricing the server uses: the reference price,
// the sell and buy prices around it (the spread band) and where the stock is now. Colors are text
// tokens, so both modes work (docs/design.md).
const props = defineProps<{ curve: MarketCurve; sigma: number; stock: number; name: string }>();
const { t, locale } = useI18n();

const W = 560;
const H = 230;
const LEFT = 52;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 30;

const xMax = computed(() => 3 * props.curve.s0);
const yMax = computed(() => props.curve.pMax * (1 + props.sigma) * 1.05);
const x = (stock: number) => LEFT + (Math.min(stock, xMax.value) / xMax.value) * (W - LEFT - RIGHT);
const y = (price: number) =>
  TOP + (1 - Math.min(price, yMax.value) / yMax.value) * (H - TOP - BOTTOM);

const samples = computed(() => curveSamples(props.curve, xMax.value));
const line = (factor: number) =>
  samples.value
    .map((s, i) => `${i ? 'L' : 'M'}${x(s.stock).toFixed(1)} ${y(s.price * factor).toFixed(1)}`)
    .join(' ');
const band = computed(
  () =>
    `${line(1 + props.sigma)} ${samples.value
      .toReversed()
      .map((s) => `L${x(s.stock).toFixed(1)} ${y(s.price * (1 - props.sigma)).toFixed(1)}`)
      .join(' ')} Z`,
);

const price = (value: number) => formatItemPrice(value, locale.value);
const yTicks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((share) => yMax.value * share));
const now = computed(() => {
  const stock = Math.min(props.stock, xMax.value);
  return {
    x: x(stock),
    y: y(marketPRef(props.curve, Math.max(props.stock, props.curve.sMin))),
    price: marketPRef(props.curve, Math.max(props.stock, props.curve.sMin)),
  };
});
const nowLabel = computed(() =>
  t('admin.market.chart.now', {
    ratio: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(
      props.stock / props.curve.s0,
    ),
    price: price(now.value.price),
  }),
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      :aria-label="t('admin.market.chart.label', { name })"
      class="w-full"
    >
      <g v-for="tick in yTicks" :key="tick">
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
          {{ price(tick) }}
        </text>
      </g>
      <text
        v-for="m in [0, 1, 2, 3]"
        :key="m"
        :x="x(m * curve.s0)"
        :y="H - 8"
        text-anchor="middle"
        class="fill-current text-sm text-muted"
      >
        {{ m }}× s0
      </text>
      <line
        :x1="x(curve.s0)"
        :x2="x(curve.s0)"
        :y1="TOP"
        :y2="H - BOTTOM"
        stroke-dasharray="3 4"
        class="stroke-current text-dimmed"
      />
      <path :d="band" class="fill-current text-secondary/15" />
      <path
        :d="line(1 + sigma)"
        fill="none"
        stroke-width="1.2"
        stroke-dasharray="4 3"
        class="stroke-current text-muted"
      />
      <path
        :d="line(1 - sigma)"
        fill="none"
        stroke-width="1.2"
        stroke-dasharray="4 3"
        class="stroke-current text-muted"
      />
      <path :d="line(1)" fill="none" stroke-width="2.2" class="stroke-current text-highlighted" />
      <circle :cx="now.x" :cy="now.y" r="7.5" class="fill-current text-default" />
      <circle :cx="now.x" :cy="now.y" r="5.5" class="fill-current text-secondary" />
      <text
        :x="now.x + (now.x > W - 120 ? -10 : 10)"
        :y="now.y - 10"
        :text-anchor="now.x > W - 120 ? 'end' : 'start'"
        class="fill-current text-sm font-semibold text-highlighted"
      >
        {{ nowLabel }}
      </text>
    </svg>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <span class="flex items-center gap-1.5">
        <span class="h-0.5 w-4 bg-inverted" aria-hidden="true" />{{
          t('admin.market.chart.reference')
        }}
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-0.5 w-4 border-t border-dashed border-muted" aria-hidden="true" />{{
          t('admin.market.chart.sellBuy')
        }}
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-2 w-4 bg-secondary/15" aria-hidden="true" />{{
          t('admin.market.chart.spread', { percent: Math.round(sigma * 100) })
        }}
      </span>
    </div>
  </div>
</template>
