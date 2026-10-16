<script setup lang="ts">
// The home hero: the next event over its banner art, with a scrim from the text side. Without art
// it sits on the flat fallback with scattered activity icons, and only takes the room its text needs. It stays dark in both color modes,
// so it's a `dark` scope: Nuxt UI components and tokens inside take their dark values.
import type { EventSummary } from '#shared/schemas/events';

const props = defineProps<{ event: EventSummary; attendees?: EventAttendees }>();

const { t, locale } = useI18n();
const banner = computed(() => props.event.images?.banner);

const when = computed(() =>
  formatEventDate(props.event.startsAt, locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }),
);
</script>

<template>
  <section
    class="dark relative isolate flex overflow-hidden bg-banner-fallback"
    :class="banner ? 'min-h-hero items-end lg:items-center' : ''"
  >
    <template v-if="banner">
      <img :src="banner" alt="" class="absolute inset-0 -z-1 size-full object-cover" />
      <div
        class="absolute inset-0 -z-1 bg-linear-to-t from-banner from-15% via-banner/70 via-55% to-transparent to-90% lg:bg-linear-to-r lg:from-0% lg:via-banner/75 lg:via-40% lg:to-80%"
      />
    </template>
    <EventsIconScatter v-else class="-z-1" />

    <UContainer
      class="grid w-full gap-8 py-8 lg:grid-cols-12 lg:gap-12 lg:py-14"
      :class="banner ? 'lg:items-end' : 'pt-40 lg:items-center lg:py-28'"
    >
      <div class="flex flex-col items-start gap-5 lg:col-span-7">
        <UBadge
          :label="t('home.nextEvent')"
          icon="i-lucide-calendar"
          color="neutral"
          variant="soft"
          class="bg-accented"
        />
        <h1 class="text-4xl font-bold text-on-banner sm:text-5xl">
          <NuxtLink :to="`/events/${event.id}`" class="hover:underline">{{ event.name }}</NuxtLink>
        </h1>
        <ul class="flex flex-col gap-1.5 text-lg text-on-banner-muted tabular-nums">
          <li class="flex items-center gap-2">
            <UIcon name="i-lucide-calendar" class="size-5 shrink-0" />
            <span class="inline-block first-letter:uppercase">{{ when }}</span>
          </li>
          <li class="flex items-center gap-2">
            <UIcon name="i-lucide-map-pin" class="size-5 shrink-0" />
            <span class="inline-block first-letter:uppercase">{{ eventWhere(event.room) }}</span>
          </li>
        </ul>
        <UButton
          :to="`/events/${event.id}`"
          color="neutral"
          variant="soft"
          :label="t('events.seeEvent')"
        />
      </div>

      <EventsAttendees
        v-if="attendees?.registered"
        :attendees="attendees"
        class="lg:col-span-4 lg:col-start-9"
        :class="!banner && 'ring-8 ring-banner-fallback'"
      />
    </UContainer>
  </section>
</template>
