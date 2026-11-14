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
  <section
    class="grid grid-cols-1 gap-x-12 gap-y-8 rounded-lg bg-elevated p-6 lg:grid-cols-2 lg:p-8"
  >
    <div class="flex min-w-0 flex-col items-start gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <!-- White on the dark theme, ink on the light one, so it reads on the band in both. -->
        <a
          :href="gamesplanetGoUrl('site', 'partners')"
          target="_blank"
          rel="sponsored noopener noreferrer"
          :aria-label="t('partners.gamesplanet.logoLabel')"
          class="shrink-0"
        >
          <img
            src="/partners/gamesplanet-light.svg"
            alt=""
            class="h-10 w-auto sm:h-12 dark:hidden"
          />
          <img
            src="/partners/gamesplanet-dark.svg"
            alt=""
            class="hidden h-10 w-auto sm:h-12 dark:block"
          />
        </a>
        <span class="rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-semibold text-secondary">
          {{ t('partners.gamesplanet.newPartner') }}
        </span>
      </div>
      <h2 class="text-2xl font-bold text-highlighted">{{ t('partners.gamesplanet.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('partners.gamesplanet.lede') }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="check in checks" :key="check" class="flex items-start gap-2 text-default">
          <UIcon name="i-lucide-check" class="mt-0.5 size-5 shrink-0 text-secondary" />
          <span class="flex flex-col">
            {{ t(`partners.gamesplanet.checks.${check}`) }}
            <span class="text-sm text-muted">
              {{ t(`partners.gamesplanet.checks.${check}Note`) }}
            </span>
          </span>
        </li>
      </ul>
    </div>
    <div class="flex min-w-0 flex-col">
      <div class="flex flex-col divide-y divide-default">
        <GamesplanetDeal v-for="deal in data.deals" :key="deal.uid" :deal="deal" from="partners" />
      </div>
      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4"
      >
        <UButton
          :to="gamesplanetGoUrl('site', 'partners')"
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
