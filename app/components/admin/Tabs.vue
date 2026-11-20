<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

// The row of tabs under an admin page's navbar. Each tab is its own route. One tab or none shows
// no row. On a phone the row scrolls sideways.
const props = defineProps<{ items: { label: string; to: string; exact?: boolean }[] }>();
const route = useRoute();

const menu = computed<NavigationMenuItem[]>(() =>
  props.items.map((item) => ({
    label: item.label,
    to: item.to,
    active: item.exact
      ? route.path === item.to
      : route.path === item.to || route.path.startsWith(`${item.to}/`),
  })),
);
</script>

<template>
  <div v-if="items.length > 1" class="overflow-x-auto border-b border-default">
    <UNavigationMenu
      :items="menu"
      orientation="horizontal"
      variant="link"
      highlight
      class="w-max min-w-full"
    />
  </div>
</template>
