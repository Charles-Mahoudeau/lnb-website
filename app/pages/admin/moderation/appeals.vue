<script setup lang="ts">
definePageMeta({ wardenAdmins: true });
</script>

<template>
  <AdminTabPage entry="moderation" tab="appeals">
    <WardenAdminAppeals />
  </AdminTabPage>
</template>
