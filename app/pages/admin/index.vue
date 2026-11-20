<script setup lang="ts">
// Home. Site admins get the Overview. Everyone else gets a short note until the Home inbox
// (docs/plans/admin-redesign.md, slice 3) lists what is waiting for each role.
definePageMeta({ wardenAdmins: true, eventsManagers: true, economyAdmins: true });

const { t } = useI18n();
const { user } = useAuth();
</script>

<template>
  <AdminPage :title="t('admin.nav.home')">
    <AdminOverview v-if="isAdmin(user?.role)" />
    <div v-else class="flex flex-col items-center gap-3 py-16 text-center">
      <IconTile icon="i-lucide-layout-dashboard" />
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.home.title') }}</h2>
      <p class="max-w-md text-muted">{{ t('admin.home.lede') }}</p>
    </div>
  </AdminPage>
</template>
