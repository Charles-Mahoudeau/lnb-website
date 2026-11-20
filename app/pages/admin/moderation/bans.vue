<script setup lang="ts">
definePageMeta({ wardenAdmins: true });
</script>

<template>
  <AdminTabPage entry="moderation" tab="bans">
    <WardenAdminBans />
  </AdminTabPage>
</template>
