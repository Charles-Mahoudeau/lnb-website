<script setup lang="ts">
import type { AnticheatBreakdown } from '#shared/schemas/anticheat';

// The stored breakdown of a score: every criterion with a check, a dash (not available) or a
// cross, then the arithmetic. An override gets one sentence instead. Never recomputed here.
const props = defineProps<{ breakdown: AnticheatBreakdown }>();
const { t } = useI18n();

const ICONS = {
  earned: 'i-lucide-check',
  notEarned: 'i-lucide-x',
  unavailable: 'i-lucide-minus',
} as const;

const override = computed(() => {
  const { path, overrides } = props.breakdown;
  if (path === 'computed') return null;
  const why = overrides[0];
  return t(`admin.anticheat.criteria.path.${path}`, {
    why: why ? t(`admin.anticheat.criteria.overrides.${why}`) : '',
  });
});

const minus = (value: number) => (value < 0 ? `−${String(Math.abs(value))}` : String(value));
</script>

<template>
  <p v-if="override" class="text-muted">{{ override }}</p>
  <div v-else class="flex flex-col gap-3">
    <ul class="flex flex-col divide-y divide-default">
      <li
        v-for="criterion in breakdown.criteria"
        :key="criterion.key"
        class="flex items-center gap-3 py-2"
      >
        <UIcon
          :name="ICONS[criterion.state]"
          class="size-4 shrink-0"
          :class="criterion.state === 'earned' ? 'text-highlighted' : 'text-muted'"
        />
        <span class="grow" :class="{ 'text-muted': criterion.state !== 'earned' }">
          {{ t(`admin.anticheat.criteria.keys.${criterion.key}`) }}
          <span v-if="criterion.state === 'unavailable'" class="text-sm text-muted">
            {{ t('admin.anticheat.criteria.unavailable') }}
          </span>
        </span>
        <span class="tabular-nums" :class="{ 'text-muted': criterion.state !== 'earned' }">
          {{ criterion.state === 'earned' ? `+${criterion.points}` : criterion.points }}
        </span>
      </li>
    </ul>
    <ul v-if="breakdown.penalties.length" class="flex flex-col divide-y divide-default">
      <li
        v-for="penalty in breakdown.penalties"
        :key="penalty.key"
        class="flex items-center gap-3 py-2"
      >
        <UIcon name="i-lucide-minus" class="size-4 shrink-0 text-muted" />
        <span class="grow">{{ t(`admin.anticheat.criteria.penalties.${penalty.key}`) }}</span>
        <span class="tabular-nums">{{ minus(penalty.points) }}</span>
      </li>
    </ul>
    <p class="text-sm text-muted tabular-nums">
      {{
        t('admin.anticheat.criteria.sum', {
          earned: breakdown.earned,
          max: breakdown.availableMax,
          scaled: breakdown.scaled,
          fullMax: breakdown.fullMax,
          penalties: minus(breakdown.penalties.reduce((total, item) => total + item.points, 0)),
          score: breakdown.score ?? '–',
        })
      }}
    </p>
  </div>
</template>
