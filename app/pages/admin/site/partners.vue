<script setup lang="ts">
import { AdminPartnersModal } from '#components';

const { t } = useI18n();
const overlay = useOverlay();
const modal = overlay.create(AdminPartnersModal);

async function onAdd() {
  if (await modal.open().result) await refreshNuxtData('partners-admin');
}
</script>

<template>
  <AdminTabPage entry="site" tab="partners">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        size="md"
        color="neutral"
        variant="soft"
        :label="t('admin.partners.add')"
        @click="onAdd"
      />
    </template>
    <AdminPartners />
  </AdminTabPage>
</template>
