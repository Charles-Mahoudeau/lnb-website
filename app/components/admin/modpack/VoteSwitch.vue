<script setup lang="ts">
// Mods and Suggestions, the two parts of Modpack, Vote.
const { t } = useI18n();
</script>

<template>
  <AdminSegmented
    :items="[
      { label: t('admin.nav.voteMods'), to: '/admin/modpack/vote' },
      { label: t('admin.nav.voteSuggestions'), to: '/admin/modpack/vote/suggestions' },
    ]"
  />
</template>
