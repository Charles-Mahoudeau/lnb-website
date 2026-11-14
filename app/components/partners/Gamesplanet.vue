<script setup lang="ts">
import type { GamesplanetPublicView } from '#shared/schemas/gamesplanet';

// The Gamesplanet band at the top of the partners page: the pitch on the left, three deals on the
// right, and the disclosure. Gamesplanet's banners are never embedded: this is our own content
// from their feeds (docs/design.md, Gamesplanet promotion).
defineProps<{ data: GamesplanetPublicView }>();

const { t } = useI18n();
const checks = ['keys', 'sameprice', 'events'] as const;
</script>

<template>
  <section class="grid gap-x-12 gap-y-8 rounded-lg bg-elevated p-6 md:grid-cols-2 md:p-8">
    <div class="flex flex-col items-start gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <PartnersLogo
          name="Gamesplanet"
          src="/partners/gamesplanet.svg"
          :url="data.siteUrl"
          size="small"
        />
        <span class="rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-semibold text-secondary">
          {{ t('partners.gamesplanet.newPartner') }}
        </span>
      </div>
      <h2 class="text-2xl font-bold text-highlighted">{{ t('partners.gamesplanet.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('partners.gamesplanet.lede') }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="check in checks" :key="check" class="flex items-start gap-2 text-default">
          <UIcon name="i-lucide-check" class="mt-0.5 size-5 shrink-0 text-secondary" />
          {{ t(`partners.gamesplanet.checks.${check}`) }}
        </li>
      </ul>
    </div>
    <div class="flex flex-col">
      <div class="flex flex-col divide-y divide-default">
        <GamesplanetDeal v-for="deal in data.deals" :key="deal.uid" :deal="deal" />
      </div>
      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4"
      >
        <UButton
          :to="data.siteUrl"
          target="_blank"
          external
          rel="sponsored noopener noreferrer"
          trailing-icon="i-lucide-external-link"
          :label="t('partners.gamesplanet.browse')"
        />
        <GamesplanetBadge />
      </div>
    </div>
  </section>
</template>
