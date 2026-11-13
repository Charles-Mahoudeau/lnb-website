<script setup lang="ts">
// The quests page (docs/quests.md): the season, the signed-in player's summary, then pill tabs
// for the four families and the leaderboard. Public: signed-out visitors see everything but
// their own progress.
definePageMeta({ auth: false, flag: 'economy.quests' });

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

useSeoMeta({ title: () => t('quests.title'), description: () => t('quests.lede') });

const season = ref<number | undefined>(
  typeof route.query.season === 'string' ? Number(route.query.season) || undefined : undefined,
);
const { data, error, refresh } = await useQuests(season);

const TABS = ['individual', 'server', 'community', 'flash', 'leaderboard'] as const;
type Tab = (typeof TABS)[number];
const tab = computed<Tab>({
  get: () => (TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'individual'),
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
});
const tabItems = computed(() => [
  { value: 'individual', label: t('quests.tabs.individual'), icon: 'i-lucide-user-round' },
  { value: 'server', label: t('quests.tabs.server'), icon: 'i-lucide-trophy' },
  { value: 'community', label: t('quests.tabs.community'), icon: 'i-lucide-users' },
  { value: 'flash', label: t('quests.tabs.flash'), icon: 'i-lucide-zap' },
  { value: 'leaderboard', label: t('quests.tabs.leaderboard'), icon: 'i-lucide-list-ordered' },
]);

const seasonItems = computed(() =>
  (data.value?.seasons ?? []).map((row) => ({
    value: row.number,
    label: row.endedAt
      ? t('quests.season.past', { n: row.number })
      : t('quests.season.current', { n: row.number }),
  })),
);
const seasonModel = computed({
  get: () => data.value?.season.number,
  set: (value) => {
    season.value =
      value === data.value?.seasons.find((row) => !row.endedAt)?.number ? undefined : value;
    void router.replace({ query: { ...route.query, season: season.value } });
  },
});

const ready = computed(
  () => data.value?.me?.completions.filter((completion) => !completion.claimedAt).length ?? 0,
);
const bonus = computed(() =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(
    ((data.value?.me?.kPlayer ?? 1) - 1) * 100,
  ),
);
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-14">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-64 flex-1 flex-col gap-2">
        <h1 class="text-4xl font-bold text-highlighted">{{ t('quests.title') }}</h1>
        <p class="max-w-2xl text-lg text-muted">{{ t('quests.lede') }}</p>
      </div>
      <UFormField v-if="seasonItems.length > 1" :label="t('quests.season.label')" name="season">
        <USelect v-model="seasonModel" :items="seasonItems" class="w-56" />
      </UFormField>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('quests.loadFailed')"
    />

    <template v-else-if="data">
      <section
        v-if="data.me"
        class="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-lg bg-elevated px-6 py-5"
        :aria-label="t('quests.me.label')"
      >
        <div class="flex items-center gap-3">
          <WardenMinecraftHead :uuid="data.me.uuid" />
          <div class="flex flex-col">
            <span class="font-semibold text-highlighted">{{ data.me.username }}</span>
            <span class="text-sm text-muted">{{
              t('quests.season.current', { n: data.season.number })
            }}</span>
          </div>
        </div>
        <dl class="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt class="text-sm text-muted">{{ t('quests.me.done') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{ data.me.done }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">{{ t('quests.me.earned') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{ formatLnbits(data.me.earned, locale) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">{{ t('quests.me.bonus') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              +{{ bonus }} %
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">{{ t('quests.me.ready') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{ ready }}
            </dd>
          </div>
        </dl>
      </section>

      <UTabs v-model="tab" :items="tabItems" variant="pill" :content="false" class="self-start" />

      <QuestsIndividual v-if="tab === 'individual'" :data="data" @claimed="refresh()" />
      <QuestsServer v-else-if="tab === 'server'" :data="data" />
      <QuestsCommunity v-else-if="tab === 'community'" :data="data" />
      <QuestsFlash v-else-if="tab === 'flash'" :data="data" />
      <QuestsLeaderboard v-else :data="data" />
    </template>
  </UContainer>
</template>
