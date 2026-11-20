<script setup lang="ts">
// A price against its base price: an arrow and a percentage, as text. No red or green: those colors
// mean actions and state (docs/design.md).
const props = defineProps<{ percent: number }>();
const { locale } = useI18n();
const up = computed(() => props.percent >= 0);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-highlighted tabular-nums"
  >
    <UIcon :name="up ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3.5" />
    {{ formatMarketDelta(percent, locale) }}
  </span>
</template>
