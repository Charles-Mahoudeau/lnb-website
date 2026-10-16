<script setup lang="ts">
import type { EventSummary } from '#shared/schemas/events';

// Events grouped by month: one row per event, with its thumbnail (or the flat fallback), the
// date, where it happens and how many places are taken. With `featureNext`, the first event is
// the next one: it opens its month as a larger card, so it's where the eye starts.
const props = defineProps<{
  events: readonly EventSummary[];
  featureNext?: boolean;
  past?: boolean;
}>();

const { t, locale } = useI18n();

function format(iso: string, options: Intl.DateTimeFormatOptions) {
  return formatEventDate(iso, locale.value, options);
}

const months = computed(() => {
  const groups = new Map<string, EventSummary[]>();
  for (const event of props.events) {
    const month = format(event.startsAt, { month: 'long', year: 'numeric' });
    groups.set(month, [...(groups.get(month) ?? []), event]);
  }
  return [...groups];
});

const next = computed(() => (props.featureNext ? props.events[0] : undefined));

function places(event: EventSummary) {
  if (props.past) return t('events.went', { count: event.registered }, event.registered);
  if (event.capacity === null)
    return t('events.attendees.registered', { count: event.registered }, event.registered);
  return t('events.placesTaken', { count: event.registered, capacity: event.capacity });
}

const full = (event: EventSummary) =>
  !props.past && event.capacity !== null && event.registered >= event.capacity;
</script>

<template>
  <div class="flex flex-col gap-8">
    <section v-for="[month, monthEvents] in months" :key="month" class="flex flex-col gap-3">
      <h3 class="text-xl font-bold text-highlighted first-letter:uppercase">{{ month }}</h3>
      <EventsNextCard v-if="next && monthEvents[0] === next" :event="next" />
      <ul class="flex flex-col gap-2">
        <li v-for="event in monthEvents.filter((e) => e !== next)" :key="event.id">
          <NuxtLink
            :to="`/events/${event.id}`"
            class="flex flex-col gap-4 rounded-lg bg-elevated p-2.5 hover:bg-accented/50 sm:flex-row sm:items-center sm:pe-4"
          >
            <!-- Without art, the empty thumbnail would take a whole row on phones. -->
            <div
              class="relative aspect-video shrink-0 overflow-hidden rounded-sm bg-banner-fallback sm:w-40"
              :class="!event.images && 'max-sm:hidden'"
            >
              <img
                v-if="event.images"
                :src="event.images.thumb"
                alt=""
                class="absolute inset-0 size-full object-cover"
              />
            </div>
            <div class="flex min-w-0 flex-1 items-center gap-4">
              <div
                class="flex w-14 shrink-0 flex-col items-center border-r border-default py-1 tabular-nums"
              >
                <span class="font-display text-2xl leading-none font-bold text-secondary">
                  {{ format(event.startsAt, { day: 'numeric' }) }}
                </span>
                <span class="mt-1 text-sm text-muted">
                  {{ format(event.startsAt, { month: 'short' }) }}
                </span>
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="font-bold text-highlighted">{{ event.name }}</h4>
                <p class="text-sm text-muted tabular-nums">
                  {{ format(event.startsAt, { weekday: 'short' }) }},
                  {{ formatEventTime(event.startsAt, locale) }}, {{ event.room.name }}
                </p>
                <p class="flex items-center gap-1.5 text-sm text-muted">
                  <UIcon :name="event.type.icon" class="size-3.5 shrink-0" />
                  {{ eventTypeName(event.type, locale) }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1.5 max-sm:hidden">
                <UBadge
                  v-if="event.cancelled"
                  color="error"
                  variant="subtle"
                  :label="t('events.cancelled')"
                />
                <UBadge
                  v-else-if="event.me === 'registered' && !past"
                  color="success"
                  variant="subtle"
                  :label="t('events.statusRegistered')"
                />
                <UBadge
                  v-else-if="event.me === 'waitlist' && !past"
                  color="warning"
                  variant="subtle"
                  :label="t('events.statusWaitlist')"
                />
                <UBadge
                  v-else-if="full(event)"
                  color="warning"
                  variant="subtle"
                  :label="t('events.full')"
                />
                <span class="text-sm text-muted tabular-nums">{{ places(event) }}</span>
              </div>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
