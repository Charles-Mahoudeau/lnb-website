<script setup lang="ts">
import type { WardenHistoryItem } from '#shared/schemas/warden';

// The player's past bans and warnings, newest first, without staff names.
defineProps<{ items: WardenHistoryItem[] }>();

const { t, locale } = useI18n();

function banTitle(item: Extract<WardenHistoryItem, { kind: 'ban' }>) {
  return item.expiresAt
    ? t('warden.history.banFor', {
        length: formatWardenBanLength(item.createdAt, item.expiresAt, locale.value),
      })
    : t('warden.history.banPermanent');
}
</script>

<template>
  <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
    <li v-for="item in items" :key="item.id" class="flex gap-4 px-5 py-4">
      <span class="grid size-8 shrink-0 place-items-center rounded-full bg-accented text-muted">
        <UIcon
          :name="item.kind === 'ban' ? 'i-lucide-ban' : 'i-lucide-triangle-alert'"
          class="size-4"
        />
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-highlighted">
            {{ item.kind === 'ban' ? banTitle(item) : t('warden.history.warning') }}
          </span>
          <UBadge
            v-if="item.kind === 'ban'"
            :color="item.active ? 'error' : 'neutral'"
            variant="subtle"
            :label="
              item.active
                ? t('warden.history.active')
                : item.revokedAt
                  ? t('warden.history.lifted')
                  : t('warden.history.ended')
            "
          />
          <span class="text-sm text-muted">{{ formatWardenDate(item.createdAt, locale) }}</span>
        </div>
        <p class="break-words">{{ item.kind === 'ban' ? item.reason : item.body }}</p>
      </div>
    </li>
  </ul>
</template>
