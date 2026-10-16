<script setup lang="ts">
// An icon on a small tile tinted with the second accent (docs/design.md): activities, admin
// overview items. Decoration only, so it's hidden from screen readers.
defineProps<{ icon: string }>();
</script>

<template>
  <span
    class="grid size-9 shrink-0 place-items-center rounded-md bg-secondary/15 text-secondary"
    aria-hidden="true"
  >
    <UIcon :name="icon" class="size-5" />
  </span>
</template>
