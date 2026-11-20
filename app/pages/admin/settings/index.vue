<script setup lang="ts">
// Settings opens on the first section the role may see.
definePageMeta({
  wardenAdmins: true,
  eventsManagers: true,
  economyAdmins: true,
  middleware: () => {
    const { user } = useAuth();
    const first = settingsSections(user.value?.role)[0];
    return navigateTo(first ? `/admin/settings/${first.id}` : '/admin', { replace: true });
  },
});
</script>

<template>
  <div />
</template>
