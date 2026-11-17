<script setup lang="ts">
// The player's past bans and warnings, moved off the account page. The active ban and its appeal
// stay at the top of /minecraft/account.
definePageMeta({ flag: 'warden' });

const { t } = useI18n();
useSeoMeta({ title: () => t('minecraftAccount.history.title'), robots: 'noindex' });

const { user } = useAuth();
const app = getLinkApp('warden');
const eligible = computed(() =>
  Boolean(app && user.value && canLinkFromSchool(app, user.value.tenantId)),
);
const { data: me, error } = await useWarden({ immediate: eligible.value }).me;
</script>

<template>
  <UContainer class="flex max-w-3xl flex-col gap-8 py-14">
    <div class="flex flex-col gap-3">
      <UButton
        to="/minecraft/account"
        color="neutral"
        variant="link"
        size="md"
        icon="i-lucide-arrow-left"
        class="self-start px-0"
        :label="t('minecraftAccount.history.back')"
      />
      <h1 class="text-4xl font-bold text-highlighted">{{ t('minecraftAccount.history.title') }}</h1>
      <p class="max-w-xl text-lg text-muted">{{ t('minecraftAccount.history.lede') }}</p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('warden.loadFailed')"
    />
    <WardenHistory v-else-if="me?.history.length" :items="me.history" />
    <p v-else-if="me" class="text-muted">{{ t('minecraftAccount.history.empty') }}</p>
  </UContainer>
</template>
