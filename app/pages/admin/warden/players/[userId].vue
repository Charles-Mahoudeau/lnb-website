<script setup lang="ts">
// A player's old address, kept for bookmarks: routeRules can't carry the ID.
definePageMeta({
  wardenAdmins: true,
  middleware: (to) =>
    navigateTo(`/admin/people/${(to.params as { userId: string }).userId}/minecraft`, {
      redirectCode: 301,
    }),
});
</script>

<template>
  <div />
</template>
