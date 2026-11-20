<script setup lang="ts">
definePageMeta({ wardenAdmins: true });
</script>

<template>
  <AdminTabPage entry="anticheat" tab="review">
    <div class="flex flex-col gap-4">
      <AdminAnticheatAlerts />
      <AdminAnticheatFiles queue />
    </div>
  </AdminTabPage>
</template>
