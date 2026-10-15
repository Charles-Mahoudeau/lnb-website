<script setup lang="ts">
// One admin page: the navbar with where you are, then the scrolling body.
// `parents` are the sections above this page, such as Warden, then Players.
const props = defineProps<{
  title: string;
  parents?: { label: string; to?: string }[];
}>();

useSeoMeta({ title: () => props.title, robots: 'noindex' });
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <template v-for="parent in props.parents" :key="parent.label">
            <NuxtLink
              v-if="parent.to"
              :to="parent.to"
              class="font-medium text-muted hover:text-highlighted"
            >
              {{ parent.label }}
            </NuxtLink>
            <span v-else class="font-medium text-muted">{{ parent.label }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
          </template>
          <span class="truncate">{{ props.title }}</span>
        </template>
        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
