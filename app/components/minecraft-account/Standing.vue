<script setup lang="ts">
import type { WardenMe } from '#shared/schemas/warden';

// The warnings and bans card of /minecraft/account: whether the player is in good standing, with a
// link to the full history.
const props = defineProps<{ me: WardenMe }>();

const { t } = useI18n();

const entries = computed(() => props.me.history.length);
const state = computed(() =>
  props.me.activeBan ? 'banned' : entries.value > 0 ? 'history' : 'good',
);
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-lg bg-elevated p-6"
    aria-labelledby="minecraft-account-standing"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="minecraft-account-standing" class="text-xl font-medium text-highlighted">
        {{ t('minecraftAccount.standing.title') }}
      </h2>
      <UBadge
        :color="state === 'banned' ? 'error' : state === 'good' ? 'success' : 'neutral'"
        variant="subtle"
        :label="t(`minecraftAccount.standing.${state}.badge`)"
      />
    </div>
    <p class="text-muted">
      {{ t(`minecraftAccount.standing.${state}.body`, { count: entries }, entries) }}
    </p>
    <UButton
      v-if="entries > 0"
      to="/minecraft/account/history"
      color="neutral"
      variant="ghost"
      size="md"
      class="self-start"
      :label="t('minecraftAccount.standing.history')"
    />
  </section>
</template>
