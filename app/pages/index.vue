<script setup lang="ts">
definePageMeta({ auth: false });

const { t } = useI18n();
const { user } = useAuth();
const { isEnabled } = useFlags();

// The next event gets the hero, the later ones the agenda, and without one the intro hero takes
// its place. Events under way still count, so the
// hero shows tonight's event until it ends.
const showEvents = computed(() => isEnabled('events.home'));
const { data: upcoming } = await useEventList(
  { when: 'upcoming', limit: 6, attendees: 'next' },
  'home-events',
);
const next = computed(() => (showEvents.value ? upcoming.value?.items[0] : undefined));
// Who's going, once the next event has registrations: names for signed-in members only.
const nextAttendees = computed<EventAttendees | undefined>(() =>
  next.value && upcoming.value?.nextAttendees
    ? {
        registered: next.value.registered,
        capacity: next.value.capacity ?? undefined,
        people: upcoming.value.nextAttendees,
      }
    : undefined,
);
const later = computed(() => upcoming.value?.items.slice(1) ?? []);
// The last events, so the page isn't empty between seasons.
const { data: past } = await useEventList({ when: 'past', limit: 3 }, 'home-recent');
const recent = computed(() => (showEvents.value ? (past.value?.items ?? []) : []));

// Warden (Minecraft) is open to some schools only.
const wardenApp = getLinkApp('warden');
const canUseWarden = computed(
  () =>
    isEnabled('warden') &&
    !!wardenApp &&
    !!user.value &&
    canLinkFromSchool(wardenApp, user.value.tenantId),
);
const showModList = computed(() => isEnabled('modList'));
// The card is empty without either link, so it goes too.
const showMinecraft = computed(() => showModList.value || canUseWarden.value);
</script>

<template>
  <div>
    <EventsHero v-if="next" :event="next" :attendees="nextAttendees" />
    <HomeIntro v-else />

    <UContainer class="flex flex-col gap-10 py-12">
      <section
        v-if="showEvents && !next"
        class="flex flex-wrap items-center gap-5 rounded-lg bg-elevated p-6"
      >
        <IconTile icon="i-lucide-calendar" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h2 class="text-xl font-bold text-highlighted">{{ t('home.noEvent.title') }}</h2>
          <p class="text-muted">{{ t('home.noEvent.lede') }}</p>
        </div>
      </section>

      <div class="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div v-if="next || recent.length" class="flex min-w-0 flex-col gap-10 lg:col-span-8">
          <section v-if="next" class="flex flex-col gap-5">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="text-2xl font-bold text-highlighted sm:text-3xl">
                {{ t('home.upcoming') }}
              </h2>
              <ULink to="/events" class="font-semibold text-primary hover:underline">
                {{ t('home.allEvents') }}
              </ULink>
            </div>
            <EventsAgenda v-if="later.length" :events="later" />
            <p v-else class="text-muted">{{ t('home.noLaterEvents') }}</p>
          </section>

          <section v-if="recent.length" class="flex flex-col gap-5">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="text-2xl font-bold text-highlighted sm:text-3xl">
                {{ t('home.recent') }}
              </h2>
              <ULink
                :to="{ path: '/events', query: { tab: 'past' } }"
                class="font-semibold text-primary hover:underline"
              >
                {{ t('home.pastEvents') }}
              </ULink>
            </div>
            <EventsAgenda :events="recent" past />
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-4 lg:col-span-4 lg:col-start-9">
          <section class="flex flex-col items-start gap-4 rounded-lg bg-elevated p-5">
            <h2 class="text-xl font-bold text-highlighted">{{ t('site.name') }}</h2>
            <p class="text-muted">{{ t('home.lede') }}</p>
            <ul class="flex flex-wrap gap-2">
              <li v-for="school in SCHOOLS" :key="school">
                <UBadge color="neutral" variant="soft" :label="school" />
              </li>
            </ul>
          </section>

          <section class="flex flex-col items-start gap-4 rounded-lg bg-elevated p-5">
            <h2 class="text-xl font-bold text-highlighted">{{ t('home.studentOffice.title') }}</h2>
            <p class="text-muted">{{ t('home.studentOffice.lede') }}</p>
            <UButton
              to="https://bde-teknantes.fr/"
              target="_blank"
              color="neutral"
              variant="soft"
              size="lg"
              icon="i-lucide-globe"
              :label="t('home.studentOffice.link')"
            />
          </section>

          <section v-if="showMinecraft" class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
            <h2 class="text-xl font-bold text-highlighted">{{ t('home.minecraft.title') }}</h2>
            <p class="text-muted">{{ t('home.minecraft.lede') }}</p>
            <NuxtLink
              v-if="showModList"
              to="/minecraft/mod-list"
              class="group flex items-center gap-3"
            >
              <IconTile icon="i-lucide-puzzle" />
              <span class="flex flex-col">
                <span class="font-semibold text-highlighted group-hover:underline">
                  {{ t('nav.mods') }}
                </span>
                <span class="text-sm text-muted">{{ t('nav.modsDescription') }}</span>
              </span>
            </NuxtLink>
            <NuxtLink
              v-if="canUseWarden"
              to="/minecraft/warden"
              class="group flex items-center gap-3"
            >
              <IconTile icon="i-lucide-pickaxe" />
              <span class="flex flex-col">
                <span class="font-semibold text-highlighted group-hover:underline">
                  {{ t('warden.title') }}
                </span>
                <span class="text-sm text-muted">{{ t('nav.wardenDescription') }}</span>
              </span>
            </NuxtLink>
          </section>
        </aside>
      </div>
    </UContainer>
  </div>
</template>
