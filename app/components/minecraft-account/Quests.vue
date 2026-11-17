<script setup lang="ts">
// The quests card of /minecraft/account: how many quests are done, what they paid and how many
// are waiting to be claimed. Text only. Reads the quests page's own endpoint (docs/quests.md).
const { t, locale } = useI18n();

const { data, error } = await useQuests(ref(undefined));

const me = computed(() => data.value?.me ?? null);
const ready = computed(
  () => me.value?.completions.filter((completion) => !completion.claimedAt).length ?? 0,
);
</script>

<template>
  <section
    v-if="me && !error"
    class="flex flex-col gap-5 rounded-lg bg-elevated p-6"
    aria-labelledby="minecraft-account-quests"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="minecraft-account-quests" class="text-xl font-medium text-highlighted">
        {{ t('quests.title') }}
      </h2>
      <span class="text-sm text-muted">
        {{ t('quests.season.current', { n: data?.season.number ?? 0 }) }}
      </span>
    </div>

    <div class="flex items-baseline gap-2">
      <span class="font-display text-4xl font-bold text-highlighted tabular-nums">
        {{ me.done }}
      </span>
      <span class="text-muted">{{ t('minecraftAccount.quests.done', me.done) }}</span>
    </div>

    <p class="text-muted tabular-nums">
      {{ t('minecraftAccount.quests.earned', { amount: formatLnbits(me.earned, locale) }) }}
      <template v-if="ready">
        ·
        <span class="font-semibold text-default">
          {{ t('minecraftAccount.quests.ready', { count: ready }) }}
        </span>
      </template>
    </p>

    <UButton
      to="/minecraft/quests"
      color="neutral"
      variant="soft"
      size="md"
      class="self-start"
      :label="t('minecraftAccount.quests.open')"
    />
  </section>
</template>
