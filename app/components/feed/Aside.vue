<script setup lang="ts">
// "Good to know", beside the Feed on wide screens: the text rule, what anonymous means, the rules.
const { t } = useI18n();
const { isEnabled } = useFlags();
</script>

<template>
  <aside class="flex flex-col gap-3 rounded-lg bg-elevated px-5 py-4.5">
    <h2 class="text-base font-bold text-highlighted">{{ t('feed.aside.title') }}</h2>
    <ul class="flex list-disc flex-col gap-1.5 ps-4.5 text-muted">
      <li>{{ t('feed.aside.text') }}</li>
      <li>{{ t('feed.aside.anonymous') }}</li>
      <li>{{ t('feed.aside.rules') }}</li>
    </ul>
    <ULink
      v-if="isEnabled('rules')"
      to="/minecraft/rules"
      class="self-start font-medium text-primary hover:underline"
    >
      {{ t('feed.aside.rulesLink') }}
    </ULink>
  </aside>
</template>
