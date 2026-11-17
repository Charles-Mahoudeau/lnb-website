<script setup lang="ts">
import type { PlaytimeMe } from '#shared/schemas/playtime';

// The playtime card of /minecraft/account (docs/playtime.md): what the week looks like first, then
// the state, then the allowance. Hours played come first so the card opens on something positive.
const props = defineProps<{ me: PlaytimeMe }>();

const { t, locale } = useI18n();

const band = computed(() => playtimeBand(props.me, locale.value));
const tone = computed(() => PLAYTIME_TONE_CLASSES[band.value.tone]);
const limited = computed(() => props.me.state !== 'unlimited');
// The bar mutes while the allowance isn't running: free time, or a closed week.
const barClass = computed(() =>
  props.me.state === 'free' ? 'bg-dimmed' : PLAYTIME_TONE_CLASSES[band.value.tone].bar,
);

const barLabel = computed(() => {
  switch (props.me.state) {
    case 'counting':
      return t('minecraftAccount.playtime.bar.counting', {
        until: formatPlaytimeClock(props.me.windowEndsAt ?? props.me.resetsAt, locale.value),
      });
    case 'grace':
      return t('minecraftAccount.playtime.bar.grace', {
        until: formatPlaytimeClock(props.me.graceEndsAt ?? props.me.resetsAt, locale.value),
      });
    case 'blocked':
      return t('minecraftAccount.playtime.bar.blocked');
    default:
      return t('minecraftAccount.playtime.bar.free');
  }
});

/** The right-hand reset line, always there: when the allowance starts over. */
const resetLine = computed(() =>
  t('minecraftAccount.playtime.resets', {
    when: formatPlaytimeReset(props.me.resetsAt, locale.value),
  }),
);
/** The left-hand line while grace or a pause is on: when play is back. */
const leftLine = computed(() => {
  if (props.me.state === 'grace' && props.me.graceEndsAt) {
    return t('minecraftAccount.playtime.graceEnds', {
      time: formatPlaytimeClock(props.me.graceEndsAt, locale.value),
    });
  }
  if (props.me.state === 'blocked' && props.me.resumesAt) {
    return t('minecraftAccount.playtime.resumes', {
      when: formatPlaytimeMoment(props.me.resumesAt, locale.value),
    });
  }
  return null;
});

const WEEKDAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 } as const;
/** "Monday to Friday, 09:00 to 17:00", one entry per line of the schedule. */
const hoursText = computed(() => {
  const name = (day: keyof typeof WEEKDAY_INDEX) =>
    // 2024-01-01 was a Monday.
    new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', weekday: 'long' }).format(
      new Date(Date.UTC(2024, 0, 1 + WEEKDAY_INDEX[day])),
    );
  return props.me.hours
    .map((line) => {
      const first = line.days[0]!;
      const last = line.days.at(-1)!;
      const days =
        line.days.length === 1
          ? name(first)
          : line.days.length === 2
            ? new Intl.ListFormat(locale.value, { type: 'conjunction' }).format([
                name(first),
                name(last),
              ])
            : t('minecraftAccount.playtime.dayRange', { from: name(first), to: name(last) });
      const ranges = line.ranges
        .map(([from, to]) => t('minecraftAccount.playtime.timeRange', { from, to }))
        .join(', ');
      return `${days}, ${ranges}`;
    })
    .join(' · ');
});

const lead = computed(() =>
  t('minecraftAccount.playtime.total', {
    time: formatWardenDuration(props.me.totalPlayedSeconds, locale.value),
  }),
);
</script>

<template>
  <section
    class="flex flex-col gap-5 rounded-lg bg-elevated p-6"
    aria-labelledby="minecraft-account-playtime"
  >
    <h2 id="minecraft-account-playtime" class="text-xl font-medium text-highlighted">
      {{ t('minecraftAccount.playtime.title') }}
    </h2>

    <div
      class="flex items-center gap-4 rounded-lg px-5 py-4"
      :class="tone.band"
      data-test="playtime-band"
      :data-tone="band.tone"
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-default/60">
        <UIcon :name="band.icon" class="size-5" :class="tone.text" />
      </span>
      <div class="flex flex-col">
        <span class="font-semibold text-highlighted">
          {{ t(`minecraftAccount.playtime.states.${band.key}.title`) }}
        </span>
        <span class="text-muted">
          {{ t(`minecraftAccount.playtime.states.${band.key}.line`, band.values) }}
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <span class="text-sm font-semibold tracking-wide text-muted uppercase">
        {{ t('minecraftAccount.playtime.played') }}
      </span>
      <span class="font-display text-5xl font-bold text-highlighted tabular-nums">
        {{ formatWardenDuration(me.playedSeconds, locale) }}
      </span>
      <span class="text-muted">{{ lead }}</span>
    </div>

    <div v-if="limited" class="flex flex-col gap-2" data-test="playtime-allowance">
      <div class="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm text-muted">
        <span>{{ barLabel }}</span>
        <span class="font-semibold tabular-nums" :class="me.state === 'free' ? '' : 'text-default'">
          {{ t('minecraftAccount.playtime.percentUsed', { percent: me.percentUsed }) }}
        </span>
      </div>
      <div
        class="h-2.5 overflow-hidden rounded-full bg-accented"
        role="img"
        :aria-label="t('minecraftAccount.playtime.percentUsed', { percent: me.percentUsed })"
      >
        <div
          class="h-full rounded-full"
          :class="barClass"
          :style="{ width: `${me.percentUsed}%` }"
        />
      </div>
      <div class="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-muted tabular-nums">
        <span v-if="leftLine" class="font-semibold text-default">{{ leftLine }}</span>
        <span class="ms-auto text-end">{{ resetLine }}</span>
      </div>
    </div>

    <p v-if="me.mode === 'observe'" class="text-sm text-muted" data-test="playtime-observe">
      {{ t('minecraftAccount.playtime.observe') }}
    </p>
    <p class="text-sm text-muted">
      {{ t('minecraftAccount.playtime.hours') }}
      <span class="text-default">{{ hoursText }}</span>
    </p>
  </section>
</template>
