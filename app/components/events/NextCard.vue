<script setup lang="ts">
import type { EventSummary } from '#shared/schemas/events';

// The next event, opening its month in the agenda: larger, with its art, how soon it is, the
// places taken and a way in. Not a link as a whole: it holds its own links and buttons. Without
// art it drops the image column, rather than showing a large empty block.
const props = defineProps<{ event: EventSummary }>();

const { t, locale } = useI18n();

const to = computed(() => `/events/${props.event.id}`);

const soon = computed(() => {
  if (props.event.cancelled) return t('events.cancelled');
  if (eventPhase(props.event) === 'ongoing') return t('events.happeningNow');
  const days = daysUntil(props.event.startsAt);
  const relative = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(
    days,
    'day',
  );
  return t('events.nextEventIn', { when: relative });
});

const ratio = computed(() =>
  props.event.capacity ? Math.min(props.event.registered / props.event.capacity, 1) : null,
);
</script>

<template>
  <article class="grid overflow-hidden rounded-lg bg-elevated md:grid-cols-12">
    <div
      v-if="event.images"
      class="relative aspect-video bg-banner-fallback md:col-span-7 md:aspect-auto md:min-h-64"
    >
      <img :src="event.images.thumb" alt="" class="absolute inset-0 size-full object-cover" />
    </div>
    <div
      class="flex min-w-0 flex-col items-start gap-4 p-5 sm:p-6"
      :class="event.images ? 'md:col-span-5' : 'md:col-span-12'"
    >
      <UBadge
        :label="soon"
        :icon="event.cancelled ? 'i-lucide-circle-x' : 'i-lucide-calendar-clock'"
        :color="event.cancelled ? 'error' : 'neutral'"
        :variant="event.cancelled ? 'subtle' : 'soft'"
      />
      <div class="flex gap-4">
        <div class="flex w-16 shrink-0 flex-col items-center border-r border-default tabular-nums">
          <span class="font-display text-4xl leading-none font-bold text-secondary">
            {{ formatEventDate(event.startsAt, locale, { day: 'numeric' }) }}
          </span>
          <span class="mt-1 text-muted">
            {{ formatEventDate(event.startsAt, locale, { month: 'short' }) }}
          </span>
        </div>
        <div class="flex min-w-0 flex-col gap-1.5">
          <h3 class="text-2xl font-bold text-highlighted">
            <NuxtLink :to="to" class="hover:underline">{{ event.name }}</NuxtLink>
          </h3>
          <p class="text-muted tabular-nums">
            <span class="first-letter:uppercase">{{
              formatEventDate(event.startsAt, locale, { weekday: 'long' })
            }}</span
            >,
            {{
              t('events.timeRange', {
                start: formatEventTime(event.startsAt, locale),
                end: formatEventTime(event.endsAt, locale),
              })
            }}, {{ event.room.name }}
          </p>
        </div>
      </div>
      <div v-if="ratio !== null && event.capacity" class="flex w-full max-w-xs flex-col gap-1.5">
        <span class="text-sm text-muted tabular-nums">
          {{
            t('events.placesLeft', {
              taken: event.registered,
              capacity: event.capacity,
              left: Math.max(event.capacity - event.registered, 0),
            })
          }}
        </span>
        <UProgress :model-value="ratio * 100" color="neutral" size="sm" />
      </div>
      <p v-else class="text-sm text-muted tabular-nums">
        {{ t('events.attendees.registered', { count: event.registered }, event.registered) }}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UBadge
          v-if="event.me === 'registered'"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :label="t('events.youreRegistered')"
        />
        <UBadge
          v-else-if="event.me === 'waitlist'"
          color="warning"
          variant="subtle"
          icon="i-lucide-hourglass"
          :label="t('events.statusWaitlist')"
        />
        <UButton
          :to="to"
          :label="t('events.seeEvent')"
          :color="event.me ? 'neutral' : 'primary'"
          :variant="event.me ? 'soft' : 'solid'"
        />
      </div>
    </div>
  </article>
</template>
