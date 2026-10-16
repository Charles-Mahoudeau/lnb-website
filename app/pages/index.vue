<script setup lang="ts">
definePageMeta({ auth: false });

const { t } = useI18n();
const { user } = useAuth();
const { isEnabled } = useFlags();

const activities = [
  { key: 'videoGames', icon: 'i-lucide-gamepad-2' },
  { key: 'irlGames', icon: 'i-lucide-dices' },
  { key: 'events', icon: 'i-lucide-calendar' },
];

// The next event gets the hero, the later ones the agenda. Events under way still count, so the
// hero shows tonight's event until it ends.
const showEvents = computed(() => isEnabled('events.home'));
const { data: upcoming } = await useEventList({ when: 'upcoming', limit: 6 }, 'home-events');
const next = computed(() => (showEvents.value ? upcoming.value?.items[0] : undefined));
const later = computed(() => upcoming.value?.items.slice(1) ?? []);

// Warden (Minecraft) is open to some schools only.
const wardenApp = getLinkApp('warden');
const canUseWarden = computed(
  () =>
    isEnabled('warden') &&
    !!wardenApp &&
    !!user.value &&
    canLinkFromSchool(wardenApp, user.value.tenantId),
);
</script>

<template>
  <div>
    <EventsHero v-if="next" :event="next" />

    <UContainer class="grid gap-10 py-12 lg:grid-cols-12 lg:gap-8">
      <section v-if="showEvents" class="flex min-w-0 flex-col gap-5 lg:col-span-8">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 class="text-2xl font-bold text-highlighted sm:text-3xl">{{ t('home.upcoming') }}</h2>
          <ULink to="/events" class="font-semibold text-primary hover:underline">
            {{ t('home.allEvents') }}
          </ULink>
        </div>
        <EventsAgenda v-if="later.length" :events="later" />
        <p v-else class="text-muted">{{ t('home.noLaterEvents') }}</p>
      </section>

      <aside class="flex min-w-0 flex-col gap-4 lg:col-span-4">
        <section class="flex flex-col items-start gap-4 rounded-lg bg-elevated p-5">
          <UBadge
            color="neutral"
            variant="soft"
            icon="i-lucide-hammer"
            :label="t('home.workInProgress')"
          />
          <h2 class="text-xl font-bold text-highlighted">{{ t('site.name') }}</h2>
          <p class="text-muted">{{ t('home.lede') }}</p>
          <ul class="flex flex-col gap-3">
            <li v-for="activity in activities" :key="activity.key" class="flex items-center gap-3">
              <IconTile :icon="activity.icon" />
              <div class="flex flex-col">
                <span class="font-display font-medium text-highlighted">
                  {{ t(`home.activities.${activity.key}.title`) }}
                </span>
                <span class="text-sm text-muted">
                  {{ t(`home.activities.${activity.key}.description`) }}
                </span>
              </div>
            </li>
          </ul>
          <div class="flex flex-wrap gap-3">
            <UButton
              to="https://bde-teknantes.fr/"
              target="_blank"
              color="neutral"
              variant="soft"
              size="lg"
              icon="i-lucide-globe"
              :label="t('home.studentOffice')"
            />
            <UButton
              to="https://github.com/Charles-Mahoudeau/lnb-website"
              target="_blank"
              color="neutral"
              variant="soft"
              size="lg"
              icon="i-simple-icons-github"
              :label="t('home.github')"
            />
          </div>
        </section>

        <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
          <h2 class="text-xl font-bold text-highlighted">{{ t('home.minecraft.title') }}</h2>
          <p class="text-muted">{{ t('home.minecraft.lede') }}</p>
          <NuxtLink to="/minecraft/mod-list" class="group flex items-center gap-3">
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
    </UContainer>
  </div>
</template>
