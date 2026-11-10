<script setup lang="ts">
definePageMeta({ economyAdmins: true });

const { t } = useI18n();
const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
  <AdminPage
    :title="t('admin.economy.account.title')"
    :parents="[
      { label: t('admin.nav.economy') },
      { label: t('admin.nav.economyAccounts'), to: '/admin/economy/accounts' },
    ]"
  >
    <AdminEconomyAccount :id="id" :key="id" />
  </AdminPage>
</template>
