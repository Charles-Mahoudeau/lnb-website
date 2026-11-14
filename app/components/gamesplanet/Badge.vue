<script setup lang="ts">
// The "Affiliate link" and "Partner deal" badge: a button in the second-accent tint that opens a
// bubble saying what an affiliate link is. Click or tap only, never hover. It is the only
// disclosure on the home and event cards, so never hide it there (docs/design.md).
defineProps<{ variant?: 'affiliate' | 'deal' }>();

const { t } = useI18n();
</script>

<template>
  <UPopover
    :content="{ side: 'top', align: 'end', sideOffset: 8 }"
    :ui="{ content: 'max-w-72 bg-accented p-3 text-sm text-default shadow-lg ring ring-default' }"
  >
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-semibold text-secondary hover:bg-secondary/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      <UIcon name="i-lucide-info" class="size-3.5" aria-hidden="true" />
      {{ variant === 'deal' ? t('gamesplanet.partnerDeal') : t('gamesplanet.affiliateLink') }}
    </button>
    <template #content>
      <p>{{ t('gamesplanet.bubble') }}</p>
    </template>
  </UPopover>
</template>
