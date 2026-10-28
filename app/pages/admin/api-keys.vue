<script setup lang="ts">
import { AdminApiKeysForm, AdminApiKeysSecret } from '#components';

import type { ApiKeyCreated } from '#shared/schemas/api-keys';

const { t } = useI18n();
const overlay = useOverlay();
const form = overlay.create(AdminApiKeysForm);
const secret = overlay.create(AdminApiKeysSecret);

async function onAdd() {
  const result: unknown = await form.open().result;
  if (!result || typeof result !== 'object') return;
  const created = result as ApiKeyCreated;
  await refreshNuxtData('api-keys-admin');
  await secret.open({ name: created.key.name, secret: created.secret }).result;
}
</script>

<template>
  <AdminPage :title="t('admin.apiKeys.title')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('admin.apiKeys.add')" @click="onAdd" />
    </template>
    <AdminApiKeys />
  </AdminPage>
</template>
