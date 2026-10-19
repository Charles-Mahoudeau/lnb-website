<script setup lang="ts">
import { AdminTeamPoleModal } from '#components';

const { t } = useI18n();
const overlay = useOverlay();
const poleModal = overlay.create(AdminTeamPoleModal);

async function onAddPole() {
  if (await poleModal.open().result) await refreshNuxtData('team-admin');
}
</script>

<template>
  <AdminPage :title="t('admin.team.title')">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        size="md"
        color="neutral"
        variant="soft"
        :label="t('admin.team.addPole')"
        @click="onAddPole"
      />
    </template>
    <AdminTeam />
  </AdminPage>
</template>
