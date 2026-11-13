<script setup lang="ts">
// The leaderboard (docs/quests.md): the top three in a band, then ranked rows, like the baltop.
// Below it, how rewards are computed, with the index over 30 days.
import type { QuestOverview } from '~/composables/useQuests';

const props = defineProps<{ data: QuestOverview }>();
const { t, locale } = useI18n();

const by = ref<'lnbits' | 'quests'>('lnbits');
const rows = computed(() => [...props.data.leaderboard].sort((a, b) => b[by.value] - a[by.value]));
const decimal = (value: number, digits = 2) =>
  new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);

// The index chart: one scale, the line in the highlight color, a faint grid (docs/design.md).
const chart = computed(() => {
  const values = props.data.indexDays.map((day) => day.index);
  if (values.length < 2) return null;
  const width = 600;
  const height = 170;
  const left = 52;
  const top = 10;
  const bottom = 22;
  const low = Math.min(...values) * 0.95;
  const high = Math.max(...values) * 1.05;
  const x = (i: number) => left + (i * (width - left - 8)) / (values.length - 1);
  const y = (v: number) => top + ((high - v) * (height - top - bottom)) / (high - low || 1);
  const ticks = [0, 1, 2, 3].map((i) => low + ((high - low) * i) / 3);
  return {
    width,
    height,
    points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    ticks: ticks.map((v) => ({ y: y(v), label: formatLnbits(v, locale.value) })),
    left,
    last: { x: x(values.length - 1), y: y(values[values.length - 1]!) },
    bottom: height - bottom,
  };
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap gap-2" role="group" :aria-label="t('quests.board.sort')">
      <UButton
        v-for="option in ['lnbits', 'quests'] as const"
        :key="option"
        size="md"
        :color="by === option ? 'secondary' : 'neutral'"
        :variant="by === option ? 'subtle' : 'outline'"
        :label="t(`quests.board.by.${option}`)"
        @click="by = option"
      />
    </div>

    <p v-if="!rows.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('quests.board.empty') }}
    </p>
    <template v-else>
      <section class="grid gap-6 rounded-lg bg-elevated p-6 sm:grid-cols-3 sm:p-7">
        <div
          v-for="(row, index) in rows.slice(0, 3)"
          :key="row.username"
          class="flex items-center gap-4"
        >
          <WardenMinecraftHead v-if="row.uuid" :uuid="row.uuid" size="lg" />
          <div class="flex min-w-0 flex-col">
            <span class="text-sm font-semibold text-muted">{{
              t(`economy.baltop.place.${index + 1}`)
            }}</span>
            <span class="truncate font-display text-lg font-medium text-highlighted">{{
              row.username
            }}</span>
            <span class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{
                by === 'lnbits'
                  ? formatLnbits(row.lnbits, locale)
                  : t('quests.board.questsCount', { n: row.quests }, row.quests)
              }}
            </span>
          </div>
        </div>
      </section>
      <ol
        v-if="rows.length > 3"
        class="flex flex-col divide-y divide-default rounded-lg bg-elevated"
      >
        <li
          v-for="(row, index) in rows.slice(3)"
          :key="row.username"
          class="flex items-center gap-3.5 px-5 py-2.5"
          :class="row.username === data.me?.username ? 'bg-secondary/10' : ''"
        >
          <span class="w-7 font-semibold text-muted tabular-nums">{{ index + 4 }}</span>
          <WardenMinecraftHead v-if="row.uuid" :uuid="row.uuid" size="sm" />
          <span class="flex-1 font-semibold text-highlighted">{{ row.username }}</span>
          <span class="font-bold text-highlighted tabular-nums">
            {{ by === 'lnbits' ? formatLnbits(row.lnbits, locale) : row.quests }}
          </span>
        </li>
      </ol>
    </template>

    <section class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
        <h3 class="text-lg font-medium text-highlighted">{{ t('quests.how.title') }}</h3>
        <p class="text-muted">{{ t('quests.how.body') }}</p>
        <p class="rounded-md bg-default px-4 py-3 font-display text-highlighted">
          {{ t('quests.how.formula', { k: decimal(data.index.kGlobal) }) }}
        </p>
        <dl class="flex flex-wrap gap-6">
          <div>
            <dt class="text-sm text-muted">{{ t('quests.how.index') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{ formatLnbits(data.index.index, locale) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">{{ t('quests.how.multiplier') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              ×{{ decimal(data.index.kGlobal) }}
            </dd>
          </div>
          <div v-if="data.me">
            <dt class="text-sm text-muted">{{ t('quests.how.bonus') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              +{{ decimal((data.me.kPlayer - 1) * 100, 1) }} %
            </dd>
          </div>
        </dl>
      </div>
      <div class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
        <h3 class="text-lg font-medium text-highlighted">{{ t('quests.how.chart') }}</h3>
        <svg
          v-if="chart"
          :viewBox="`0 0 ${chart.width} ${chart.height}`"
          class="h-auto w-full"
          role="img"
          :aria-label="t('quests.how.chart')"
        >
          <g v-for="tick in chart.ticks" :key="tick.y">
            <line
              :x1="chart.left"
              :x2="chart.width - 8"
              :y1="tick.y"
              :y2="tick.y"
              class="stroke-current text-muted/30"
            />
            <text
              :x="chart.left - 8"
              :y="tick.y + 4"
              text-anchor="end"
              class="fill-current text-xs text-muted"
            >
              {{ tick.label }}
            </text>
          </g>
          <polyline
            :points="chart.points"
            fill="none"
            class="stroke-current text-highlighted"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <circle
            :cx="chart.last.x"
            :cy="chart.last.y"
            r="4"
            class="fill-current text-highlighted"
          />
        </svg>
        <p v-else class="text-muted">{{ t('quests.how.noChart') }}</p>
      </div>
    </section>
  </div>
</template>
