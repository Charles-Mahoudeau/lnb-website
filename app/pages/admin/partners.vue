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
  <AdminPage :title="t('admin.partners.title')">
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
  </AdminPage>
</template>
