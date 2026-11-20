<script setup lang="ts">
import { eventIdParams } from '#shared/schemas/events';

// An event's bare address opens its details (permanent: routeRules can't carry the id).
definePageMeta({
  eventsManagers: true,
  validate: (route) => eventIdParams.safeParse(route.params).success,
  middleware: (to) =>
    navigateTo(`/admin/events/${(to.params as { id: string }).id}/details`, {
      redirectCode: 301,
    }),
});
</script>

<template>
  <div />
</template>
