<script setup lang="ts">
// A price against its base price: an arrow and a percentage. Green above, red below: the one place
// amounts take a status color (docs/design.md); the arrow and sign keep it readable without color.
const props = defineProps<{ percent: number }>();
const { locale } = useI18n();
const neutral = computed(() => Math.abs(props.percent) < 0.05);
const tone = computed(() =>
  neutral.value ? 'text-highlighted' : props.percent > 0 ? 'text-success' : 'text-error',
);
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
    class="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap tabular-nums"
    :class="tone"
  >
    <UIcon :name="icon" class="size-3.5" />
    {{ formatMarketDelta(percent, locale) }}
  </span>
</template>
