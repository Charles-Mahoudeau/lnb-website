<script setup lang="ts">
import { PARTNER_KIND_ICONS } from '#shared/schemas/partners';
import type { PartnerPublicKind } from '#shared/schemas/partners';

// One kind of partner: the kind on the left (tile, name, what it means), the partners on the
// right as plain rows with dividers. On phones the two columns stack.
defineProps<{ group: PartnerPublicKind }>();

const { t, locale } = useI18n();
</script>

<template>
  <section class="grid gap-x-12 gap-y-6 md:grid-cols-4">
    <div class="flex flex-col items-start gap-3">
      <IconTile :icon="PARTNER_KIND_ICONS[group.kind]" />
      <h2 class="text-xl font-bold text-highlighted">
        {{ t(`partners.kinds.${group.kind}.name`) }}
      </h2>
      <p class="text-muted">{{ t(`partners.kinds.${group.kind}.lede`) }}</p>
    </div>
    <ul class="flex flex-col divide-y divide-default md:col-span-3">
      <li
        v-for="partner in group.partners"
        :key="partner.id"
        class="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6"
      >
        <PartnersLogo :name="partner.name" :src="partner.logo" :url="partner.url" />
        <div class="flex min-w-0 flex-col gap-1">
          <h3 class="font-sans text-lg font-semibold text-highlighted">{{ partner.name }}</h3>
          <p class="max-w-prose text-muted">{{ partnerText(partner.description, locale) }}</p>
          <ULink
            v-if="partner.url"
            :to="partner.url"
            target="_blank"
            external
            class="self-start font-semibold text-primary hover:underline"
          >
            {{ partnerHost(partner.url) }}
          </ULink>
        </div>
      </li>
    </ul>
  </section>
</template>
