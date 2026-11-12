<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage
    :title="t('admin.anticheat.playersPage.title')"
    :parents="[{ label: t('admin.anticheat.title'), to: '/admin/anticheat' }]"
  >
    <AdminAnticheatPlayers />
  </AdminPage>
</template>
