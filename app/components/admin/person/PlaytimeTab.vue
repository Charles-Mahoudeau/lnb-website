<script setup lang="ts">
// The Playtime tab of the Person page: the player's week, the last eight weeks and the grants.
defineProps<{ userId: string }>();
</script>

<template>
  <AdminPlaytimePlayerPanel :user-id="userId" />
</template>
