<script setup lang="ts">
// What other players see above someone's head in-game: the username, and their name under it
// when they show it.
defineProps<{ username: string; name?: string | null }>();
</script>

<template>
  <span class="nametag">
    <span>{{ username }}</span>
    <span v-if="name" class="nametag-muted">{{ name }}</span>
  </span>
</template>
