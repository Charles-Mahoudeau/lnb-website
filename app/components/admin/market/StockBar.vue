<script setup lang="ts">
// A stock against its target on a 0 to 3x scale, with a tick at 1x (the target).
const props = defineProps<{ stock: number; s0: number }>();
const { t, locale } = useI18n();

const ratio = computed(() => props.stock / props.s0);
const status = computed(() => stockStatus(props.stock, props.s0));
const ratioText = computed(() =>
  new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(ratio.value),
);
</script>

<template>
  <div class="flex min-w-32 flex-col gap-1">
    <div class="relative h-1.5 rounded-full bg-accented">
      <div
        class="h-full rounded-full bg-inverted"
        :style="{ width: `${Math.min(100, (ratio / MARKET_FLOODED) * 100)}%` }"
      />
      <span
        class="absolute -top-0.5 h-2.5 w-0.5 bg-inverted/50"
        :style="{ left: `${100 / MARKET_FLOODED}%` }"
      />
    </div>
    <span class="flex items-center gap-2 text-xs text-muted tabular-nums">
      {{ t('admin.market.stock.ratio', { ratio: ratioText }) }}
      <UBadge
        v-if="status"
        color="warning"
        variant="subtle"
        size="sm"
        :label="t(`admin.market.stock.${status}`)"
      />
    </span>
  </div>
</template>
