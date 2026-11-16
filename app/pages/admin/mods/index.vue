<script setup lang="ts">
// The Modlist will live here. Until it does, the section opens on the vote.
definePageMeta({ wardenAdmins: true });
await navigateTo('/admin/mods/vote', { replace: true });
</script>

<template>
  <div />
</template>
