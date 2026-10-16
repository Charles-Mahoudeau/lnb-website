<script setup lang="ts">
import type { EventView } from '#shared/schemas/events';

// The practical details of an event: when, where, what kind, the price, who can register, and a
// calendar file to add it.
const props = defineProps<{ event: EventView }>();

const { t, locale } = useI18n();

const day = computed(() =>
  formatEventDate(props.event.startsAt, locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }),
);
// An event that ends on another day says so.
const range = computed(() => {
  const sameDay = daysUntil(props.event.endsAt, Date.parse(props.event.startsAt)) === 0;
  const end = sameDay
    ? formatEventTime(props.event.endsAt, locale.value)
    : formatEventDate(props.event.endsAt, locale.value, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
  return t('events.timeRange', { start: formatEventTime(props.event.startsAt, locale.value), end });
});
</script>

<template>
  <ul class="flex flex-col gap-4">
    <li class="flex items-start gap-3">
      <UIcon name="i-lucide-calendar" class="mt-0.5 size-5 shrink-0 text-muted" />
      <div class="flex flex-col tabular-nums">
        <span class="font-semibold text-highlighted first-letter:uppercase">{{ day }}</span>
        <span class="text-muted">{{ range }}</span>
      </div>
    </li>
    <li class="flex items-start gap-3">
      <UIcon name="i-lucide-map-pin" class="mt-0.5 size-5 shrink-0 text-muted" />
      <div class="flex flex-col">
        <span class="font-semibold text-highlighted">{{ event.room.name }}</span>
        <span v-if="event.room.details" class="text-muted">{{ event.room.details }}</span>
      </div>
    </li>
    <li class="flex items-start gap-3">
      <UIcon :name="event.type.icon" class="mt-0.5 size-5 shrink-0 text-muted" />
      <div class="flex flex-col">
        <span class="font-semibold text-highlighted">{{ eventTypeName(event.type, locale) }}</span>
        <span class="text-muted tabular-nums">
          {{ event.price ? t('events.price', { price: event.price }) : t('events.free') }}
        </span>
      </div>
    </li>
    <li class="flex items-start gap-3">
      <UIcon name="i-lucide-graduation-cap" class="mt-0.5 size-5 shrink-0 text-muted" />
      <div class="flex flex-col">
        <span class="font-semibold text-highlighted">
          {{ t('events.openTo', { schools: eventSchools(event.schools, locale) }) }}
        </span>
        <span class="text-muted">{{ t('events.openToHint') }}</span>
      </div>
    </li>
    <li v-if="!event.cancelled" class="flex items-start gap-3">
      <UIcon name="i-lucide-calendar-plus" class="mt-0.5 size-5 shrink-0 text-muted" />
      <ULink
        :to="`/api/events/${event.id}/calendar.ics`"
        external
        download
        class="font-semibold text-primary hover:underline"
      >
        {{ t('events.addToCalendar') }}
      </ULink>
    </li>
  </ul>
</template>
