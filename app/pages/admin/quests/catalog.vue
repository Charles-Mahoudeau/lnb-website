<script setup lang="ts">
// The Quests page of the admin (docs/quests.md): the catalog, community quests, categories and
// the reward index, one tab each. The quests settings are in Settings.
definePageMeta({ economyAdmins: true });

const { t } = useI18n();
</script>

<template>
  <AdminTabPage entry="quests" tab="catalog">
    <div class="flex flex-col gap-6">
      <p class="max-w-2xl text-muted">{{ t('admin.quests.lede') }}</p>
      <AdminQuestsCatalog />
    </div>
  </AdminTabPage>
</template>
