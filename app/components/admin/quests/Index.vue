<script setup lang="ts">
// The reward index over 60 days (docs/quests.md): count tiles like the economy overview, the
// index and Kglobal as two charts (each on its own scale), and the nightly log.
const { t, locale } = useI18n();
const { data, error } = await useQuestsAdminIndex();

const decimal = (n: number, digits = 3) =>
  new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
const days = computed(() => data.value?.days ?? []);
const latest = computed(() => days.value.at(-1));
const weekAgo = computed(() => days.value.at(-8));
const capUsed = computed(() => {
  const rows = data.value?.cap ?? [];
  const budget = rows.reduce((sum, row) => sum + (row.budget ?? 0), 0);
  const spent = rows.reduce((sum, row) => sum + row.spent, 0);
  return { budget, spent };
});

function chart(values: number[], band?: [number, number]) {
  if (values.length < 2) return null;
  const width = 600;
  const height = 190;
  const left = 56;
  const top = 10;
  const bottom = 22;
  let low = Math.min(...values, ...(band ?? []));
  let high = Math.max(...values, ...(band ?? []));
  const pad = (high - low) * 0.1 || 1;
  low -= pad;
  high += pad;
  const x = (i: number) => left + (i * (width - left - 8)) / (values.length - 1);
  const y = (v: number) => top + ((high - v) * (height - top - bottom)) / (high - low);
  return {
    width,
    height,
    left,
    points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    ticks: [0, 1, 2, 3].map((i) => {
      const v = low + ((high - low) * i) / 3;
      return { y: y(v), v };
    }),
    band: band ? { y: y(band[1]), h: y(band[0]) - y(band[1]) } : null,
    last: { x: x(values.length - 1), y: y(values.at(-1)!) },
    base: height - 6,
  };
}
const indexChart = computed(() => chart(days.value.map((day) => day.index)));
const kChart = computed(() => chart(days.value.map((day) => day.kGlobal)));
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.quests.loadFailed')"
  />
  <div v-else-if="data" class="flex flex-col gap-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.quests.index.index') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(latest?.index ?? data.preview.index, locale)
        }}</span>
        <span v-if="latest && weekAgo" class="text-sm text-muted tabular-nums">
          {{
            t('admin.quests.index.week', {
              n: decimal((latest.index / weekAgo.index - 1) * 100, 1),
            })
          }}
        </span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">Kglobal</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums"
          >×{{ decimal(latest?.kGlobal ?? 1, 2) }}</span
        >
        <span class="text-sm text-muted">{{
          latest?.fallback ? t('admin.quests.index.fallback') : t('admin.quests.index.damped')
        }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.quests.index.active') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          latest?.activePlayers ?? data.preview.activePlayers
        }}</span>
        <span class="text-sm text-muted">{{ t('admin.quests.index.activeHelp') }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.quests.index.cap') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">
          {{ capUsed.budget ? `${decimal((capUsed.spent / capUsed.budget) * 100, 1)} %` : '—' }}
        </span>
        <span class="text-sm text-muted tabular-nums">
          {{
            t('admin.quests.index.capOf', {
              spent: formatLnbits(capUsed.spent, locale),
              budget: formatLnbits(capUsed.budget, locale),
            })
          }}
        </span>
      </div>
    </div>

    <section
      v-for="(item, key) in { index: indexChart, k: kChart }"
      :key="key"
      class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5"
    >
      <h2 class="text-lg font-medium text-highlighted">
        {{ t(`admin.quests.index.chart.${key}`) }}
      </h2>
      <div v-if="item" class="overflow-x-auto">
        <svg
          :viewBox="`0 0 ${item.width} ${item.height}`"
          role="img"
          :aria-label="t(`admin.quests.index.chart.${key}`)"
          class="w-full min-w-lg"
        >
          <g v-for="tick in item.ticks" :key="tick.y">
            <line
              :x1="item.left"
              :x2="item.width - 8"
              :y1="tick.y"
              :y2="tick.y"
              class="stroke-current text-muted/30"
            />
            <text
              :x="item.left - 8"
              :y="tick.y + 4"
              text-anchor="end"
              class="fill-current text-xs text-muted"
            >
              {{ key === 'k' ? decimal(tick.v, 2) : formatLnbits(tick.v, locale) }}
            </text>
          </g>
          <polyline
            :points="item.points"
            fill="none"
            stroke-width="2"
            stroke-linejoin="round"
            class="stroke-current text-highlighted"
          />
          <circle :cx="item.last.x" :cy="item.last.y" r="4" class="fill-current text-highlighted" />
          <text :x="item.left" :y="item.base" class="fill-current text-xs text-muted">
            {{ days[0]?.day }}
          </text>
          <text
            :x="item.width - 8"
            :y="item.base"
            text-anchor="end"
            class="fill-current text-xs text-muted"
          >
            {{ latest?.day }}
          </text>
        </svg>
      </div>
      <p v-else class="text-muted">{{ t('admin.quests.index.noData') }}</p>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.quests.index.log') }}</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-highlighted">
              <th class="py-2 pr-3 font-semibold">{{ t('admin.quests.index.day') }}</th>
              <th class="py-2 pr-3 text-right font-semibold">
                {{ t('admin.quests.index.active') }}
              </th>
              <th class="py-2 pr-3 text-right font-semibold">
                {{ t('admin.quests.index.median') }}
              </th>
              <th class="py-2 pr-3 text-right font-semibold">Q3</th>
              <th class="py-2 pr-3 text-right font-semibold">{{ t('admin.quests.index.mean') }}</th>
              <th class="py-2 pr-3 text-right font-semibold">
                {{ t('admin.quests.index.index') }}
              </th>
              <th class="py-2 text-right font-semibold">Kglobal</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="day in [...days].reverse().slice(0, 14)" :key="day.day">
              <td class="py-2 pr-3">{{ day.day }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ day.activePlayers }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">
                {{ formatLnbits(day.median, locale) }}
              </td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ formatLnbits(day.q3, locale) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">
                {{ formatLnbits(day.mean, locale) }}
              </td>
              <td class="py-2 pr-3 text-right tabular-nums">
                {{ formatLnbits(day.index, locale) }}
              </td>
              <td class="py-2 text-right tabular-nums">{{ decimal(day.kGlobal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
