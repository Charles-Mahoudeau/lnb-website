<script setup lang="ts">
// A small line of a price over the last day, in a text token, with a dot on the latest point.
const props = defineProps<{ values: number[] }>();
const W = 120;
const H = 30;
const points = computed(() => {
  const lo = Math.min(...props.values);
  const span = Math.max(...props.values) - lo || 1;
  return props.values.map((value, i) => ({
    x: 3 + (i / Math.max(1, props.values.length - 1)) * (W - 6),
    y: 3 + (1 - (value - lo) / span) * (H - 6),
  }));
});
const path = computed(() =>
  points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
);
const last = computed(() => points.value.at(-1));
</script>

<template>
  <svg
    v-if="values.length > 1"
    :viewBox="`0 0 ${W} ${H}`"
    aria-hidden="true"
    class="block h-7.5 w-full"
  >
    <path
      :d="path"
      fill="none"
      stroke-width="1.8"
      stroke-linejoin="round"
      stroke-linecap="round"
      class="stroke-current text-muted"
    />
    <circle v-if="last" :cx="last.x" :cy="last.y" r="3" class="fill-current text-secondary" />
  </svg>
</template>
