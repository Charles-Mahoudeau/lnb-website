<script setup lang="ts">
// The Daily tab (docs/quests.md): today's quests, the same for everyone until midnight (Paris).
// Each shows its goal, what it pays today, how many finished it, and whether the visitor did.
import type { QuestOverview } from '~/composables/useQuests';

const props = defineProps<{ data: QuestOverview }>();
const { t, locale } = useI18n();

const quests = computed(() =>
  (props.data.daily?.quests ?? []).flatMap((entry) => {
    const quest = props.data.quests.find((q) => q.id === entry.quest && q.family === 'daily');
    return quest ? [{ ...entry, definition: quest }] : [];
  }),
);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 30_000);
});
onBeforeUnmount(() => {
  clearInterval(timer);
});
const left = computed(() =>
  props.data.daily ? timeLeft(props.data.daily.endsAt, now.value) : null,
);
const kPlayer = computed(() => props.data.me?.kPlayer ?? 1);
const done = (id: string) => props.data.me?.daily.includes(id) ?? false;
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="border-l-2 border-secondary pl-3 text-sm text-muted">{{ t('quests.daily.how') }}</p>
      <span v-if="left" class="text-sm text-muted tabular-nums">
        {{ t('quests.daily.endsIn', { h: left.hours, m: left.minutes }) }}
      </span>
    </div>
    <div
      v-if="!quests.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-calendar-check" />
      <h3 class="text-xl font-medium text-highlighted">{{ t('quests.daily.empty.title') }}</h3>
      <p class="max-w-md text-muted">{{ t('quests.daily.empty.body') }}</p>
    </div>
    <ul v-else class="grid gap-4 md:grid-cols-3">
      <li
        v-for="entry in quests"
        :key="entry.quest"
        class="flex flex-col gap-3 rounded-lg bg-elevated px-5 py-5"
        :class="done(entry.quest) ? 'ring-1 ring-success/40' : ''"
      >
        <div class="flex items-center gap-3">
          <IconTile :icon="QUEST_ICONS[entry.definition.objective.type] ?? 'i-lucide-calendar'" />
          <div class="min-w-0">
            <h3 class="font-semibold text-highlighted">
              {{ questName(entry.definition.name, locale) }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('quests.daily.goal', { n: formatLnbits(entry.quantity, locale) }) }}
              {{
                entry.definition.description
                  ? questName(entry.definition.description, locale)
                  : t(`quests.objective.${entry.definition.objective.type}`)
              }}
            </p>
          </div>
        </div>
        <div class="flex items-end justify-between gap-2">
          <div>
            <span class="font-display text-lg font-medium text-highlighted tabular-nums">
              ≈ {{ formatLnbits((entry.definition.today[0] ?? 0) * kPlayer, locale) }}
            </span>
            <span class="text-sm text-muted"> LNBits</span>
          </div>
          <UBadge
            v-if="done(entry.quest)"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            :label="t('quests.daily.done')"
          />
        </div>
        <span class="text-xs text-muted">{{ t('quests.daily.finished', entry.done) }}</span>
      </li>
    </ul>
  </div>
</template>
