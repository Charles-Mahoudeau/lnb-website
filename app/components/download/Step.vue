<script setup lang="ts">
// One step of the download page: its number on the left, then a raised band with an icon tile, the
// title, one line and the step's content (docs/downloads.md). The numbers are a real sequence.
defineProps<{ number: number; icon: string; title: string; lede: string }>();
</script>

<template>
  <li class="flex items-start gap-3 sm:gap-4">
    <span
      class="grid size-8 shrink-0 place-items-center rounded-full bg-accented font-display text-sm tabular-nums sm:size-10 sm:text-base"
    >
      {{ number }}
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-4 rounded-lg bg-elevated p-4 sm:p-6">
      <div class="flex items-start gap-4">
        <IconTile :icon="icon" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h2 class="text-xl">{{ title }}</h2>
          <p class="max-w-prose text-muted">{{ lede }}</p>
        </div>
      </div>
      <slot />
    </div>
  </li>
</template>
