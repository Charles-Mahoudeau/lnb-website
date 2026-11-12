<script setup lang="ts">
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminPage
    :title="t('admin.anticheat.review.title')"
    :parents="[{ label: t('admin.anticheat.title'), to: '/admin/anticheat' }]"
  >
    <div class="flex flex-col gap-4">
      <AdminAnticheatAlerts />
      <AdminAnticheatFiles queue />
    </div>
  </AdminPage>
</template>
