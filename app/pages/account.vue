<script setup lang="ts">
const { t } = useI18n();
const { user, school, signOut } = useAuth();

useSeoMeta({ title: () => t('account.title'), robots: 'noindex' });
</script>

<template>
  <UContainer v-if="user" class="flex max-w-2xl flex-col items-start gap-6 py-14">
    <h1 class="text-4xl font-bold text-highlighted">{{ t('account.title') }}</h1>

    <dl class="grid w-full gap-4 rounded-lg bg-elevated p-6 sm:grid-cols-3">
      <div class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted">{{ t('account.name') }}</dt>
        <dd class="text-highlighted">{{ user.name }}</dd>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <dt class="text-sm text-muted">{{ t('account.email') }}</dt>
        <dd class="truncate text-highlighted">{{ user.email }}</dd>
      </div>
      <div v-if="school" class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted">{{ t('account.school') }}</dt>
        <dd class="text-highlighted">{{ school }}</dd>
      </div>
    </dl>

    <UButton
      color="neutral"
      variant="soft"
      icon="i-lucide-log-out"
      :label="t('auth.signOut')"
      @click="signOut"
    />
  </UContainer>
</template>
