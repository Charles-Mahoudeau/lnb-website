<script setup lang="ts">
// The item's initials on a muted square: the Market has no item art yet.
const props = defineProps<{ name: string; large?: boolean }>();
const initials = computed(() =>
  props.name
    .split(' ')
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join(''),
);
</script>

<template>
  <span
    aria-hidden="true"
    class="grid shrink-0 place-items-center rounded-md bg-accented font-semibold text-highlighted"
    :class="large ? 'size-11 text-base' : 'size-8 text-xs'"
  >
    {{ initials }}
  </span>
</template>
