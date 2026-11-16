<script setup lang="ts">
// The suggestions moved under the vote. This keeps old bookmarks working.
definePageMeta({ wardenAdmins: true });
await navigateTo('/admin/mods/vote/suggestions', { replace: true });
</script>

<template>
  <div />
</template>
