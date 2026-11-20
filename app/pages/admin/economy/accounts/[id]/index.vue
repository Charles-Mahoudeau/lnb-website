<script setup lang="ts">
definePageMeta({ economyAdmins: true });

const route = useRoute();
await navigateTo(
  `/admin/economy/accounts/${encodeURIComponent(String(route.params.id))}/overview`,
  {
    replace: true,
  },
);
</script>

<template>
  <div />
</template>
