<script setup lang="ts">
// A price against its base price: an arrow and a percentage, as text. No red or green: those colors
// mean actions and state (docs/design.md).
const props = defineProps<{ percent: number }>();
const { locale } = useI18n();
const icon = computed(() =>
  Math.abs(props.percent) < 0.05
    ? 'i-lucide-minus'
    : props.percent > 0
      ? 'i-lucide-arrow-up'
      : 'i-lucide-arrow-down',
);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-highlighted tabular-nums"
  >
    <UIcon :name="icon" class="size-3.5" />
    {{ formatMarketDelta(percent, locale) }}
  </span>
</template>
