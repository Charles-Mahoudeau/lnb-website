<script setup lang="ts">
// Partner events, for events managers: one event for now, Arena League Université 2027.
definePageMeta({ eventsManagers: true });

const { t } = useI18n();
const SLUG = 'arena-league-universite-2027';
</script>

<template>
  <AdminPage :title="t('admin.partnerEvents.title')">
    <AdminPartnerEvents :slug="SLUG" />
  </AdminPage>
</template>
