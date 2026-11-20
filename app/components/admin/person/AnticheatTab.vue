<script setup lang="ts">
// The Anticheat tab of the Person page: the trust score, its timeline and the files they use.
defineProps<{ userId: string }>();
</script>

<template>
  <AdminAnticheatPlayerPanel :user-id="userId" />
</template>
