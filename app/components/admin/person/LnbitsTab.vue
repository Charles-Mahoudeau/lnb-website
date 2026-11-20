<script setup lang="ts">
import type { AdminPersonSummary } from '#shared/schemas/admin';

// The LNBits tab of the Person page: their bank account, as economy admins see it.
defineProps<{ summary: AdminPersonSummary }>();
const { t } = useI18n();
</script>

<template>
  <AdminEconomyAccount v-if="summary.economy" :id="summary.economy.accountId" embedded />
  <p v-else class="text-muted">{{ t('admin.person.lnbits.none') }}</p>
</template>
