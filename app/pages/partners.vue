<script setup lang="ts">
// The companies and studios that help LNB, one section per kind. Public, like the team page.
definePageMeta({ auth: false, flag: 'partners' });

const { t } = useI18n();
useSeoMeta({ title: () => t('partners.title'), description: () => t('partners.lede') });

const { data } = await usePublicPartners();
</script>

<template>
  <UContainer class="flex flex-col gap-12 py-12">
    <div class="flex flex-col gap-3">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('partners.title') }}</h1>
      <p class="max-w-prose text-muted">{{ t('partners.lede') }}</p>
    </div>

    <p v-if="!data?.kinds.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('partners.empty') }}
    </p>
    <PartnersKind v-for="group in data?.kinds" :key="group.kind" :group="group" />

    <section
      v-if="data?.contactUrl"
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-elevated p-6"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-xl font-bold text-highlighted">{{ t('partners.contact.title') }}</h2>
        <p class="max-w-prose text-muted">{{ t('partners.contact.lede') }}</p>
      </div>
      <UButton
        :to="data.contactUrl"
        :target="data.contactUrl.startsWith('https:') ? '_blank' : undefined"
        external
        size="lg"
        :label="t('partners.contact.button')"
      />
    </section>
  </UContainer>
</template>
