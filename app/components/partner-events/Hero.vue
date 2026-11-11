<script setup lang="ts">
// The top of a partner event page: the organizer's art under a scrim from the text side, or the
// tinted fallback with the corner mark. Then the title, one paragraph, chips and the organizer's
// links. It stays dark in both color modes, so it's a `dark` scope.
defineProps<{
  title: string;
  lede: string;
  /** The hero art URL, or null for the fallback. */
  art: string | null;
  chips: { icon: string; label: string }[];
  links: { label: string; url: string }[];
}>();
</script>

<template>
  <section class="dark relative isolate overflow-hidden bg-banner-fallback">
    <template v-if="art">
      <img :src="art" alt="" class="absolute inset-0 -z-1 size-full object-cover" />
      <div
        class="absolute inset-0 -z-1 bg-linear-to-t from-banner from-25% via-banner/80 via-60% to-transparent to-95% lg:bg-linear-to-r lg:from-0% lg:via-banner/80 lg:via-45% lg:to-80%"
      />
    </template>
    <EventsArtFallback v-else icon="i-lucide-gamepad-2" size="lg" class="-z-1" />

    <UContainer
      class="flex flex-col items-start gap-5 pb-10 lg:py-16"
      :class="art ? 'pt-40 lg:pt-16' : 'pt-10'"
    >
      <h1 class="max-w-3xl text-4xl font-bold text-on-banner sm:text-5xl">{{ title }}</h1>
      <p class="max-w-prose text-lg text-on-banner-muted">{{ lede }}</p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="chip in chips" :key="chip.label">
          <UBadge
            :icon="chip.icon"
            :label="chip.label"
            color="neutral"
            variant="soft"
            size="lg"
            class="bg-accented"
          />
        </li>
      </ul>
      <ul class="flex flex-wrap gap-x-6 gap-y-2">
        <li v-for="link in links" :key="link.url">
          <ULink
            :to="link.url"
            target="_blank"
            external
            class="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <UIcon name="i-lucide-external-link" class="size-4" />
            {{ link.label }}
          </ULink>
        </li>
      </ul>
    </UContainer>
  </section>
</template>
