<script setup lang="ts">
import type { WardenMe } from '#shared/schemas/warden';

// The player's active ban, at the top of /minecraft/warden: why, until when, and their appeal.
defineProps<{ ban: NonNullable<WardenMe['activeBan']> }>();
const emit = defineEmits<{ appeal: [] }>();

const { t, locale } = useI18n();
</script>

<template>
  <div class="flex gap-4 rounded-lg bg-elevated p-5">
    <UIcon name="i-lucide-ban" class="mt-1 size-6 shrink-0 text-primary" />
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-xl font-medium text-highlighted">{{ t('warden.ban.title') }}</h2>
        <UBadge color="error" variant="subtle" :label="t('warden.ban.badge')" />
      </div>
      <p class="border-l-2 border-default pl-3 text-highlighted">{{ ban.reason }}</p>
      <p class="text-sm text-muted">
        {{ t('warden.ban.since', { date: formatWardenDateTime(ban.createdAt, locale) }) }}
        {{
          ban.expiresAt
            ? t('warden.ban.ends', { date: formatWardenDateTime(ban.expiresAt, locale) })
            : t('warden.ban.permanent')
        }}
      </p>
      <p v-if="ban.appeal?.status === 'pending'" class="text-sm text-muted">
        {{
          t('warden.ban.appealPending', { date: formatWardenDate(ban.appeal.createdAt, locale) })
        }}
      </p>
      <p v-else-if="ban.appeal?.status === 'rejected'" class="text-sm text-muted">
        {{ t('warden.ban.appealRejected', { response: ban.appeal.response ?? '' }) }}
      </p>
      <div v-else-if="!ban.appeal" class="flex flex-wrap items-center gap-3">
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          :label="t('warden.ban.appeal')"
          @click="emit('appeal')"
        />
        <span class="text-sm text-muted">{{ t('warden.ban.appealHint') }}</span>
      </div>
    </div>
  </div>
</template>
