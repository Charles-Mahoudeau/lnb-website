<script setup lang="ts">
// The home hero when no event is planned: what the association does, on the flat fallback with
// scattered activity icons, like an event hero without art. Stays dark in both color modes, so it's
// a `dark` scope. The way to register is signing in, so the main button only shows signed out.
const { t } = useI18n();
const { user } = useAuth();
const { isEnabled } = useFlags();
</script>

<template>
  <section class="dark relative isolate flex overflow-hidden bg-banner-fallback">
    <EventsIconScatter class="-z-1" />
    <UContainer class="flex w-full flex-col items-start gap-5 pt-40 pb-10 lg:py-24">
      <h1 class="max-w-2xl text-4xl font-bold text-on-banner sm:text-5xl">
        {{ t('home.intro.title') }}
      </h1>
      <p class="max-w-xl text-lg text-on-banner-muted">{{ t('home.intro.lede') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton
          v-if="!user && isEnabled('signIn')"
          :to="{ path: '/sign-in', query: { redirect: '/' } }"
          :label="t('home.intro.signIn')"
        />
        <UButton
          v-if="isEnabled('events')"
          to="/events"
          color="neutral"
          variant="soft"
          :label="t('home.allEvents')"
        />
      </div>
    </UContainer>
  </section>
</template>
