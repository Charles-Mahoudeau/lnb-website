<script setup lang="ts">
definePageMeta({ wardenAdmins: true });
</script>

<template>
  <AdminTabPage entry="modpack" tab="vote">
    <div class="flex max-w-6xl flex-col gap-6">
      <AdminModpackVoteSwitch />
      <ModsAdminSuggestions />
    </div>
  </AdminTabPage>
</template>
