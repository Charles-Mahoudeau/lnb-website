<script setup lang="ts">
// The parent of every page under /admin: the admin layout, behind the admin middleware.
definePageMeta({ layout: 'admin', middleware: 'admin' });
</script>

<template>
  <NuxtPage />
</template>
