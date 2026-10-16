<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

// Every published event: upcoming ones as an agenda that opens on the next event, past ones
// latest first. Public, like each event's page.
definePageMeta({ auth: false, flag: 'events' });

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

useSeoMeta({ title: () => t('events.title'), description: () => t('events.lede') });

const { user } = useAuth();

type Tab = 'upcoming' | 'mine' | 'past';
const tab = computed<Tab>({
  get: () => {
    const value = route.query.tab;
    return value === 'past' || (value === 'mine' && user.value) ? value : 'upcoming';
  },
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
});
const tabs = computed<TabsItem[]>(() => [
  { label: t('events.upcoming'), value: 'upcoming' },
  ...(user.value ? [{ label: t('events.mine'), value: 'mine' }] : []),
  { label: t('events.past'), value: 'past' },
]);

// "My events" has its own endpoint: the caller's registrations, upcoming then past.
const list = useEventList(
  () => ({ when: tab.value === 'past' ? 'past' : 'upcoming' }),
  'events-list',
);
const mine = useMyEvents(!!user.value);
await Promise.all([list, mine]);
const data = computed(() =>
  tab.value === 'mine'
    ? { items: [...(mine.data.value?.upcoming ?? []), ...(mine.data.value?.past ?? [])] }
    : list.data.value,
);
const error = computed(() => (tab.value === 'mine' ? mine.error.value : list.error.value));
const status = computed(() => (tab.value === 'mine' ? mine.status.value : list.status.value));

// Filters apply to the loaded tab, so they only offer types that tab has.
const type = ref('all');
const school = ref('all');
watch(tab, () => {
  type.value = 'all';
});

const typeItems = computed(() => {
  const types = new Map<string, string>();
  for (const event of data.value?.items ?? []) {
    types.set(event.type.id, eventTypeName(event.type, locale.value));
  }
  return [
    { label: t('events.allTypes'), value: 'all' },
    ...[...types].map(([value, label]) => ({ label, value })),
  ];
});
const schoolItems = computed(() => [
  { label: t('events.allSchools'), value: 'all' },
  ...Object.entries(SCHOOLS).map(([value, label]) => ({ label, value })),
]);

const events = computed(() =>
  (data.value?.items ?? []).filter(
    (event) =>
      (type.value === 'all' || event.type.id === type.value) &&
      (school.value === 'all' || event.schools.includes(school.value)),
  ),
);
const filtered = computed(() => type.value !== 'all' || school.value !== 'all');
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-10 lg:py-12">
    <div class="flex flex-col gap-5">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('events.title') }}</h1>
      <div class="flex flex-wrap items-center gap-3">
        <UTabs v-model="tab" :items="tabs" :content="false" class="w-auto" />
        <span class="flex-1" />
        <USelect
          v-model="type"
          :items="typeItems"
          :aria-label="t('events.type')"
          class="w-48 max-sm:flex-1"
        />
        <USelect
          v-model="school"
          :items="schoolItems"
          :aria-label="t('events.school')"
          class="w-48 max-sm:flex-1"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('events.loadFailed')"
    />
    <EventsAgenda
      v-else-if="events.length"
      :events="events"
      :feature-next="tab === 'upcoming' && !filtered"
      :past="tab === 'past'"
    />
    <div
      v-else-if="status !== 'pending'"
      class="flex flex-col items-center gap-2 rounded-lg bg-elevated px-5 py-12 text-center"
    >
      <UIcon name="i-lucide-calendar-x" class="size-8 text-muted" />
      <p class="font-semibold text-highlighted">
        {{ filtered ? t('events.noMatch') : t(`events.empty.${tab}`) }}
      </p>
      <p class="text-muted">
        {{ filtered ? t('events.noMatchHint') : t(`events.emptyHint.${tab}`) }}
      </p>
    </div>
  </UContainer>
</template>
