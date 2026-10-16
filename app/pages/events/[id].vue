<script setup lang="ts">
import { eventIdParams } from '#shared/schemas/events';

// An event's page: the banner with what, when and where, then the description beside the
// registration panel. Public, so the BDE website and social embeds can link here.
definePageMeta({
  auth: false,
  flag: 'events',
  validate: (route) => eventIdParams.safeParse(route.params).success,
});

const { t, locale } = useI18n();
const route = useRoute();
const requestUrl = useRequestURL();

const id = computed(() => String(route.params.id));
const { data: event, error } = await useEvent(id);
if (error.value || !event.value) {
  throw createError({
    status: error.value?.status ?? 404,
    statusText: 'Event not found',
    fatal: true,
  });
}

const when = computed(
  () =>
    event.value &&
    formatEventDate(event.value.startsAt, locale.value, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
);
const banner = computed(() => event.value?.images?.banner);
const embed = computed(() =>
  event.value?.images ? new URL(event.value.images.embed, requestUrl.origin).toString() : undefined,
);

useSeoMeta({
  title: () => event.value?.name,
  description: () => event.value?.summary,
  ogTitle: () => event.value?.name,
  ogDescription: () => event.value?.summary,
  ogType: 'website',
  ogUrl: () => new URL(`/events/${id.value}`, requestUrl.origin).toString(),
  ogImage: () => embed.value,
  ogImageWidth: () => (embed.value ? 1200 : undefined),
  ogImageHeight: () => (embed.value ? 630 : undefined),
  twitterCard: () => (embed.value ? 'summary_large_image' : 'summary'),
  robots: () => (event.value?.hidden ? 'noindex' : undefined),
});
</script>

<template>
  <div v-if="event">
    <section
      class="dark relative isolate flex min-h-80 items-end overflow-hidden bg-banner-fallback"
    >
      <template v-if="banner">
        <img :src="banner" alt="" class="absolute inset-0 -z-1 size-full object-cover" />
        <div
          class="absolute inset-0 -z-1 bg-linear-to-t from-banner from-15% via-banner/70 via-55% to-transparent to-90% lg:bg-linear-to-r lg:from-0% lg:via-banner/75 lg:via-40% lg:to-80%"
        />
      </template>
      <UContainer class="flex w-full flex-col items-start gap-4 py-10 lg:py-14">
        <UBadge
          :label="eventTypeName(event.type, locale)"
          :icon="event.type.icon"
          color="neutral"
          variant="soft"
          class="bg-accented"
        />
        <h1 class="max-w-3xl text-4xl font-bold text-on-banner sm:text-5xl">{{ event.name }}</h1>
        <ul class="flex flex-wrap gap-x-6 gap-y-1.5 text-lg text-on-banner-muted tabular-nums">
          <li class="flex items-center gap-2">
            <UIcon name="i-lucide-calendar" class="size-5 shrink-0" />
            <span class="inline-block first-letter:uppercase">{{ when }}</span>
          </li>
          <li class="flex items-center gap-2">
            <UIcon name="i-lucide-map-pin" class="size-5 shrink-0" />
            <span>{{ event.room.name }}</span>
          </li>
        </ul>
      </UContainer>
    </section>

    <UContainer class="flex flex-col gap-6 py-10 lg:py-12">
      <UAlert
        v-if="event.hidden"
        color="warning"
        variant="subtle"
        icon="i-lucide-eye-off"
        :title="t('events.draftTitle')"
        :description="t('events.draftBody')"
      />
      <UAlert
        v-if="event.cancelled"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :title="t('events.cancelledTitle')"
        :description="t('events.cancelledBody')"
      />

      <div class="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
        <div class="flex min-w-0 flex-col gap-10 lg:col-span-8">
          <section class="flex flex-col gap-4">
            <h2 class="text-2xl font-bold text-highlighted">{{ t('events.about') }}</h2>
            <!-- Rendered on the server from Markdown, without raw HTML: see markdown.ts. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="event-prose max-w-prose" v-html="event.descriptionHtml" />
          </section>
          <section class="flex flex-col gap-4">
            <h2 class="text-2xl font-bold text-highlighted">{{ t('events.details') }}</h2>
            <EventsDetails :event="event" />
          </section>
        </div>
        <EventsRegistrationPanel
          :event="event"
          class="max-lg:order-first lg:sticky lg:top-24 lg:col-span-4"
        />
      </div>
    </UContainer>
  </div>
</template>
