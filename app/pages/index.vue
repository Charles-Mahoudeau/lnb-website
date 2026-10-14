<script setup lang="ts">
definePageMeta({ auth: false });

const { t, locale } = useI18n();

const activities = ['videoGames', 'irlGames', 'events'];

const upcomingEvents = [
  { key: 'werewolf', startsAt: '2026-11-04T19:30:00+01:00' },
  { key: 'minecraft', startsAt: '2026-11-18T19:30:00+01:00' },
];

// Dates are shown in Paris time, whatever the server's time zone.
function formatDate(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale.value, { timeZone: 'Europe/Paris', ...options }).format(
    new Date(iso),
  );
}
</script>

<template>
  <UContainer class="grid min-h-hero items-center gap-10 py-14 lg:grid-cols-11 lg:gap-14">
    <section class="flex min-w-0 flex-col items-start gap-5 lg:col-span-5">
      <UBadge
        color="neutral"
        variant="soft"
        icon="i-lucide-hammer"
        :label="t('home.workInProgress')"
      />
      <h1 class="text-4xl font-bold text-highlighted sm:text-5xl">{{ t('site.name') }}</h1>
      <p class="max-w-sm text-lg text-muted">{{ t('home.lede') }}</p>

      <ul class="grid w-full gap-4 border-t border-default pt-5 sm:grid-cols-3">
        <li v-for="activity in activities" :key="activity" class="flex flex-col gap-0.5">
          <span class="font-display font-medium text-highlighted">
            {{ t(`home.activities.${activity}.title`) }}
          </span>
          <span class="text-sm text-muted">{{ t(`home.activities.${activity}.description`) }}</span>
        </li>
      </ul>

      <div class="flex flex-wrap gap-3">
        <UButton
          to="https://bde-teknantes.fr/"
          target="_blank"
          color="neutral"
          variant="soft"
          icon="i-lucide-globe"
          :label="t('home.studentOffice')"
        />
        <UButton
          to="https://github.com/Charles-Mahoudeau/lnb-website"
          target="_blank"
          color="neutral"
          variant="soft"
          icon="i-simple-icons-github"
          :label="t('home.github')"
        />
      </div>
    </section>

    <section class="flex min-w-0 flex-col gap-3 rounded-lg bg-elevated p-5 lg:col-span-6">
      <h2 class="text-lg font-bold text-highlighted">{{ t('home.upcoming') }}</h2>
      <ul class="flex flex-col gap-2">
        <li
          v-for="event in upcomingEvents"
          :key="event.key"
          class="flex items-center gap-4 rounded-md bg-default py-3 pr-4 pl-3"
        >
          <div
            class="flex w-14 shrink-0 flex-col items-center border-r border-default py-1 tabular-nums"
          >
            <span class="font-display text-2xl leading-none font-bold">
              {{ formatDate(event.startsAt, { day: 'numeric' }) }}
            </span>
            <span class="mt-1 text-sm text-muted">
              {{ formatDate(event.startsAt, { month: 'short' }) }}
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-sans text-base font-bold tracking-normal">
              {{ t(`home.events.${event.key}.title`) }}
            </h3>
            <p class="text-sm text-muted tabular-nums">
              {{
                formatDate(event.startsAt, {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                })
              }}, {{ t(`home.events.${event.key}.where`) }}
            </p>
          </div>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
