<script setup lang="ts">
// The people who run LNB: the featured pole as a band, the others as columns. Public, like the
// events. Only visible members show, with name, school and profile photo from their account.
definePageMeta({ auth: false, flag: 'team' });

const { t } = useI18n();
useSeoMeta({ title: () => t('team.title'), description: () => t('team.lede') });

const { data } = await usePublicTeam();
const featured = computed(() => data.value?.poles.find((pole) => pole.featured));
const others = computed(() => data.value?.poles.filter((pole) => !pole.featured) ?? []);
</script>

<template>
  <UContainer class="flex flex-col gap-10 py-12">
    <div class="flex flex-col gap-3">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('team.title') }}</h1>
      <p class="max-w-prose text-muted">{{ t('team.lede') }}</p>
    </div>

    <p v-if="!data?.poles.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('team.empty') }}
    </p>
    <template v-else>
      <TeamFeatured v-if="featured" :pole="featured" />
      <div v-if="others.length" class="grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        <TeamPole v-for="pole in others" :key="pole.id" :pole="pole" />
      </div>
    </template>

    <section
      v-if="data?.joinUrl"
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-elevated p-6"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-xl font-bold text-highlighted">{{ t('team.join.title') }}</h2>
        <p class="text-muted">{{ t('team.join.lede') }}</p>
      </div>
      <UButton
        :to="data.joinUrl"
        target="_blank"
        external
        size="lg"
        :label="t('team.join.button')"
      />
    </section>
  </UContainer>
</template>
