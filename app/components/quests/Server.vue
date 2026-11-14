<script setup lang="ts">
// Server quests (docs/quests.md): one row per advancement with its podium. A free place shows
// what it would pay today; the rank after the podium shows how many came after.
import type { QuestOverview } from '~/composables/useQuests';

const props = defineProps<{ data: QuestOverview }>();
const { t, locale } = useI18n();

const filter = ref<'all' | 'open' | 'none'>('all');
const quests = computed(() =>
  props.data.quests.flatMap((quest) => (quest.family === 'server' ? [quest] : [])),
);
const shown = computed(() =>
  quests.value.filter((quest) => {
    const taken = props.data.podiums[quest.id]?.length ?? 0;
    if (filter.value === 'open') return taken < quest.ranks.length;
    if (filter.value === 'none') return taken === 0;
    return true;
  }),
);
// The site masks a secret quest until its first place is taken.
const secret = (quest: (typeof quests.value)[number]) =>
  quest.hidden && !props.data.podiums[quest.id]?.length;
const ordinal = (n: number) => t(`quests.server.place.${String(Math.min(n, 4))}`, { n });
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('quests.server.filter')">
        <UButton
          v-for="option in ['all', 'open', 'none'] as const"
          :key="option"
          size="md"
          :color="filter === option ? 'secondary' : 'neutral'"
          :variant="filter === option ? 'subtle' : 'outline'"
          :label="t(`quests.server.filters.${option}`)"
          @click="filter = option"
        />
      </div>
      <span class="text-sm text-muted">{{ t('quests.server.shares') }}</span>
    </div>

    <p v-if="!shown.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('quests.server.empty') }}
    </p>
    <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
      <li
        v-for="quest in shown"
        :key="quest.id"
        class="grid items-center gap-4 px-5 py-4 lg:grid-cols-5"
        :class="data.me?.ranks[quest.id] ? 'bg-secondary/10' : ''"
      >
        <div class="flex items-center gap-3 lg:col-span-2">
          <IconTile :icon="secret(quest) ? 'i-lucide-lock' : 'i-lucide-trophy'" />
          <div class="min-w-0">
            <h3 class="font-semibold text-highlighted">{{ questName(quest.name, locale) }}</h3>
            <p v-if="secret(quest)" class="text-sm text-muted">{{ t('quests.server.secret') }}</p>
            <p v-else-if="quest.description" class="text-sm text-muted">
              {{ questName(quest.description, locale) }}
            </p>
            <UBadge
              class="mt-1"
              color="neutral"
              variant="outline"
              :label="t(`quests.server.tier.${quest.tier}`)"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:col-span-3">
          <template v-for="index in quest.ranks.keys()" :key="index">
            <div
              v-if="data.podiums[quest.id]?.[index]"
              class="flex min-w-0 items-center gap-2 rounded-md bg-default px-2 py-1.5"
            >
              <span class="w-6 font-display text-xs text-muted">{{ index + 1 }}</span>
              <WardenMinecraftHead :uuid="data.podiums[quest.id]![index]!.uuid" size="sm" />
              <span class="flex min-w-0 flex-col leading-tight">
                <span class="truncate text-sm font-semibold text-highlighted">{{
                  data.podiums[quest.id]![index]!.username
                }}</span>
                <span class="text-xs text-muted tabular-nums"
                  >{{ formatLnbits(data.podiums[quest.id]![index]!.amount, locale) }} LNBits</span
                >
              </span>
            </div>
            <div
              v-else
              class="flex items-center gap-2 rounded-md border border-dashed border-default px-2 py-1.5"
            >
              <span class="w-6 font-display text-xs text-muted">{{ index + 1 }}</span>
              <span class="flex flex-col leading-tight">
                <span class="text-sm font-semibold text-muted">{{ t('quests.server.free') }}</span>
                <span class="text-xs text-muted tabular-nums"
                  >≈ {{ formatLnbits(quest.today[index]!, locale) }} LNBits</span
                >
              </span>
            </div>
          </template>
          <span class="self-center text-sm text-muted tabular-nums">
            <template v-if="data.rest[quest.id]">{{
              t('quests.server.rest', { n: data.rest[quest.id] }, data.rest[quest.id]!)
            }}</template>
            <template v-else-if="(data.podiums[quest.id]?.length ?? 0) >= quest.ranks.length">
              {{
                t('quests.server.next', {
                  place: ordinal(quest.ranks.length + 1),
                  n: formatLnbits(quest.today[quest.ranks.length]!, locale),
                })
              }}
            </template>
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>
