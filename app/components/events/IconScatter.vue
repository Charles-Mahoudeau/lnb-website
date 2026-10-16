<script setup lang="ts">
// Activity icons scattered over the right half of an event hero without banner art, or a strip
// above the text on phones. Decoration only, so it's hidden from screen readers.
const wide = scatterIcons(9, 8, 3);
const narrow = scatterIcons(8, 3, 5);
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 text-secondary">
    <div class="absolute inset-y-0 right-0 left-1/2 overflow-hidden max-lg:hidden">
      <UIcon
        v-for="(icon, index) in wide"
        :key="index"
        :name="icon.name"
        class="absolute"
        :style="icon.style"
      />
    </div>
    <div class="absolute inset-x-0 top-0 h-32 overflow-hidden lg:hidden">
      <UIcon
        v-for="(icon, index) in narrow"
        :key="index"
        :name="icon.name"
        class="absolute"
        :style="icon.style"
      />
    </div>
  </div>
</template>
