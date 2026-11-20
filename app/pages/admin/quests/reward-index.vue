<script setup lang="ts">
// A tab of the Quests page of the admin (docs/quests.md).
definePageMeta({ economyAdmins: true });
</script>

<template>
  <AdminTabPage entry="quests" tab="rewardIndex">
    <AdminQuestsIndex />
  </AdminTabPage>
</template>
