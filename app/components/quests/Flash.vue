<script setup lang="ts">
// The Flash tab (docs/quests.md): the history of the season's races, won or expired.
import type { QuestOverview } from '~/composables/useQuests';

const props = defineProps<{ data: QuestOverview }>();
const { t, locale } = useI18n();

const names = computed(
  () => new Map(props.data.quests.map((quest) => [quest.id, questName(quest.name, locale.value)])),
);
const when = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    }),
);
function minutes(run: QuestOverview['flash'][number]) {
  return Math.max(
    1,
    Math.round((new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 60_000),
  );
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="border-l-2 border-secondary pl-3 text-sm text-muted">{{ t('quests.flash.how') }}</p>
    <div
      v-if="!data.flash.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-zap" />
      <h3 class="text-xl font-medium text-highlighted">{{ t('quests.flash.empty.title') }}</h3>
      <p class="max-w-md text-muted">{{ t('quests.flash.empty.body') }}</p>
    </div>
    <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
      <li
        v-for="run in data.flash"
        :key="run.id"
        class="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-12"
      >
        <span class="text-sm text-muted sm:col-span-3">{{
          when.format(new Date(run.endedAt))
        }}</span>
        <span class="text-highlighted sm:col-span-4">
          {{ t('quests.flash.goal', { name: names.get(run.quest) ?? run.quest, n: run.quantity }) }}
        </span>
        <span v-if="run.winner && run.winnerUuid" class="flex items-center gap-2 sm:col-span-3">
          <WardenMinecraftHead :uuid="run.winnerUuid" size="sm" />
          <span class="text-sm">{{ run.winner }}</span>
        </span>
        <span v-else class="text-sm text-muted sm:col-span-3">{{ t('quests.flash.nobody') }}</span>
        <span class="text-sm tabular-nums sm:col-span-2 sm:text-right">
          <template v-if="run.winner">
            <span class="font-semibold text-highlighted"
              >+{{ formatLnbits(run.amount, locale) }}</span
            >
            <span class="text-muted"> {{ t('quests.flash.in', { n: minutes(run) }) }}</span>
          </template>
          <span v-else class="text-muted">{{ t('quests.flash.expired') }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
