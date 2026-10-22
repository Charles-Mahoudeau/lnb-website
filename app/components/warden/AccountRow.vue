<script setup lang="ts">
import type { WardenAccountView } from '#shared/schemas/warden';

// One linked Minecraft account: its head, type, state, playtime and past usernames.
defineProps<{ account: WardenAccountView }>();
const emit = defineEmits<{ unlink: [] }>();

const { t, locale } = useI18n();
</script>

<template>
  <div class="flex flex-wrap items-center gap-4 px-5 py-4">
    <WardenMinecraftHead :uuid="account.uuid" />
    <div class="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-semibold break-all text-highlighted">{{ account.username }}</span>
        <UBadge
          v-if="account.online"
          color="success"
          variant="subtle"
          icon="i-lucide-gamepad-2"
          :label="t('warden.accounts.playing')"
        />
      </div>
      <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span>
          {{ t('warden.accounts.playtime') }}
          <span class="text-default tabular-nums">
            {{ formatWardenDuration(account.playtimeSeconds, locale) }}
          </span>
        </span>
        <span v-if="!account.online && account.lastSeenAt">
          {{ t('warden.accounts.lastSeen') }}
          <span class="text-default">{{ formatWardenRelative(account.lastSeenAt, locale) }}</span>
        </span>
        <span v-else-if="!account.lastSeenAt">{{ t('warden.accounts.neverSeen') }}</span>
        <span>
          {{ t('warden.accounts.linkedOn') }}
          <span class="text-default">{{ formatWardenDate(account.linkedAt, locale) }}</span>
        </span>
      </div>
      <UCollapsible v-if="account.pastUsernames.length" class="text-sm text-muted">
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
          :label="t('warden.accounts.pastNames')"
          class="px-0"
        />
        <template #content>
          <ul class="list-disc pt-1 pl-5">
            <li v-for="past in account.pastUsernames" :key="past.username">{{ past.username }}</li>
          </ul>
        </template>
      </UCollapsible>
    </div>
    <UButton
      color="neutral"
      variant="ghost"
      size="md"
      :label="t('warden.accounts.unlink')"
      @click="emit('unlink')"
    />
  </div>
</template>
