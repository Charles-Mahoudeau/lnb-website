<script setup lang="ts">
// The time left to vote. It counts down on the viewer's clock and tells the page when it hits zero.
const props = defineProps<{ endsAt: string; now: number }>();

const { t, locale } = useI18n();

const end = computed(() => Date.parse(props.endsAt));
const left = computed(() => Math.max(0, Math.floor((end.value - props.now) / 1000)));
const cells = computed(() => {
  const total = left.value;
  const parts = [
    { key: 'days', value: Math.floor(total / 86400) },
    { key: 'hours', value: Math.floor(total / 3600) % 24 },
    { key: 'minutes', value: Math.floor(total / 60) % 60 },
    { key: 'seconds', value: total % 60 },
  ] as const;
  return parts.filter((part) => part.key !== 'days' || part.value > 0);
});
// Under an hour, the numbers turn to the warning color.
const urgent = computed(() => left.value < 3600);
const endText = computed(() =>
  formatEventDate(props.endsAt, locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }),
);
const spoken = computed(() =>
  cells.value
    .map((cell) => t(`mods.countdown.${cell.key}`, { n: cell.value }, cell.value))
    .join(', '),
);
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-elevated px-5 py-4"
    role="timer"
    :aria-label="t('mods.countdown.label', { time: spoken })"
  >
    <div class="flex min-w-0 flex-col gap-0.5">
      <span class="font-semibold text-highlighted">{{ t('mods.countdown.title') }}</span>
      <span class="text-muted">{{ endText }}</span>
    </div>
    <div class="flex gap-2 tabular-nums" aria-hidden="true">
      <div
        v-for="cell in cells"
        :key="cell.key"
        class="flex min-w-17 flex-col items-center rounded-md bg-accented px-3 py-2"
      >
        <span
          class="font-display text-2xl leading-tight"
          :class="urgent ? 'text-warning' : 'text-highlighted'"
        >
          {{ String(cell.value).padStart(2, '0') }}
        </span>
        <span class="text-xs text-muted">{{ t(`mods.countdown.unit.${cell.key}`) }}</span>
      </div>
    </div>
  </div>
</template>
