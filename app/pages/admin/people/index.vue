<script setup lang="ts">
// People. Site admins get the accounts list, Warden admins the Minecraft players. The list is
// rebuilt for every role later (docs/plans/admin-redesign.md, slice 2).
definePageMeta({ wardenAdmins: true });

const { t } = useI18n();
const { user } = useAuth();
</script>

<template>
  <AdminPage :title="t('admin.nav.people')">
    <AdminUsers v-if="isAdmin(user?.role)" />
    <WardenAdminPlayers v-else />
  </AdminPage>
</template>
