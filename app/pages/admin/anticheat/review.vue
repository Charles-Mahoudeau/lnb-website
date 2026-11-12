<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage
    :title="t('admin.anticheat.review.title')"
    :parents="[{ label: t('admin.anticheat.title'), to: '/admin/anticheat' }]"
  >
    <AdminAnticheatFiles queue />
  </AdminPage>
</template>
