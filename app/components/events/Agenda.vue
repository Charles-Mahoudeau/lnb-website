<script setup lang="ts">
// Upcoming events grouped by month: one row per event, with its banner (or the flat fallback),
// the date and where it happens.
const props = defineProps<{ events: readonly UpcomingEvent[] }>();

const { t, locale } = useI18n();

function format(iso: string, options: Intl.DateTimeFormatOptions) {
  return formatEventDate(iso, locale.value, options);
}

const months = computed(() => {
  const groups = new Map<string, UpcomingEvent[]>();
  for (const event of props.events) {
    const month = format(event.startsAt, { month: 'long', year: 'numeric' });
    groups.set(month, [...(groups.get(month) ?? []), event]);
  }
  return [...groups];
});
</script>

<template>
  <div class="flex flex-col gap-8">
    <section v-for="[month, monthEvents] in months" :key="month" class="flex flex-col gap-3">
      <h3 class="text-xl font-bold text-highlighted first-letter:uppercase">{{ month }}</h3>
      <ul class="flex flex-col gap-2">
        <li
          v-for="event in monthEvents"
          :key="event.key"
          class="flex flex-col gap-4 rounded-lg bg-elevated p-2.5 sm:flex-row sm:items-center sm:pe-4"
        >
          <!-- Without art, the empty thumbnail would take a whole row on phones. -->
          <div
            class="relative aspect-video shrink-0 overflow-hidden rounded-sm bg-banner-fallback sm:w-40"
            :class="!event.banner && 'max-sm:hidden'"
          >
            <img
              v-if="event.banner"
              :src="event.banner"
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
            <div class="min-w-0">
              <h4 class="font-bold text-highlighted">{{ t(`events.${event.key}.title`) }}</h4>
              <p class="text-sm text-muted tabular-nums">
                {{
                  format(event.startsAt, {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hourCycle: 'h23',
                  })
                }}, {{ t(`events.${event.key}.where`) }}
              </p>
              <p v-if="event.attendees" class="text-sm text-muted tabular-nums">
                {{
                  t(
                    'events.attendees.registered',
                    { count: event.attendees.registered },
                    event.attendees.registered,
                  )
                }}
              </p>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
