<script setup lang="ts">
import { AdminShortLinksForm } from '#components';

definePageMeta({ eventsManagers: true });

const { t } = useI18n();
const overlay = useOverlay();
const drawer = overlay.create(AdminShortLinksForm);

async function onAdd() {
  if (await drawer.open().result) await refreshNuxtData('short-links-admin');
}

// Ctrl K's "New short link" comes here with `?new`: open the drawer and clear the address.
const route = useRoute();
onMounted(async () => {
  if (route.query.new === undefined) return;
  await navigateTo({ path: route.path }, { replace: true });
  void onAdd();
});
</script>

<template>
  <AdminPage :title="t('admin.shortLinks.title')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('admin.shortLinks.add')" @click="onAdd" />
    </template>
    <AdminShortLinks />
  </AdminPage>
</template>
